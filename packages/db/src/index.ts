// Singleton Prisma client agar tidak membuka koneksi berlebih saat hot-reload dev.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export tipe model Prisma (Service, Deployment, dll.).
export * from "@prisma/client";

// ── Password helpers (bcrypt) ─────────────────────────────────
// Dipusatkan di sini karena @minipaas/db sudah bergantung ke bcryptjs;
// dipakai bersama oleh web (register) & api (ganti password).
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ── Konstanta status ──────────────────────────────────────────
// Status disimpan sebagai String di DB (schema portable SQLite/Postgres),
// jadi kita sediakan const + tipe union sebagai pengganti enum Prisma.
export const ServiceType = { APP: "APP", DATABASE: "DATABASE" } as const;
export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

export const ServiceStatus = {
  IDLE: "IDLE",
  DEPLOYING: "DEPLOYING",
  RUNNING: "RUNNING",
  FAILED: "FAILED",
  STOPPED: "STOPPED",
} as const;
export type ServiceStatus = (typeof ServiceStatus)[keyof typeof ServiceStatus];

export const DeploymentStatus = {
  QUEUED: "QUEUED",
  BUILDING: "BUILDING",
  DEPLOYING: "DEPLOYING",
  RUNNING: "RUNNING",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;
export type DeploymentStatus =
  (typeof DeploymentStatus)[keyof typeof DeploymentStatus];
