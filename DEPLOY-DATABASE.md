# Database terpisah — PostgreSQL di VPS (IDCloudhost)

Panduan menaruh **PostgreSQL di VPS sendiri** (mis. IDCloudhost), terpisah dari
control plane di AWS EC2. Susunan ini dipilih supaya *blast radius* kepisah:
control plane meledak → data aman, tinggal arahkan control plane baru ke DB ini.

> Kalau kamu ingin DB di mesin yang sama dengan control plane, abaikan dokumen
> ini — `deploy/bootstrap-ec2.sh` sudah memasang Postgres lokal.

Perkiraan waktu: 15–20 menit.

---

## 0. Sebelum mulai
- [ ] VPS (IDCloudhost) **Ubuntu 22.04/24.04**, punya **IP publik**.
- [ ] **IP publik / Elastic IP control plane (EC2)** sudah diketahui — hanya IP
      ini yang akan diizinkan menyentuh database.
- [ ] Akses SSH root ke VPS.

## 1. Latency — penentu terbesar, jangan dilewati
Control plane menembak DB **beberapa query per request**. Kalau EC2 jauh dari
VPS DB (mis. `us-east-1` ↔ Indonesia), tiap query kena RTT lintas benua →
dashboard terasa lemot.

➡️ **Tempatkan EC2 di region dekat Indonesia**: `ap-southeast-3` (Jakarta) atau
`ap-southeast-1` (Singapura). Ke IDCloudhost tinggal belasan milidetik.

## 2. Cara cepat — pakai skrip
Di **VPS IDCloudhost**, dari root repo (atau salin skripnya saja):

```bash
sudo bash deploy/setup-db-idcloudhost.sh --allow=<IP_PUBLIK_EC2>
```

Skrip ini (idempoten) melakukan semuanya:
- memasang PostgreSQL,
- membuat role & database `ronaldocloud`,
- `listen_addresses='*'`, **SSL on**, **scram-sha-256**,
- `pg_hba.conf`: **hanya IP EC2**, wajib `hostssl`,
- **firewall**: buka `5432` hanya dari IP EC2 (SSH tetap terbuka),
- mencetak **`DATABASE_URL`** siap tempel + password DB (**catat saat itu juga**).

