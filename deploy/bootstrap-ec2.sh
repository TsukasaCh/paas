#!/usr/bin/env bash
#
# Bootstrap EC2 untuk Ronaldo Cloud (control plane + agent di satu instance).
# Diuji untuk Ubuntu 22.04/24.04 (AMI Ubuntu). Jalankan sebagai root:
#
#   sudo bash deploy/bootstrap-ec2.sh
#
set -euo pipefail

log() { echo -e "\n\033[1;35m==>\033[0m $*"; }

[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo."; exit 1; }

log "Memperbarui paket dasar"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release ufw

# ── Swap ──────────────────────────────────────────────────────
# EC2 t3.micro/small (1–2 GB RAM) sering kehabisan memori saat `npm install`
# atau `next build` → proses dibunuh OOM killer tanpa pesan jelas.
if ! swapon --show | grep -q .; then
  log "Membuat swap 2 GB (mencegah OOM saat build)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
else
  log "Swap sudah ada — dilewati"
fi

# ── Node.js 22 ────────────────────────────────────────────────
if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  log "Memasang Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
log "Node $(node -v), npm $(npm -v)"

log "Mengaktifkan pnpm via corepack"
corepack enable
corepack prepare pnpm@9.7.0 --activate >/dev/null 2>&1 || true

# ── Caddy (TLS otomatis) ──────────────────────────────────────
if ! command -v caddy >/dev/null; then
  log "Memasang Caddy"
  apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -qq
  apt-get install -y -qq caddy
fi

# ── PostgreSQL (opsional; lewati bila pakai RDS) ───────────────
if [ "${INSTALL_POSTGRES:-yes}" = "yes" ] && ! command -v psql >/dev/null; then
  log "Memasang PostgreSQL"
  apt-get install -y -qq postgresql postgresql-contrib
  DBPASS="$(openssl rand -hex 16)"
  sudo -u postgres psql -qc "CREATE USER ronaldocloud WITH PASSWORD '${DBPASS}';" || true
  sudo -u postgres psql -qc "CREATE DATABASE ronaldocloud OWNER ronaldocloud;" || true
  echo "DATABASE_URL=\"postgresql://ronaldocloud:${DBPASS}@localhost:5432/ronaldocloud\"" >/root/db-url.txt
  chmod 600 /root/db-url.txt
  log "DATABASE_URL disimpan di /root/db-url.txt — salin ke .env"
fi

# ── Docker (opsional; wajib bila mau sumber Image/Database) ────
if [ "${INSTALL_DOCKER:-yes}" = "yes" ] && ! command -v docker >/dev/null; then
  log "Memasang Docker"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    >/etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io
  systemctl enable --now docker
fi

# ── Nixpacks (auto-build repo tanpa Dockerfile, ala Railway) ──
# Dipakai agent saat runtime=docker & repo tak punya Dockerfile.
if [ "${INSTALL_DOCKER:-yes}" = "yes" ] && ! command -v nixpacks >/dev/null; then
  log "Memasang Nixpacks"
  curl -fsSL https://nixpacks.com/install.sh | bash
fi

# ── Firewall ──────────────────────────────────────────────────
# Hanya SSH + HTTP/HTTPS. Port aplikasi (3000/4000/8080) TIDAK dibuka —
# semuanya lewat Caddy. Security Group EC2 juga harus disetel sama.
log "Menyetel firewall (22, 80, 443 saja)"
ufw allow 22/tcp >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
ufw status numbered | sed 's/^/    /'

log "Selesai. Langkah berikutnya:"
cat <<'EOF'
    1. Clone repo & isi .env (lihat deploy/env.production.example)
    2. sudo bash deploy/install-services.sh
    3. Salin deploy/Caddyfile ke /etc/caddy/Caddyfile lalu: systemctl reload caddy
EOF
