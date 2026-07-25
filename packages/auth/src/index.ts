/**
 * Token internal antar-service (web → api).
 *
 * Session NextAuth secara default berupa JWE terenkripsi yang sulit diverifikasi
 * dari backend terpisah. Jadi kita cetak JWT ringan (HS256) yang ditandatangani
 * dengan secret bersama; web mencetaknya di callback `session`, api memverifikasi.
 *
 * Dipakai kedua sisi lewat package workspace @minipaas/auth agar logikanya satu.
 */
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// ── Enkripsi secret at-rest (AES-256-GCM) ─────────────────────
// Untuk kredensial berbahaya yang harus disimpan di DB, mis. API token
// Cloudflare. Kunci dari SECRET_KEY (fallback INTERNAL_JWT_SECRET).
// Format tersimpan: v1:<iv-b64>:<tag-b64>:<ciphertext-b64>
//
// Sengaja ditaruh sefile dengan index: paket ini dipakai api (NodeNext, butuh
// ekstensi .js) DAN web (webpack Next, tak memetakan .js→.ts) — import relatif
// antar-file akan pecah di salah satunya.
function secretBoxKey(): Buffer {
  const raw = process.env.SECRET_KEY ?? process.env.INTERNAL_JWT_SECRET ?? "";
  if (!raw) {
    throw new Error(
      "SECRET_KEY / INTERNAL_JWT_SECRET belum di-set — tidak bisa mengenkripsi secret",
    );
  }
  return crypto.createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", secretBoxKey(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [
    "v1",
    iv.toString("base64"),
    c.getAuthTag().toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

export function decryptSecret(stored: string): string {
  const [v, ivB, tagB, dataB] = stored.split(":");
  if (v !== "v1") throw new Error("Format secret tidak dikenal");
  const d = crypto.createDecipheriv(
    "aes-256-gcm",
    secretBoxKey(),
    Buffer.from(ivB, "base64"),
  );
  d.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([d.update(Buffer.from(dataB, "base64")), d.final()]).toString(
    "utf8",
  );
}

/** Tampilkan sebagian saja untuk UI: "abcd…wxyz". */
export function maskSecret(plain: string): string {
  if (plain.length <= 8) return "••••";
  return `${plain.slice(0, 4)}…${plain.slice(-4)}`;
}

/** true bila nilai sudah dalam bentuk terenkripsi. */
export function isSealed(value: string): boolean {
  return typeof value === "string" && value.startsWith("v1:");
}

/**
 * Enkripsi untuk disimpan. Sudah terenkripsi → biarkan (idempoten, aman
 * dipanggil dua kali).
 */
export function sealSecret(plain: string): string {
  return isSealed(plain) ? plain : encryptSecret(plain);
}

/**
 * Dekripsi untuk dipakai. SENGAJA toleran terhadap nilai lama yang masih
 * plaintext (dari sebelum enkripsi diberlakukan) supaya data existing tidak
 * rusak — nilai lama dikembalikan apa adanya sampai ter-migrasi.
 */
export function openSecret(stored: string): string;
export function openSecret(stored: string | null | undefined): string | null;
export function openSecret(stored: string | null | undefined): string | null {
  if (stored == null) return null;
  if (!isSealed(stored)) return stored; // legacy plaintext
  try {
    return decryptSecret(stored);
  } catch {
    // Kunci berubah / data korup — jangan bocorkan ciphertext ke pemakai.
    return null;
  }
}

function secretKey(): Uint8Array {
  const secret =
    process.env.INTERNAL_JWT_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (!secret) {
    throw new Error(
      "INTERNAL_JWT_SECRET / NEXTAUTH_SECRET belum di-set — token tidak bisa ditandatangani",
    );
  }
  return new TextEncoder().encode(secret);
}

export interface ApiTokenPayload {
  userId: string;
  login?: string;
  role?: string; // "USER" | "ADMIN"
}

/** Cetak token internal berumur pendek (default 1 jam). */
export async function signApiToken(
  payload: ApiTokenPayload,
  expiresIn: string = "1h",
): Promise<string> {
  return new SignJWT({ login: payload.login, role: payload.role ?? "USER" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secretKey());
}

/** Verifikasi token internal; melempar error bila tidak valid/kadaluwarsa. */
export async function verifyApiToken(token: string): Promise<ApiTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey());
  return {
    userId: payload.sub as string,
    login: (payload.login as string | undefined) ?? undefined,
    role: (payload.role as string | undefined) ?? "USER",
  };
}
