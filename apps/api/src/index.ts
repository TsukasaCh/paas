/**
 * Entry point backend API (Hono).
 * Menyediakan REST untuk dashboard, proxy GitHub, penerima webhook, dan SSE log.
 */
import "./load-env.js"; // WAJIB paling atas — memuat .env sebelum modul lain.

import { readFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { AppEnv } from "./types.js";
import projects from "./routes/projects.js";
import github from "./routes/github.js";
import webhooks from "./routes/webhooks.js";
import logs from "./routes/logs.js";
import admin from "./routes/admin.js";
import me from "./routes/me.js";
import { attachAgentServer } from "./agent-server.js";
import { startProxyServer, slugFromHost } from "./proxy-server.js";
import { getAppDomain } from "./lib/dns.js";
import { prisma } from "@minipaas/db";

const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.NEXTAUTH_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Gerbang on-demand TLS untuk Caddy (`tls { on_demand }` → `ask`).
 *
 * Caddy menanyakan "boleh terbitkan sertifikat untuk domain ini?" sebelum
 * meminta ke Let's Encrypt. TANPA gerbang ini siapa pun bisa mengarahkan
 * domainnya ke IP kita dan memaksa penerbitan sertifikat sampai kena rate
 * limit. Jawab 200 hanya untuk host yang benar-benar kita layani.
 */
app.get("/internal/tls-check", async (c) => {
  const host = (c.req.query("domain") ?? "").toLowerCase();
  if (!host) return c.text("domain wajib", 400);

  const domain = await getAppDomain();
  // Domain platform sendiri (dashboard/api) ditangani blok Caddy terpisah.
  if (host === domain) return c.text("ok", 200);

  const slug = slugFromHost(host, domain);
  if (!slug) return c.text("bukan domain kami", 404);

  const svc = await prisma.service.findUnique({
    where: { slug },
    select: { id: true },
  });
  return svc ? c.text("ok", 200) : c.text("slug tidak terdaftar", 404);
});

// ── Distribusi agent ───────────────────────────────────────────
// Bundle agent: satu file JS mandiri (esbuild), tak butuh node_modules di VPS.
const AGENT_BUNDLE = resolvePath(
  dirname(fileURLToPath(import.meta.url)),
  "../../../agent/dist/agent.js",
);

app.get("/agent.js", async (c) => {
  try {
    const code = await readFile(AGENT_BUNDLE, "utf8");
    return c.text(code, 200, { "content-type": "application/javascript" });
  } catch {
    return c.text(
      "// Bundle agent belum dibuat. Jalankan: pnpm --filter @minipaas/agent build:bundle",
      503,
    );
  }
});

// Skrip instalasi agent (publik) — dipakai lewat: curl … | sh -s -- --url= --token=
app.get("/install.sh", (c) => {
  const base = process.env.API_PUBLIC_URL ?? "http://localhost:4000";
  return c.text(
    `#!/bin/sh
# Ronaldo Cloud — pemasang agent
set -e
URL=""; TOKEN=""
for arg in "$@"; do
  case $arg in
    --url=*) URL="\${arg#*=}" ;;
    --token=*) TOKEN="\${arg#*=}" ;;
  esac
done
[ -z "$TOKEN" ] && { echo "ERROR: --token wajib diisi"; exit 1; }
[ -z "$URL" ] && URL="ws://localhost:4000/agent"

echo "==> Menyiapkan node (agent + Docker + Nixpacks)"
if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: jalankan sebagai root — contoh: curl … | sudo sh -s -- --url=… --token=…"
  exit 1
fi

if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  command -v curl >/dev/null 2>&1 || { apt-get update -qq; apt-get install -y -qq curl ca-certificates; }
  command -v git  >/dev/null 2>&1 || { apt-get update -qq; apt-get install -y -qq git; }
  if ! command -v node >/dev/null 2>&1; then
    echo "==> Memasang Node.js 20"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y -qq nodejs
  fi
else
  command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js belum ada & tak bisa auto-install (bukan sistem apt)"; exit 1; }
  command -v git  >/dev/null 2>&1 || echo "PERINGATAN: git belum ada — deploy dari repo akan gagal"
fi

# Docker — jalankan app user TERISOLASI dalam container
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Memasang Docker"
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# Nixpacks — build repo tanpa Dockerfile (auto-deteksi bahasa, ala Railway)
if ! command -v nixpacks >/dev/null 2>&1; then
  echo "==> Memasang Nixpacks"
  curl -fsSL https://nixpacks.com/install.sh | bash
fi

INSTALL_DIR=/opt/ronaldocloud-agent
mkdir -p "$INSTALL_DIR"

echo "==> Mengunduh agent"
curl -fsSL "${base}/agent.js" -o "$INSTALL_DIR/agent.js"

if command -v systemctl >/dev/null 2>&1; then
  cat >/etc/systemd/system/ronaldocloud-agent.service <<EOF
[Unit]
Description=Ronaldo Cloud Agent
After=network-online.target

[Service]
Environment=RC_URL=$URL
Environment=RC_TOKEN=$TOKEN
ExecStart=$(command -v node) $INSTALL_DIR/agent.js
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable --now ronaldocloud-agent
  echo "==> Agent aktif. Cek: systemctl status ronaldocloud-agent"
else
  echo "==> systemd tidak ada. Jalankan manual:"
  echo "    RC_URL=$URL RC_TOKEN=$TOKEN node $INSTALL_DIR/agent.js"
fi
`,
    200,
    { "content-type": "text/x-shellscript" },
  );
});

// Router /projects & /github melindungi dirinya sendiri via requireAuth
// (dipasang di dalam masing-masing router agar path root `/projects` ikut terlindungi).
app.route("/projects", projects);
app.route("/github", github);
app.route("/admin", admin);
app.route("/me", me);
// Webhook diverifikasi lewat HMAC signature; logs SSE lewat token query param.
app.route("/webhooks", webhooks);
app.route("/logs", logs);

const port = Number(process.env.PORT ?? 4000);
// Di produksi WAJIB "127.0.0.1": hanya reverse proxy (Caddy) yang boleh
// terbuka ke internet. Kalau bind ke 0.0.0.0, port ini bisa diakses langsung
// dari luar dan melewati TLS.
const bind = process.env.BIND_ADDRESS ?? "0.0.0.0";
const server = serve({ fetch: app.fetch, port, hostname: bind });

// Agent (di VPS) dial-out ke sini lewat WebSocket /agent.
attachAgentServer(server as unknown as import("node:http").Server);

// Reverse proxy publik: <slug>.<APP_DOMAIN> → app user (lewat tunnel agent).
startProxyServer();

console.log(`[api] listening on http://localhost:${port}`);
