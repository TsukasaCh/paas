/**
 * Susun Caddyfile dari konfigurasi yang BENAR-BENAR dipakai.
 *
 * Sumber kebenaran: setelan Admin Console (tabel PlatformDns); bila kosong,
 * jatuh ke .env. Dengan begitu Caddy tidak pernah bertentangan dengan domain
 * yang diatur admin — tak ada lagi domain yang diketik ulang secara manual.
 *
 *   node scripts/gen-caddyfile.mjs                 # cetak ke layar
 *   node scripts/gen-caddyfile.mjs > Caddyfile     # simpan
 *   sudo node scripts/gen-caddyfile.mjs -o /etc/caddy/Caddyfile && sudo systemctl reload caddy
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

// Muat .env dari root repo.
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const strip = (u) => (u ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});
const dns = await prisma.platformDns.findUnique({ where: { id: "default" } }).catch(() => null);
await prisma.$disconnect().catch(() => {});

const appDomain = dns?.domain?.trim() || process.env.APP_DOMAIN || "";
const dashboard = dns?.dashboardDomain?.trim() || strip(process.env.NEXTAUTH_URL);
const api = dns?.apiDomain?.trim() || strip(process.env.API_PUBLIC_URL);
const email = process.env.ACME_EMAIL || process.env.ADMIN_EMAIL || "";
const proxyPort = process.env.PROXY_PORT || "8080";

const missing = [];
if (!dashboard) missing.push("domain dashboard (Admin Console atau NEXTAUTH_URL)");
if (!api) missing.push("domain API (Admin Console atau API_PUBLIC_URL)");
if (!appDomain) missing.push("domain aplikasi (Admin Console atau APP_DOMAIN)");
if (missing.length) {
  console.error("⛔ Belum lengkap:\n  - " + missing.join("\n  - "));
  process.exit(1);
}

const out = `# Dihasilkan oleh scripts/gen-caddyfile.mjs — jangan diedit manual.
# Ubah domain lewat Admin Console → Domain & DNS, lalu jalankan ulang skrip ini.
{
${email ? `\temail ${email}\n` : "\t# email <alamat@kamu>   # notifikasi Let's Encrypt (disarankan)\n"}\
\ton_demand_tls {
\t\t# Gerbang: hanya subdomain yang benar-benar terdaftar yang boleh
\t\t# menerbitkan sertifikat. Tanpa ini, siapa pun bisa mengarahkan
\t\t# domainnya ke IP ini dan menghabiskan rate limit Let's Encrypt.
\t\task http://127.0.0.1:${process.env.PORT || 4000}/internal/tls-check
\t}
}

# ── Dashboard ────────────────────────────────────────────────
${dashboard} {
\tencode zstd gzip
\treverse_proxy 127.0.0.1:3000
}

# ── API + WebSocket agent ────────────────────────────────────
${api} {
\tencode zstd gzip
\treverse_proxy 127.0.0.1:${process.env.PORT || 4000} {
\t\tflush_interval -1   # SSE (log realtime) tidak boleh di-buffer
\t}
}

# ── Aplikasi user: <slug>.${appDomain} ───────────────────────
*.${appDomain} {
\ttls {
\t\ton_demand
\t}
\tencode zstd gzip
\treverse_proxy 127.0.0.1:${proxyPort} {
\t\tflush_interval -1
\t}
}
`;

const oIdx = process.argv.indexOf("-o");
if (oIdx !== -1 && process.argv[oIdx + 1]) {
  fs.writeFileSync(process.argv[oIdx + 1], out);
  console.error(`✅ Ditulis ke ${process.argv[oIdx + 1]}`);
  console.error(`   dashboard=${dashboard}  api=${api}  app=*.${appDomain}`);
} else {
  process.stdout.write(out);
}
