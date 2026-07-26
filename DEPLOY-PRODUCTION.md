# Deploy Ronaldo Cloud ke AWS EC2

Panduan untuk **satu EC2** yang menjalankan control plane **dan** agent
sekaligus. Menambah VPS lain nanti tinggal pasang agent-nya saja (§8).

Perkiraan waktu: 30–45 menit.

---

## 0. Sebelum mulai — pastikan tersedia
- [ ] EC2 **Ubuntu 22.04/24.04**, minimal **t3.small** (2 GB RAM)
      → t3.micro (1 GB) bisa, tapi `next build` rawan OOM; skrip bootstrap
      menambahkan swap 2 GB untuk menutupi ini.
- [ ] **Elastic IP** ter-asosiasi (lihat §1 — penting!)
- [ ] Domain kamu (mis. `.live` yang baru dibeli) sudah masuk **Cloudflare**
- [ ] Akses SSH ke instance

---

## 1. Elastic IP — jangan dilewati
IP publik EC2 **berubah setiap kali instance di-stop/start**. Kalau IP berubah,
seluruh record DNS (termasuk semua subdomain user) menunjuk ke alamat yang salah
dan semua aplikasi mati.

```
EC2 Console → Elastic IPs → Allocate → Associate ke instance
```
Catat IP-nya; ini yang dipakai di record DNS & kolom "Target" nanti.

## 2. Security Group
Hanya tiga port. Port aplikasi (3000/4000/8080) **tidak boleh** dibuka — semua
lewat Caddy, dan service-nya sudah di-bind ke `127.0.0.1`.

| Type | Port | Source | Guna |
|---|---|---|---|
| SSH | 22 | **IP kamu saja** | administrasi |
| HTTP | 80 | 0.0.0.0/0 | redirect + verifikasi ACME |
| HTTPS | 443 | 0.0.0.0/0 | dashboard, API, app user |

> Outbound biarkan terbuka — agent melakukan dial-out, dan server perlu
> menghubungi Let's Encrypt, Cloudflare, serta GitHub.

## 3. Rencanakan domain — kamu yang menentukan

Platform memakai **tiga peran domain**. Bebas kamu susun; tidak ada nama yang
dipaksakan. Tiga contoh susunan yang sama-sama sah:

| Peran | Contoh A (subdomain) | Contoh B (domain terpisah) | Contoh C (paling ringkas) |
|---|---|---|---|
| Dashboard | `app.domainmu.live` | `panel.brand.com` | `domainmu.live` |
| API & agent | `api.domainmu.live` | `gateway.lain.io` | `api.domainmu.live` |
| Aplikasi user | `domainmu.live` → `<slug>.domainmu.live` | `apps.brand.com` | `run.domainmu.live` |

> Aplikasi user memakai **wildcard**, jadi sebaiknya berada di level yang tidak
> bentrok dengan dashboard/API. Contoh C aman karena app berada di
> `*.run.domainmu.live`, terpisah dari `domainmu.live` itu sendiri.

**Rekomendasi:** isi "Domain aplikasi" dengan awalan seperti
`app.domainmu.live`. Tiap service otomatis dapat **slug acak dua-kata**
(mis. `swift-otter`), sehingga app tersaji di `swift-otter.app.domainmu.live`
— rapi, tidak bentrok dengan dashboard, dan tidak membocorkan nama service.

### Record DNS yang dibuat manual (hanya dua)
| Type | Name | Content | Proxy |
|---|---|---|---|
| A | domain **dashboard** | `<ELASTIC_IP>` | **DNS only** (abu-abu) |
| A | domain **API** | `<ELASTIC_IP>` | **DNS only** |

> **Kenapa DNS only?** Caddy menerbitkan sertifikat lewat HTTP-01 challenge; itu
> gagal bila trafik di-proxy Cloudflare.

Subdomain aplikasi user **dibuat otomatis** oleh platform — tidak perlu manual (§7).

### Diatur di mana?
| Yang diatur | Tempat | Bisa diubah tanpa deploy ulang? |
|---|---|---|
| Domain aplikasi user | **Admin Console** → Domain & DNS | ✅ langsung berlaku |
| Domain dashboard & API | **Admin Console** (fallback: `.env`) | ✅ untuk perintah instalasi & tautan |
| `NEXTAUTH_URL` | `.env` | ❌ NextAuth membacanya saat proses start |
| Blok domain di Caddy | dihasilkan `scripts/gen-caddyfile.mjs` | perlu `reload caddy` |

## 4. Bootstrap server
```bash
ssh ubuntu@<ELASTIC_IP>
sudo apt-get update && sudo apt-get install -y git
git clone <URL_REPO_KAMU> ronaldocloud && cd ronaldocloud

sudo bash deploy/bootstrap-ec2.sh
```
Skrip ini memasang: swap 2 GB, Node 22, pnpm, Caddy, PostgreSQL, Docker, dan
firewall (22/80/443 saja). Lewati komponen dengan:
`INSTALL_POSTGRES=no INSTALL_DOCKER=no sudo -E bash deploy/bootstrap-ec2.sh`

## 5. Konfigurasi
```bash
cp deploy/env.production.example .env
nano .env          # isi semua <…>
```
> **DB di VPS terpisah** (mis. IDCloudhost)? Jalankan bootstrap dengan
> `INSTALL_POSTGRES=no` dan ikuti **[DEPLOY-DATABASE.md](DEPLOY-DATABASE.md)** —
> lebih tahan bencana (control plane & data terpisah).

Yang wajib:
- `DATABASE_URL` → ambil dari `/root/db-url.txt` (dibuat bootstrap), atau dari
  VPS DB terpisah (lihat DEPLOY-DATABASE.md)
