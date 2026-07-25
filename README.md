# Ronaldo Cloud — PaaS (ronaldocloud.id)

Deploy aplikasi dari repo GitHub atau image Docker Hub, tanpa mengurus infra.
Monorepo: **web** (Next.js), **api** (control plane), dan **agent** (dipasang di VPS).

## Arsitektur

```
                    ┌──────────────────────────────────────┐
                    │              BROWSER                  │
                    │  Next.js — dashboard user & admin     │
                    └───────────────┬──────────────────────┘
                                    │ REST (Bearer) + SSE (log realtime)
                    ┌───────────────▼──────────────────────┐
                    │      apps/api — CONTROL PLANE        │
                    │  auth, project/service, scheduler,   │
                    │  WebSocket /agent, bus log           │
                    └───────┬──────────────────┬───────────┘
                            │ Prisma           │ WebSocket (agent dial-out)
                            ▼                  ▼
                   ┌────────────────┐   ┌─────────────────────────┐
                   │ SQLite/Postgres│   │   agent/ (di VPS)       │
                   └────────────────┘   │  clone/pull → build →   │
                                        │  run → stream log       │
                                        └───────────┬─────────────┘
                                                    ▼
                                        aplikasi user (proses/container)
```

**Kenapa agent, bukan SSH?** Agent yang *dial-out* ke control plane:
tembus NAT/firewall, tak ada port yang perlu dibuka di VPS, dan control plane
tidak menyimpan kredensial SSH. Koneksi pulih otomatis (reconnect + backoff).

### Alur deploy
1. User klik **Deploy** → API cek kepemilikan, lalu **scheduler** memilih node
   yang `ACTIVE` + socket agent terbuka + heartbeat < 60s + kapasitas cukup.
   Tidak ada node tersedia → `503` (user lihat "kapasitas penuh").
2. API buat `Deployment`, kirim **job spec** (self-contained) ke agent lewat WS.
3. Agent meng-clone repo / menarik image, **mengalokasikan port sendiri**,
   menjalankan app, dan **stream log** balik lewat WS.
4. Control plane meneruskan log ke browser lewat **SSE**, lalu menyimpan hasil
   (`RUNNING`/`FAILED`, port, handle) ke DB.

### Node & agent
- Node **lahir dari agent yang join**, bukan diketik admin.
- Admin buat node → dapat **join token** (disimpan sebagai hash, tampil sekali) →
  jalankan di VPS:
  ```bash
  curl -fsSL https://api.ronaldocloud.id/install.sh | sh -s -- \
    --url=wss://api.ronaldocloud.id/agent --token=<token>
  ```
- Agent **melaporkan sendiri** hostname/OS/arch/vCPU/RAM/Docker + telemetry.
- Online/offline **diturunkan dari heartbeat**, bukan tombol. Admin hanya bisa
  **Drain** (tolak job baru) atau **Cabut**.

## Struktur

```
├── apps/web/            # Next.js — landing, auth, dashboard, admin console
├── apps/api/            # Control plane: REST + WS /agent + SSE + scheduler
│   └── src/agent-server.ts
├── agent/               # Agent untuk VPS (bundle 1 file via esbuild)
├── packages/
│   ├── agent-proto/     # Tipe pesan WS agent ↔ control plane
│   ├── auth/            # Token internal web ↔ api (jose)
│   └── db/              # Prisma schema + client
└── examples/hello-app/  # Sample app untuk uji deploy
```

## Menjalankan (dev)
```bash
pnpm install
pnpm --filter @minipaas/db db:push          # SQLite, tanpa install DB
pnpm --filter @minipaas/agent build:bundle  # bundle agent → dist/agent.js

# 3 proses:
pnpm --filter @minipaas/api dev             # :4000 (control plane + WS /agent)
pnpm --filter @minipaas/web dev             # :3000
RC_URL=ws://localhost:4000/agent RC_TOKEN=<token> pnpm --filter @minipaas/agent dev
```
Token didapat dari Admin Console (`/admin/login`) → **Hubungkan Node**.

## Produksi
- Prisma provider → `postgresql`, `DATABASE_URL` ke Postgres
- `AGENT_PUBLIC_URL` → **`wss://`** (TLS wajib), `API_PUBLIC_URL` → `https://…`
- Ganti `ADMIN_USERNAME` / `ADMIN_PASSWORD` bawaan
- Isi `GITHUB_CLIENT_ID/SECRET` bila ingin login & repo privat GitHub

Lihat `TESTING.md` untuk langkah uji end-to-end.

## Reverse proxy & domain
Setiap service dapat subdomain: `<slug>.ronaldocloud.id`. Trafik masuk ke
reverse proxy control plane (`PROXY_PORT`), lalu **ditembuskan lewat koneksi
WebSocket agent** ke aplikasi di VPS — jadi VPS tetap tanpa port terbuka dan
boleh di balik NAT. Request disebar **round-robin** ke seluruh replica RUNNING.

Setup produksi (DNS wildcard, TLS, Postgres): lihat **`DEPLOY-PRODUCTION.md`**.

## Secret
Semua kredensial disimpan **terenkripsi at-rest** (AES-256-GCM, kunci `SECRET_KEY`
dengan fallback `INTERNAL_JWT_SECRET`):

| Data | Cara simpan |
|---|---|
| Environment variable service | terenkripsi; dibuka hanya saat dikirim ke agent & saat pemiliknya membuka Variables |
| `githubToken` user | terenkripsi |
| API token Cloudflare | terenkripsi; tidak pernah dikirim balik ke browser |
| Password user | **bcrypt** (hash satu arah, bukan enkripsi) |
| Join token agent | **SHA-256 hash**; plaintext hanya tampil sekali saat dibuat |

Pembacaan bersifat toleran: nilai lama yang masih plaintext tetap terbaca sampai
dimigrasi. Untuk mengenkripsi data lama:

```bash
node scripts/encrypt-secrets.mjs          # laporan (dry-run)
node scripts/encrypt-secrets.mjs --apply  # tulis
```

> `SECRET_KEY` wajib di-backup. Kalau hilang/berubah, secret lama tidak bisa
> dibuka lagi (env var perlu diisi ulang, GitHub perlu dihubungkan ulang).

## Health check
Agent mengecek tiap replica dengan **TCP connect ke port aplikasi** (proses hidup
≠ aplikasi sehat — bisa hang). Hasilnya ikut heartbeat tiap 5 detik:

- gagal 3× beruntun → `UNHEALTHY` (ada grace 10s setelah start agar app sempat boot)
- tidak dilaporkan agent sama sekali → `FAILED` (proses hilang)
- **hanya replica `RUNNING` yang masuk rotasi proxy** → request tidak pernah
  dikirim ke replica mati
- status service = `RUNNING` selama masih ada ≥1 replica sehat, `FAILED` bila habis

## Belum ada (jujur)
- **WebSocket/SSE milik app user** belum ditembuskan (baru HTTP req/res biasa).
- **Body request di-buffer** di proxy (belum streaming) → upload besar belum ideal.
- **Auto-restart** — replica mati dikeluarkan dari rotasi, tapi belum otomatis
  dihidupkan ulang; perlu Deploy/Restart manual (atau `replicas` cadangan).
- **Rotasi `SECRET_KEY` belum didukung** — mengganti kunci membuat secret lama
  tak terbaca; perlu prosedur re-enkripsi sebelum kunci diputar.
- Sumber **Image/Database belum teruji** (butuh Docker aktif).
- `worker/` sudah **digantikan agent** — tersisa hanya sebagai bus log.
