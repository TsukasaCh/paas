#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Setup PostgreSQL di VPS IDCloudhost (atau VPS mana pun) untuk Ronaldo Cloud.
#
# DB SENGAJA terpisah dari control plane (EC2): kalau control plane meledak,
# data aman → tinggal arahkan control plane baru ke DB ini. Karena diakses
# lintas internet, akses dikunci: hanya IP control plane, wajib TLS + scram.
#
#   sudo bash deploy/setup-db-idcloudhost.sh --allow=<IP_CONTROL_PLANE> \
#        [--password=xxx] [--db=ronaldocloud] [--user=ronaldocloud] [--port=5432]
#
# --allow  = IP publik / Elastic IP EC2 (WAJIB). Hanya IP ini yang boleh konek.
# Aman diulang (idempoten).
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

DB=ronaldocloud
DBUSER=ronaldocloud
PORT=5432
ALLOW=""
DBPASS=""

for a in "$@"; do
  case "$a" in
    --allow=*)    ALLOW="${a#*=}" ;;
    --db=*)       DB="${a#*=}" ;;
    --user=*)     DBUSER="${a#*=}" ;;
    --password=*) DBPASS="${a#*=}" ;;
    --port=*)     PORT="${a#*=}" ;;
    *) echo "ERROR: argumen tak dikenal: $a"; exit 1 ;;
  esac
done

[ "$(id -u)" -ne 0 ] && { echo "ERROR: jalankan sebagai root (sudo)."; exit 1; }
[ -z "$ALLOW" ] && {
  echo "ERROR: --allow=<IP_CONTROL_PLANE> wajib (IP publik/Elastic IP EC2)."
  echo "       Contoh: sudo bash $0 --allow=12.34.56.78"
  exit 1
}

echo "==> Memasang PostgreSQL"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq postgresql postgresql-contrib openssl ufw

# Lokasi config cluster (berlaku untuk versi PG mana pun).
CONF="$(ls /etc/postgresql/*/main/postgresql.conf 2>/dev/null | head -1 || true)"
[ -z "$CONF" ] && { echo "ERROR: postgresql.conf tak ditemukan."; exit 1; }
HBA="$(dirname "$CONF")/pg_hba.conf"

[ -z "$DBPASS" ] && DBPASS="$(openssl rand -hex 16)"

echo "==> Membuat role & database (idempoten)"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DBUSER}') THEN
    CREATE ROLE ${DBUSER} LOGIN PASSWORD '${DBPASS}';
  ELSE
    ALTER ROLE ${DBUSER} WITH PASSWORD '${DBPASS}';
  END IF;
END \$\$;
SELECT 'CREATE DATABASE ${DB} OWNER ${DBUSER}'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB}')\gexec
SQL

echo "==> listen_addresses, SSL, scram-sha-256"
sed -i "s/^#\?listen_addresses.*/listen_addresses = '*'/" "$CONF"
sed -i "s/^#\?password_encryption.*/password_encryption = scram-sha-256/" "$CONF"
# ssl=on default di paket Debian/Ubuntu (sertifikat snakeoil). Pastikan aktif.
grep -qE "^ssl\s*=\s*on" "$CONF" || sed -i "s/^#\?ssl\s*=.*/ssl = on/" "$CONF"

echo "==> pg_hba: hanya ${ALLOW} boleh masuk, wajib TLS"
RULE="hostssl ${DB} ${DBUSER} ${ALLOW}/32 scram-sha-256"
grep -qF "$RULE" "$HBA" || {
  echo "# Ronaldo Cloud — control plane (hanya IP ini, wajib TLS):" >> "$HBA"
  echo "$RULE" >> "$HBA"
}

echo "==> Firewall: buka ${PORT} HANYA dari ${ALLOW} (SSH tetap terbuka)"
ufw allow 22/tcp >/dev/null
ufw allow from "$ALLOW" to any port "$PORT" proto tcp >/dev/null
ufw --force enable >/dev/null

systemctl restart postgresql

PUBIP="$(hostname -I | awk '{print $1}')"
cat <<DONE

────────────────────────────────────────────────────────────────────────────
✅ SELESAI.

DATABASE_URL untuk .env di CONTROL PLANE (EC2) — salin persis:

DATABASE_URL="postgresql://${DBUSER}:${DBPASS}@${PUBIP}:${PORT}/${DB}?sslmode=require"

  • host ${PUBIP} = IP VPS ini. Kalau di belakang NAT/WireGuard, ganti ke
    IP yang benar-benar dijangkau EC2.
  • Password DB : ${DBPASS}
    SIMPAN sekarang — tidak akan ditampilkan lagi.

Berikutnya di EC2:
  1) tulis DATABASE_URL di atas ke .env
  2) provider Prisma → postgresql, lalu buat tabelnya:
       sed -i 's/provider = \"sqlite\"/provider = \"postgresql\"/' packages/db/prisma/schema.prisma
       pnpm --filter @minipaas/db exec prisma db push
  3) jadwalkan backup (lihat DEPLOY-DATABASE.md §Backup)
────────────────────────────────────────────────────────────────────────────
DONE
