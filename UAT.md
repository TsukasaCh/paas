# UAT — Ronaldo Cloud

Suite otomatis: **`node scripts/uat.mjs`** (butuh API, web, dan minimal satu
agent berjalan). Menguji jalur nyata lewat HTTP + DB, bukan mock.

Hasil terakhir: **38 PASS · 0 FAIL** (dijalankan 2× berturut-turut, konsisten).
Runtime deploy saat uji: **node** — Docker Desktop rusak di mesin ini.

## Kredensial

Tidak ada kredensial yang ditulis di repo. Suite membacanya dari environment:

| Peran | Masuk lewat | Sumber kredensial |
|---|---|---|
| Operator | `/admin/login` | `ADMIN_USERNAME` / `ADMIN_PASSWORD` (dari `.env`) |
| User | `/login` | `UAT_USER` / `UAT_PASS` (akun uji yang sudah ada) |

Contoh menjalankan: `UAT_USER=akunuji UAT_PASS=… node scripts/uat.mjs`.
Password user disimpan **bcrypt**; password operator dibaca dari `.env`.

## Cakupan (38 skenario)

**Infrastruktur** — API sehat · Web sehat · bundle agent tersaji di `/agent.js`

**Autentikasi** — registrasi user baru · tolak username/email duplikat (409) ·
tolak password lemah (400) · password tersimpan bcrypt · login via **username** ·
login via **email** · tolak password salah · login admin · tolak admin salah

**Otorisasi** — tanpa token → 401 · user biasa akses API admin → 403 ·
admin → 200 · **isolasi antar-user**: user lain akses service orang → 403

**Node & Agent** — node online terdeteksi · agent melaporkan spesifikasi sendiri
(hostname, vCPU, RAM)

**Project & Service** — buat project · buat service dari link repo ·
slug subdomain dibuat otomatis

**Deployment** — deploy diterima (202) · service jadi RUNNING · **2 replica**
berjalan di port berbeda

**Domain & Load Balancing** — akses via `<slug>.<domain>` · **round-robin
5/5 antar replica** · environment variable ter-inject · domain tak dikenal → 404

**Metrics** — tersedia saat running · **per replica, dilaporkan agent**
(CPU/memori/uptime)

**Health Check & Auto-Heal** — replica dibunuh paksa → **trafik tetap 200**
(10/10) · **auto-restart memulihkan replica** (`restarts=1`)

**Lifecycle** — stop (202) · service jadi STOPPED · proxy balas 503 ·
hapus service · benar-benar hilang dari DB

## Bug yang ditemukan UAT (semua sudah diperbaiki)
1. **Replica berbagi direktori kerja** → replica ke-2 menimpa clone replica
   pertama (`1/2 replica`). Fix: workDir per-replica.
2. **Kapasitas node bocor** → instance rilis lama tak pernah ditandai berhenti,
   terus dihitung RUNNING. Fix: rilis baru menghentikan instance lama.
3. **Metrics diukur di control plane** → di produksi selalu gagal (proses ada di
   VPS), atau membaca PID proses lain. Fix: agent yang melapor.
4. **Stop → service jadi FAILED** → instance yang sengaja dihentikan divonis mati
   oleh health check. Fix: tandai STOPPED saat aksi stop; health check tidak
   menimpa status STOPPED.
5. **Domain tak dikenal → 503** (seolah app-nya ada tapi mati). Fix: bedakan
   "slug tidak terdaftar" (404) dari "ada tapi tidak jalan" (503).
6. **Celah 502 saat replica mati** → ada jeda beberapa detik sebelum health check
   sadar; request yang jatuh ke replica mati gagal. Fix: proxy **retry ke replica
   lain** bila koneksi gagal sebelum response mulai mengalir.
7. Simpan posisi canvas memakai state basi · "Tes koneksi" DNS menimpa isian form.

> Catatan: 5 "kegagalan" pertama pada run awal ternyata **bug di harness UAT**,
> bukan aplikasi — `fetch()` Node (undici) melarang penyetelan header `Host`,
> sehingga proxy tak pernah menerima subdomain. Harness diganti ke `node:http`.

## Belum diuji / batas yang diketahui
| Hal | Status |
|---|---|
| Deploy dari **Docker Image / Database** | ⛔ belum diuji — Docker Desktop rusak di mesin ini |
| **Pembuatan record DNS Cloudflare (jalur sukses)** | ⛔ belum diuji — butuh API token asli. Jalur gagal sudah diuji (error asli CF `6003`/`9106`) |
| WebSocket/SSE milik app user lewat proxy | ⛔ belum didukung (baru HTTP req/res) |
| Upload besar | body masih di-buffer, belum streaming |
| Multi-node sungguhan | baru diuji 1 agent; penyebaran replica antar-node belum diuji dengan >1 VPS |
| Secret user (env var, `githubToken`) | masih plaintext di DB |
| Beban/konkurensi | belum ada uji beban |