- `SECRET_KEY`, `NEXTAUTH_SECRET`, `INTERNAL_JWT_SECRET` → `openssl rand -hex 32`
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` → jangan pakai default
- Domain: `NEXTAUTH_URL`, `API_PUBLIC_URL`, `AGENT_PUBLIC_URL` (**wss://**)

Lalu ubah provider Prisma ke Postgres:
```bash
sed -i 's/provider = "sqlite"/provider = "postgresql"/' packages/db/prisma/schema.prisma
```

## 6. Pasang layanan + Caddy
```bash
sudo bash deploy/install-services.sh      # install, build, migrasi, systemd

# Caddyfile DIHASILKAN dari domain yang benar-benar dipakai —
# jangan ketik ulang domain secara manual (rawan tidak sinkron).
export ACME_EMAIL="email@kamu"            # untuk notifikasi Let's Encrypt
sudo -E node scripts/gen-caddyfile.mjs -o /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
> Setiap kali domain diubah di Admin Console, jalankan ulang dua perintah di
> atas agar Caddy ikut menyesuaikan.

Verifikasi:
```bash
systemctl status ronaldocloud-api ronaldocloud-web caddy
curl -s localhost:4000/health             # {"ok":true}
curl -sI https://<domain-dashboard> | head -1   # HTTP/2 200
```

## 7. Sambungkan Cloudflare (subdomain otomatis)
1. Cloudflare → **My Profile → API Tokens → Create Token**
   → template *Edit zone DNS* → **Zone Resources: batasi ke zone kamu saja**
2. Salin **Zone ID** dari halaman Overview zone tersebut.
3. Buka `https://<domain-dashboard>/admin/login` → masuk pakai `ADMIN_USERNAME`.
4. Panel **Domain & DNS** → isi:
   - **Domain aplikasi** — domain untuk app user (jadi `<slug>.<domain-ini>`)
   - **Domain platform** — dashboard & API (boleh dikosongkan → pakai `.env`)
   - Zone ID + API Token
   - Target record: `<ELASTIC_IP>`
   - **Tes koneksi** → harus hijau → centang **Aktif** → Simpan.

Sejak ini setiap service baru otomatis mendapat record subdomainnya sendiri, dan
perintah instalasi agent otomatis memakai domain yang kamu isi di sini.

## 8. Daftarkan node (agent)
Agent bisa di EC2 yang sama maupun VPS lain.

1. Admin Console → **Hubungkan Node** → beri nama → salin perintahnya.
2. Jalankan di server target:
   ```bash
   curl -fsSL https://<domain-api>/install.sh | sudo sh -s -- \
     --url=wss://<domain-api>/agent --token=<token>
   ```
3. Node muncul **Online** beserta spesifikasi yang dilaporkan agent sendiri.

> VPS agent **tidak perlu membuka port apa pun** — agent dial-out, dan trafik
> user ditembuskan balik lewat koneksi itu.

## 9. Uji sebelum dibuka untuk umum
```bash
# di server, dari root repo
API_URL=http://localhost:4000 \
WEB_URL=http://localhost:3000 \
PROXY_URL=http://localhost:8080 \
node scripts/uat.mjs
```
Target: **0 FAIL**. Suite ini membuat user & service sementara lalu
membersihkannya sendiri.

---

## Checklist go-live
- [ ] Elastic IP ter-asosiasi
- [ ] Security Group: 22 (IP sendiri), 80, 443 — **bukan** 3000/4000/8080
- [ ] `BIND_ADDRESS=127.0.0.1` di `.env`
- [ ] Provider Prisma = `postgresql`, `prisma db push` sukses
- [ ] `SECRET_KEY` **di-backup terpisah** (hilang = semua secret tak terbaca)
- [ ] `ADMIN_PASSWORD` bukan default
- [ ] `AGENT_PUBLIC_URL` memakai `wss://`
- [ ] `node scripts/encrypt-secrets.mjs --apply` sudah dijalankan
- [ ] Sertifikat terbit (`curl -sI https://<domain-dashboard>`)
- [ ] Panel Domain & DNS: Tes koneksi hijau
- [ ] Minimal 1 node Online
- [ ] `scripts/uat.mjs` → 0 FAIL
- [ ] Backup DB terjadwal (lihat bawah)

## Operasional
```bash
# Log
journalctl -u ronaldocloud-api -f
journalctl -u ronaldocloud-agent -f

# Restart
sudo systemctl restart ronaldocloud-api ronaldocloud-web

# Update kode
cd ~/ronaldocloud && git pull
sudo bash deploy/install-services.sh      # aman diulang

# Backup DB (jadwalkan via cron)
pg_dump "$DATABASE_URL" | gzip > ~/backup-$(date +%F).sql.gz
```

## Batas yang diketahui
- **Trafik app melewati control plane** (tunnel WS). Sederhana & tembus NAT,
  tapi EC2 ini jadi jalur data tunggal — perhatikan bandwidth & jadikan
  kandidat pertama untuk di-scale.
- **Sumber Docker Image/Database belum teruji end-to-end** (Docker tidak bisa
  dijalankan di mesin pengembangan). Uji dengan satu service percobaan dulu
  sebelum diandalkan.
- **Multi-node lintas VPS** baru diuji dengan satu agent.

### Sudah didukung
- **WebSocket & SSE app user** ditembuskan lewat tunnel agent (dua arah).
- **Upload besar di-stream** (tidak lagi di-buffer di memori control plane).
- **Rotasi `SECRET_KEY`** — `scripts/rotate-secret-key.mjs` (lihat README).
  Backup `SECRET_KEY` tetap wajib.
- Satu join token = satu agent. Token yang sama dipakai di mesin kedua kini
  **ditolak** dengan pesan jelas (dulu diam-diam saling memutus koneksi) —
  buat node baru untuk tiap mesin.
