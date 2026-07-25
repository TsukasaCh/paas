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
ExecStart=$REPO/node_modules/.bin/tsx src/index.ts
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
ExecStart=$NODE $REPO/node_modules/.bin/next start -p 3000 -H 127.0.0.1
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
