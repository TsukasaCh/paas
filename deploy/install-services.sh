#!/usr/bin/env bash
#
# Pasang Ronaldo Cloud sebagai layanan systemd (api, web, agent lokal).
# Jalankan dari root repo:
#
#   sudo bash deploy/install-services.sh
#
set -euo pipefail
log() { echo -e "\n\033[1;35m==>\033[0m $*"; }

[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo."; exit 1; }
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[ -f "$REPO/.env" ] || { echo "⛔ $REPO/.env belum ada. Salin dari deploy/env.production.example"; exit 1; }

NODE="$(command -v node)"
PNPM="$(command -v pnpm || echo "$(command -v corepack) pnpm")"

log "Memasang dependency & build ($REPO)"
cd "$REPO"
corepack pnpm install --frozen-lockfile 2>/dev/null || corepack pnpm install

log "Generate Prisma client + migrasi schema"
set -a; . "$REPO/.env"; set +a
corepack pnpm --filter @minipaas/db exec prisma generate
corepack pnpm --filter @minipaas/db exec prisma db push

log "Build agent bundle (dipakai /agent.js & install.sh)"
corepack pnpm --filter @minipaas/agent build:bundle

log "Build web"
corepack pnpm --filter @minipaas/web build

log "Enkripsi secret lama (idempoten)"
node scripts/encrypt-secrets.mjs --apply || true

# Resolusi path binari. pnpm (isolated) menaruh bin di node_modules/.bin
# TIAP PAKET, bukan di root — jadi $REPO/node_modules/.bin/tsx TIDAK ada dan
# systemd gagal exec (203/EXEC). Ambil path per-paket; fallback ke root bila
# layout hoisted.
TSX="$REPO/apps/api/node_modules/.bin/tsx"
[ -x "$TSX" ] || TSX="$REPO/node_modules/.bin/tsx"
NEXT_BIN="$REPO/apps/web/node_modules/.bin/next"
[ -x "$NEXT_BIN" ] || NEXT_BIN="$REPO/node_modules/.bin/next"
[ -x "$TSX" ] || { echo "⛔ tsx tak ditemukan ($TSX). Jalankan pnpm install dulu."; exit 1; }
[ -x "$NEXT_BIN" ] || { echo "⛔ next tak ditemukan ($NEXT_BIN). Build web dulu."; exit 1; }
log "Binari: tsx=$TSX  next=$NEXT_BIN"

# ── systemd: API (control plane + proxy + WS agent) ────────────
cat >/etc/systemd/system/ronaldocloud-api.service <<EOF
[Unit]
Description=Ronaldo Cloud API (control plane, proxy, agent hub)
After=network-online.target postgresql.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO/apps/api
EnvironmentFile=$REPO/.env
Environment=NODE_ENV=production
# Hanya Caddy yang boleh terbuka ke internet.
Environment=BIND_ADDRESS=127.0.0.1
ExecStart=$TSX src/index.ts
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

# ── systemd: Web (dashboard Next.js) ──────────────────────────
cat >/etc/systemd/system/ronaldocloud-web.service <<EOF
[Unit]
Description=Ronaldo Cloud Web (dashboard)
After=network-online.target ronaldocloud-api.service
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$REPO/apps/web
EnvironmentFile=$REPO/.env
Environment=NODE_ENV=production
ExecStart=$NODE $NEXT_BIN start -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

log "Mengaktifkan layanan"
systemctl daemon-reload
systemctl enable --now ronaldocloud-api ronaldocloud-web
sleep 3
systemctl --no-pager --lines=5 status ronaldocloud-api | sed 's/^/    /' || true

log "Selesai. Cek:"
cat <<'EOF'
    systemctl status ronaldocloud-api ronaldocloud-web
    journalctl -u ronaldocloud-api -f
    curl -s localhost:4000/health
EOF
