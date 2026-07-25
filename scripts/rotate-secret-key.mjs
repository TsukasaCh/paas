/**
 * Rotasi SECRET_KEY: dekripsi tiap secret dengan kunci LAMA, enkripsi ulang
 * dengan kunci BARU. Menutup keterbatasan "ganti kunci = secret lama tak terbaca".
 *
 * Kunci:
 *   OLD_SECRET_KEY  → kunci lama (WAJIB, tidak ada fallback)
 *   SECRET_KEY      → kunci baru (dari .env; atau override NEW_SECRET_KEY)
 *
 * Aman & idempoten: nilai yang sudah pakai kunci baru dilewati; nilai plaintext
 * lama dibiarkan (itu tugas encrypt-secrets.mjs). Bila ada nilai yang TIDAK bisa
 * dibuka oleh kunci lama MAUPUN baru, skrip BERHENTI tanpa menulis apa pun.
 *
 *   OLD_SECRET_KEY=<lama> node scripts/rotate-secret-key.mjs            # dry-run
 *   OLD_SECRET_KEY=<lama> node scripts/rotate-secret-key.mjs --apply    # tulis
 *
 * Alur aman di produksi:
 *   1) set OLD_SECRET_KEY=<kunci lama>, ganti SECRET_KEY di .env ke kunci baru
 *   2) jalankan dry-run → pastikan "0 gagal dibuka"
 *   3) hentikan API sebentar → jalankan --apply → start API dengan SECRET_KEY baru
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Muat .env dari root repo (untuk SECRET_KEY & DATABASE_URL).
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const APPLY = process.argv.includes("--apply");

const OLD_RAW = process.env.OLD_SECRET_KEY ?? "";
const NEW_RAW =
  process.env.NEW_SECRET_KEY ??
  process.env.SECRET_KEY ??
  process.env.INTERNAL_JWT_SECRET ??
  "";

if (!OLD_RAW) {
  console.error("⛔ OLD_SECRET_KEY belum di-set (kunci lama wajib).");
  process.exit(1);
}
if (!NEW_RAW) {
  console.error("⛔ Kunci baru belum di-set (SECRET_KEY di .env atau NEW_SECRET_KEY).");
  process.exit(1);
}
if (OLD_RAW === NEW_RAW) {
  console.error("⛔ Kunci lama & baru sama — tidak ada yang perlu dirotasi.");
  process.exit(1);
}

// Format & kripto WAJIB identik dengan @minipaas/auth (v1:iv:tag:ciphertext).
const keyOf = (raw) => crypto.createHash("sha256").update(raw).digest();
const OLD_KEY = keyOf(OLD_RAW);
const NEW_KEY = keyOf(NEW_RAW);
const isSealed = (v) => typeof v === "string" && v.startsWith("v1:");

function decWith(stored, keyBuf) {
  const [v, ivB, tagB, dataB] = stored.split(":");
  if (v !== "v1") throw new Error("format tidak dikenal");
  const d = crypto.createDecipheriv("aes-256-gcm", keyBuf, Buffer.from(ivB, "base64"));
  d.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([d.update(Buffer.from(dataB, "base64")), d.final()]).toString("utf8");
}
function encWith(plain, keyBuf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyBuf, iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

/**
 * Tentukan aksi untuk satu nilai:
 *   "plain"    → belum terenkripsi (dilewati)
 *   "already"  → sudah pakai kunci baru (dilewati)
 *   { reseal } → berhasil dibuka kunci lama; nilai baru siap ditulis
 *   "stuck"    → tak bisa dibuka kunci lama maupun baru (bahaya)
 */
function plan(value) {
  if (!isSealed(value)) return "plain";
  try {
    return { reseal: encWith(decWith(value, OLD_KEY), NEW_KEY) };
  } catch {
    /* lanjut cek kunci baru */
  }
  try {
    decWith(value, NEW_KEY);
    return "already";
  } catch {
    return "stuck";
  }
}

const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

const targets = [];

for (const ev of await prisma.environmentVariable.findMany()) {
  targets.push({ kind: "env", label: `env "${ev.key}"`, value: ev.value, id: ev.id });
}
for (const u of await prisma.user.findMany({ where: { githubToken: { not: null } } })) {
  targets.push({ kind: "gh", label: `githubToken user ${u.username ?? u.id}`, value: u.githubToken, id: u.id });
}
const dns = await prisma.platformDns.findUnique({ where: { id: "default" } });
if (dns?.apiTokenEnc) {
  targets.push({ kind: "dns", label: "API token Cloudflare", value: dns.apiTokenEnc, id: dns.id });
}

const stats = { reseal: 0, plain: 0, already: 0, stuck: 0 };
const toWrite = [];
const stuck = [];

for (const t of targets) {
  const p = plan(t.value);
  if (p === "plain") stats.plain++;
  else if (p === "already") stats.already++;
  else if (p === "stuck") {
    stats.stuck++;
    stuck.push(t.label);
  } else {
    stats.reseal++;
    toWrite.push({ ...t, next: p.reseal });
  }
}

console.log(`
Ditemukan ${targets.length} secret terenkripsi:
  • perlu dirotasi (kunci lama → baru) : ${stats.reseal}
  • sudah pakai kunci baru            : ${stats.already}
  • masih plaintext (dilewati)        : ${stats.plain}
  • GAGAL dibuka kedua kunci          : ${stats.stuck}`);

if (stats.stuck > 0) {
  console.error(`
⛔ BERHENTI. ${stats.stuck} nilai tak bisa dibuka oleh OLD_SECRET_KEY maupun kunci baru:
${stuck.map((s) => `   - ${s}`).join("\n")}
   Pastikan OLD_SECRET_KEY benar-benar kunci lama. Tidak ada yang ditulis.`);
  await prisma.$disconnect();
  process.exit(2);
}

if (!APPLY) {
  console.log("\nℹ️  Dry-run. Jalankan ulang dengan --apply untuk menulis perubahan.");
  await prisma.$disconnect();
  process.exit(0);
}

for (const w of toWrite) {
  if (w.kind === "env") {
    await prisma.environmentVariable.update({ where: { id: w.id }, data: { value: w.next } });
  } else if (w.kind === "gh") {
    await prisma.user.update({ where: { id: w.id }, data: { githubToken: w.next } });
  } else if (w.kind === "dns") {
    await prisma.platformDns.update({ where: { id: w.id }, data: { apiTokenEnc: w.next } });
  }
}

console.log(`\n✅ ${toWrite.length} secret dienkripsi ulang dengan kunci baru. Pastikan SECRET_KEY di .env sudah kunci baru sebelum start API.`);
await prisma.$disconnect();
