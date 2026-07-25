/**
 * Seed akun operator & user uji.
 * Password diambil dari env — TIDAK di-hardcode di repo.
 *
 *   SEED_USER_USERNAME=... SEED_USER_PASSWORD=... node scripts/seed-users.mjs
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const username = process.env.SEED_USER_USERNAME;
const password = process.env.SEED_USER_PASSWORD;
const email = process.env.SEED_USER_EMAIL ?? `${username}@ronaldocloud.id`;
const name = process.env.SEED_USER_NAME ?? username;

if (!username || !password) {
  console.error("SEED_USER_USERNAME dan SEED_USER_PASSWORD wajib di-set");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const user = await prisma.user.upsert({
  where: { username },
  update: { passwordHash, email, name, role: "USER" },
  create: { username, email, name, passwordHash, role: "USER" },
});

console.log(`✔ user siap: ${user.username} (${user.email})`);
await prisma.$disconnect();
