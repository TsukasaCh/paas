#!/usr/bin/env bash
#
# Update CEPAT Ronaldo Cloud: git pull + rebuild web + restart layanan.
# Dipakai untuk perubahan kode biasa (web/api). TIDAK menjalankan migrasi
# schema Prisma atau membangun ulang bundle agent.
#
#   sudo bash deploy/update.sh
#
# Untuk perubahan schema DB, dependency berat, atau agent → pakai:
#   sudo bash deploy/install-services.sh
#
set -euo pipefail
log() { echo -e "\n\033[1;35m==>\033[0m $*"; }
[ "$(id -u)" -eq 0 ] || { echo "Jalankan dengan sudo: sudo bash deploy/update.sh"; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# 1) Simpan editan lokal (mis. provider=postgresql di schema.prisma) sebelum pull,
#    lalu kembalikan setelahnya — supaya `git pull` tidak pernah bentrok.
STASHED=0
if ! git diff --quiet || ! git diff --cached --quiet; then
  log "Menyimpan perubahan lokal (git stash)"
  git stash push -u -m "update.sh autostash" >/dev/null
  STASHED=1
fi

log "Menarik kode terbaru dari origin"
git pull --ff-only

if [ "$STASHED" -eq 1 ]; then
  log "Mengembalikan perubahan lokal (git stash pop)"
  if ! git stash pop; then
    echo "⛔ Konflik saat mengembalikan perubahan lokal. Selesaikan manual, lalu ulangi."
    exit 1
  fi
fi

# 2) Sinkron dependency bila lockfile berubah (aman diulang, cepat bila tak berubah).
log "Sinkron dependency"
corepack pnpm install --frozen-lockfile 2>/dev/null || corepack pnpm install

# 3) Build web dengan service web dimatikan dulu:
#    - membebaskan RAM (cegah OOM `next build` di mesin 2 GB → penyebab CSS "hilang"),
#    - melepas file .next yang sedang dipakai proses lama.
#    Seluruh skrip berjalan sebagai root, jadi tak ada masalah kepemilikan .next.
log "Menghentikan web sementara untuk build"
systemctl stop ronaldocloud-web || true

log "Build web"
corepack pnpm --filter @minipaas/web build

# Samakan kepemilikan .next ke user pemanggil agar build manual (non-sudo)
# berikutnya tidak kena EACCES.
if [ -n "${SUDO_USER:-}" ]; then
  chown -R "$SUDO_USER":"$SUDO_USER" "$REPO/apps/web/.next" 2>/dev/null || true
fi

# 4) API berjalan via tsx (tanpa build) → cukup restart untuk memuat kode baru.
log "Restart layanan (api + web)"
systemctl restart ronaldocloud-api ronaldocloud-web

sleep 2
echo "    api: $(systemctl is-active ronaldocloud-api)  web: $(systemctl is-active ronaldocloud-web)"
log "Selesai → https://ronaldocloud.id"
