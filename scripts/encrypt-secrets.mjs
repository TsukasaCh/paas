/**
 * Migrasi sekali-jalan: enkripsi secret yang masih plaintext di DB.
 *
 * Aman diulang (idempoten) — nilai yang sudah terenkripsi dilewati.
 * Jalankan SETELAH SECRET_KEY di-set dan SEBELUM menerima user sungguhan.
 *
 *   node scripts/encrypt-secrets.mjs            # laporan saja (dry-run)
 *   node scripts/encrypt-secrets.mjs --apply    # benar-benar menulis
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
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

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

// Sengaja menyalin logika enkripsi (bukan impor TS) agar skrip ini bisa jalan
// tanpa build. Formatnya harus persis sama dengan @minipaas/auth.
function key() {
  const raw = process.env.SECRET_KEY ?? process.env.INTERNAL_JWT_SECRET ?? "";
  if (!raw) {
    console.error("⛔ SECRET_KEY / INTERNAL_JWT_SECRET belum di-set.");
    process.exit(1);
  }
  return crypto.createHash("sha256").update(raw).digest();
}
const isSealed = (v) => typeof v === "string" && v.startsWith("v1:");
function seal(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}

const stats = { env: 0, envSkip: 0, gh: 0, ghSkip: 0 };

for (const ev of await prisma.environmentVariable.findMany()) {
  if (isSealed(ev.value)) {
    stats.envSkip++;
    continue;
  }
  stats.env++;
  if (APPLY) {
    await prisma.environmentVariable.update({
      where: { id: ev.id },
      data: { value: seal(ev.value) },
    });
  }
}

for (const u of await prisma.user.findMany({ where: { githubToken: { not: null } } })) {
  if (isSealed(u.githubToken)) {
    stats.ghSkip++;
    continue;
  }
  stats.gh++;
  if (APPLY) {
    await prisma.user.update({
      where: { id: u.id },
      data: { githubToken: seal(u.githubToken) },
    });
  }
}

console.log(`
Environment variable : ${stats.env} perlu dienkripsi, ${stats.envSkip} sudah aman
GitHub token         : ${stats.gh} perlu dienkripsi, ${stats.ghSkip} sudah aman
${APPLY ? "✅ Perubahan DITULIS ke database." : "ℹ️  Dry-run. Jalankan ulang dengan --apply untuk menulis."}
`);

await prisma.$disconnect();
