# Panduan Menjalankan & Menguji End-to-End

Boilerplate ini sudah **lengkap dan lolos typecheck** (api, worker, web), Prisma client
ter-generate, dan sample app tervalidasi di Node.

## Dua mode runtime deployment
Worker bisa men-deploy dengan salah satu dari:
- **`docker`** (default): `docker build` + `docker run` container. Butuh Docker daemon.
- **`node`**: jalankan app Node sebagai **child process** (clone → `npm install` →
  `node`/`npm start` di port dinamis). **Tanpa Docker.** Set `DEPLOY_RUNTIME=node`.

Runtime `node` sudah **diuji & terbukti jalan** (lihat `worker/scripts/smoke-node.ts`):
```bash
corepack pnpm --filter @minipaas/worker smoke:node
# → [app] listening; HTTP 200; env var ter-inject; SUKSES ✅
```

## Menjalankan TANPA Docker sama sekali
Platform tetap butuh Postgres + Redis. Tanpa Docker, pilih salah satu:
- **Cloud gratis (paling mudah):** DB → [Neon](https://neon.tech), Redis → [Upstash](https://upstash.com).
  Cukup tempel connection string ke `.env` (`DATABASE_URL`, `REDIS_URL`).
- **Instal native:** PostgreSQL + Redis (mis. via installer/winget/WSL).

Lalu:
```bash
# .env: set DEPLOY_RUNTIME=node, DATABASE_URL=..., REDIS_URL=...
corepack pnpm --filter @minipaas/db db:push
corepack pnpm dev
```
Deploy service **App** dari repo Node (yang punya `package.json`/`server.js`) — worker
akan clone, install, dan menjalankannya sebagai proses. (Service tipe **DATABASE**
hanya didukung runtime `docker`.)

---
## Jalur Docker end-to-end (mode default)
Bagian di bawah ini untuk `DEPLOY_RUNTIME=docker` dan butuh Docker Engine aktif.

## Prasyarat
1. **Docker Desktop berjalan** (ikon paus hijau, "Engine running"). Uji cepat:
   ```bash
   docker run --rm hello-world
   ```
2. Salin env & isi kredensial:
   ```bash
   cp .env.example .env
   ```
   Minimal isi: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` (buat OAuth App di
   https://github.com/settings/developers, callback `http://localhost:3000/api/auth/callback/github`),
   `NEXTAUTH_SECRET`, dan `INTERNAL_JWT_SECRET` (string acak apa saja).

## 1. Nyalakan infra + migrasi
```bash
corepack pnpm install            # jika belum
docker compose up -d             # Postgres + Redis
corepack pnpm --filter @minipaas/db db:push
```

## 2. Jalankan semua service
```bash
corepack pnpm dev                # web(3000) + api(4000) + worker paralel
```
Cek sehat:
```bash
curl http://localhost:4000/health     # {"ok":true}
```

## 3. Uji lewat UI (alur lengkap)
1. Buka http://localhost:3000/dashboard → **Login dengan GitHub**.
2. **New Project** → beri nama.
3. **+ Add Service** → tipe **App** → pilih repo (yang berisi `Dockerfile` di root)
   → pilih branch → isi env var → **Buat Service**.
   - Untuk uji cepat: push folder [`examples/hello-app`](examples/hello-app/README.md)
     ke sebuah repo GitHub Anda, lalu pilih repo itu.
4. Klik **Deploy**. Log build/run muncul realtime; status berpindah
   `DEPLOYING → RUNNING`. Worker mencetak port publik di log
   (`http://localhost:<port>`) — buka untuk melihat respons hello-app.
5. Uji **Stop / Restart / Delete** pada baris service.

## 4. (Opsional) Smoke test worker tanpa OAuth
Untuk membuktikan mesin `clone→build→run` tanpa perlu login GitHub, seed satu
Deployment langsung ke DB yang menunjuk repo **lokal** (simple-git bisa clone path
lokal). Contoh dengan Prisma Studio / skrip:

```bash
# jadikan examples/hello-app repo git lokal
cd examples/hello-app && git init -q && git add -A && git commit -qm init && cd ../..
```
Lalu buat Service dengan `repoUrl` = path absolut folder tsb dan `branch=master`,
buat Deployment berstatus QUEUED, dan `enqueueDeployment(id)` — worker akan
memprosesnya. (Alternatif paling sederhana tetap lewat UI di langkah 3.)

## Troubleshooting Docker Desktop (catatan sesi ini)
Di mesin ini, Docker Desktop **4.81.0** crash saat start: helper-socket AF-UNIX
(`Inference manager`, lalu `Secrets Engine`) gagal bind di path `unix://C:/...`
dengan error Windows *"filename/directory syntax is incorrect"* (ERROR_INVALID_NAME),
sebelum engine Linux naik. **Factory reset tidak menyembuhkan** (bukan data korup).

Yang sudah dilakukan pada sesi ini:
- WSL distro `docker-desktop` **di-unregister** (image/volume/container lama terhapus).
- Folder data Docker disisihkan ke `%LOCALAPPDATA%\Docker_old_*`, `%APPDATA%\Docker_old_*`,
  `%APPDATA%\Docker Desktop_old_*` (bisa dihapus bila tak diperlukan).

Saran perbaikan (pilihan Anda):
- **Downgrade** ke Docker Desktop 4.79.x (arsitektur socket berbeda), atau
- Cek **antivirus / security software** yang mungkin memblok pembuatan file socket
  di `%LOCALAPPDATA%\Docker\run`, atau
- Pastikan fitur Windows **"Virtual Machine Platform"** & **WSL** sehat
  (`wsl --update`, lalu `wsl --install` distro bila perlu).
