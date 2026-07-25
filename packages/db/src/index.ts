// Singleton Prisma client agar tidak membuka koneksi berlebih saat hot-reload dev.
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Re-export tipe model Prisma (Service, Deployment, dll.).
export * from "@prisma/client";

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