Lanjut ke [§4 (sisi EC2)](#4-sisi-ec2--control-plane).

## 3. Cara manual (kalau ingin paham tiap langkah)
```bash
sudo apt-get update && sudo apt-get install -y postgresql postgresql-contrib ufw

# a. role + database
sudo -u postgres psql -c "CREATE USER ronaldocloud WITH PASSWORD 'PAKAI-PASSWORD-KUAT';"
sudo -u postgres psql -c "CREATE DATABASE ronaldocloud OWNER ronaldocloud;"
```

**b. `postgresql.conf`** (`/etc/postgresql/*/main/postgresql.conf`):
```conf
listen_addresses = '*'
ssl = on                       # default sudah on di paket Ubuntu (snakeoil)
password_encryption = scram-sha-256
```

**c. `pg_hba.conf`** — tambahkan di baris paling bawah (hanya IP EC2, wajib TLS):
```conf
# TYPE     DATABASE       USER          ADDRESS            METHOD
hostssl    ronaldocloud   ronaldocloud  <IP_EC2>/32        scram-sha-256
```

**d. Firewall** — jangan buka `5432` ke publik:
```bash
sudo ufw allow 22/tcp
sudo ufw allow from <IP_EC2> to any port 5432 proto tcp
sudo ufw --force enable
sudo systemctl restart postgresql
```

> **Kenapa `sslmode=require` cukup?** Paket Postgres Ubuntu sudah menyalakan TLS
> dengan sertifikat *snakeoil*, jadi koneksi terenkripsi tanpa setup tambahan.
> `require` mengenkripsi tapi tidak memverifikasi CA. Untuk verifikasi penuh
> (`verify-full`) pasang sertifikat asli (mis. Let's Encrypt) lalu ganti mode.

## 4. Sisi EC2 — control plane
`.env` di EC2:
```
DATABASE_URL="postgresql://ronaldocloud:<PASS>@<IP_VPS_DB>:5432/ronaldocloud?sslmode=require"
```
⚠️ **Wajib `?sslmode=require`** — tanpa itu koneksi ditolak server.

Bootstrap EC2 **tanpa** Postgres lokal (DB kan di VPS lain), lalu buat tabel di
DB remote:
```bash
INSTALL_POSTGRES=no sudo -E bash deploy/bootstrap-ec2.sh
sed -i 's/provider = "sqlite"/provider = "postgresql"/' packages/db/prisma/schema.prisma
pnpm --filter @minipaas/db exec prisma db push
```

Uji koneksi dari EC2:
```bash
psql "postgresql://ronaldocloud:<PASS>@<IP_VPS_DB>:5432/ronaldocloud?sslmode=require" -c "select 1"
```

## 5. Backup — tanggung jawabmu (self-managed ≠ RDS)
Postgres kamu urus sendiri → **tidak ada auto-backup**. Padahal DB inilah inti
rencana pemulihan bencana. Jadwalkan di **VPS DB** (`crontab -e`):
```cron
0 3 * * *  pg_dump "postgresql://ronaldocloud:<PASS>@localhost/ronaldocloud" | gzip > /var/backups/ronaldocloud-$(date +\%F).sql.gz
```
Sangat disarankan **offsite** (S3/rclone) agar tidak hilang bersama VPS-nya:
```bash
rclone copy /var/backups remote:ronaldocloud-backups
```
Restore:
```bash
gunzip -c backup.sql.gz | psql "postgresql://ronaldocloud:<PASS>@localhost/ronaldocloud"
```

## 6. (Opsional) Perkuat: WireGuard
Cara paling aman agar `5432` **tidak pernah** terbuka ke internet: bangun
terowongan **WireGuard** antara EC2 ↔ VPS DB, lalu:
- `listen_addresses` = IP privat WireGuard saja (mis. `10.8.0.1`),
- `pg_hba` mengizinkan hanya subnet WireGuard,
- firewall menutup `5432` dari publik sepenuhnya,
- `DATABASE_URL` memakai IP privat WireGuard.

Lebih ribet, tapi menghilangkan seluruh permukaan serang DB dari internet.

## 7. Recovery kit — yang wajib kamu simpan
Pemulihan penuh butuh **dua** hal, simpan terpisah dari mesin:
1. **DB VPS + backup-nya** (§5).
2. **`SECRET_KEY`** (dari `.env` control plane) — mengunci env var user,
   `githubToken`, & token Cloudflare. DB pulih tapi `SECRET_KEY` hilang =
   data terenkripsi jadi sampah. (Rotasi kunci: `scripts/rotate-secret-key.mjs`.)

Dengan keduanya, pemulihan jadi sepele: **EC2 baru → `git clone` → tempel `.env`
(DATABASE_URL + SECRET_KEY) → `install-services.sh`** → semua user/service hidup
lagi tanpa memindahkan data.

## Troubleshooting
| Gejala | Sebab / obat |
|---|---|
| `no pg_hba.conf entry ... no encryption` | `DATABASE_URL` tanpa `?sslmode=require` |
| `no pg_hba.conf entry for host "x"` | IP EC2 salah di aturan `hostssl`, atau EC2 keluar lewat IP lain |
| `timeout` / `connection refused` | firewall belum izinkan IP EC2, atau `listen_addresses` belum `*` |
| `password authentication failed` | password beda, atau `password_encryption` bukan scram saat user dibuat (buat ulang user) |
| Lemot | EC2 terlalu jauh dari VPS DB — pindah region (§1) |

---

Setelah DB siap, lanjutkan setup control plane & domain di
**[DEPLOY-PRODUCTION.md](DEPLOY-PRODUCTION.md)**.
