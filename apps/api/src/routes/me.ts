// Info akun user yang sedang login: paket, kuota, dan pemakaian live.
import { Hono } from "hono";
import { prisma } from "@minipaas/db";
import { requireAuth } from "../middleware/auth.js";
import { limitsFor, normalizePlan } from "../lib/plans.js";
import type { AppEnv } from "../types.js";

export const me = new Hono<AppEnv>();

me.use("*", requireAuth);

// GET /me/usage — paket + kuota + pemakaian resource saat ini milik user.
me.get("/usage", async (c) => {
  const userId = c.get("userId");

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true },
  });
  const plan = normalizePlan(user?.plan);
  const limits = limitsFor(plan);

  // Service milik user (lewat project) → jumlah & yang sedang RUNNING.
  const services = await prisma.service.findMany({
    where: { project: { ownerId: userId } },
    select: { status: true },
  });
  const [projects, instances] = await Promise.all([
    prisma.project.count({ where: { ownerId: userId } }),
    // Replica RUNNING milik user = sumber pemakaian RAM/CPU live.
    prisma.instance.findMany({
      where: {
        status: "RUNNING",
        deployment: { service: { project: { ownerId: userId } } },
      },
      select: { memMb: true, cpuPct: true, metricsAt: true },
    }),
  ]);

  // Angka telemetry basi (>25s tak dilaporkan agent) tidak dihitung.
  const fresh = instances.filter(
    (i) => i.metricsAt && Date.now() - new Date(i.metricsAt).getTime() < 25_000,
  );
  const memMb = Math.round(fresh.reduce((a, i) => a + (i.memMb ?? 0), 0));
  const cpuPct = Math.round(fresh.reduce((a, i) => a + (i.cpuPct ?? 0), 0));

  return c.json({
    plan,
    limits: {
      label: limits.label,
      memoryMb: limits.memoryMb, // per replica; 0 = unlimited
      cpus: limits.cpus, // per replica; 0 = unlimited
      maxReplicas: limits.maxReplicas,
    },
    usage: {
      projects,
      services: services.length,
      runningServices: services.filter((s) => s.status === "RUNNING").length,
      replicasRunning: instances.length,
      memMb,
      cpuPct,
    },
  });
});

export default me;
