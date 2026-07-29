// Info & pengaturan akun user yang sedang login: profil, password, paket,
// kuota, pemakaian live, dan hapus akun.
import { Hono } from "hono";
import { prisma, hashPassword, verifyPassword } from "@minipaas/db";
import { requireAuth } from "../middleware/auth.js";
import { limitsFor, normalizePlan } from "../lib/plans.js";
import { enqueueAction } from "../lib/queue.js";
import { removeServiceDns } from "../lib/dns.js";
import type { AppEnv } from "../types.js";

export const me = new Hono<AppEnv>();

me.use("*", requireAuth);

// GET /me — profil ringkas user yang sedang login.
me.get("/", async (c) => {
  const userId = c.get("userId");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      role: true,
      plan: true,
      githubLogin: true,
      passwordHash: true,
      createdAt: true,
    },
  });
  if (!user) return c.json({ error: "User tidak ditemukan" }, 404);
  const { passwordHash, ...safe } = user;
  return c.json({ ...safe, plan: normalizePlan(user.plan), hasPassword: !!passwordHash });
});

// PATCH /me — ubah profil (nama, username).
me.patch("/", async (c) => {
  const userId = c.get("userId");
  const b = await c.req.json().catch(() => ({}) as any);
  const data: Record<string, unknown> = {};

  if (typeof b.name === "string") {
    const name = b.name.trim().slice(0, 60);
    if (!name) return c.json({ error: "Nama tidak boleh kosong." }, 400);
    data.name = name;
  }
  if (typeof b.username === "string") {
    const username = b.username.trim();
    if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username))
      return c.json({ error: "Username 3–32 karakter, hanya huruf/angka/._-" }, 400);
    const taken = await prisma.user.findFirst({
      where: { username, NOT: { id: userId } },
    });
    if (taken) return c.json({ error: "Username sudah dipakai." }, 409);
    data.username = username;
  }

  if (Object.keys(data).length === 0)
    return c.json({ error: "Tidak ada perubahan." }, 400);

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, username: true, email: true },
  });
  return c.json({ ok: true, user });
});

// POST /me/password — ganti password (verifikasi password lama).
me.post("/password", async (c) => {
  const userId = c.get("userId");
  const { currentPassword, newPassword } = await c.req.json().catch(() => ({}) as any);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return c.json({ error: "User tidak ditemukan" }, 404);
  if (!user.passwordHash)
    return c.json(
      { error: "Akun ini masuk lewat GitHub — password tidak berlaku." },
      400,
    );
  if (typeof newPassword !== "string" || newPassword.length < 8)
    return c.json({ error: "Password baru minimal 8 karakter." }, 400);

  const ok = await verifyPassword(String(currentPassword ?? ""), user.passwordHash);
  if (!ok) return c.json({ error: "Password saat ini salah." }, 400);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
  });
  return c.json({ ok: true });
});

// DELETE /me — hapus akun + seluruh project/service miliknya.
// Bersihkan container + subdomain tiap service dulu, lalu hapus user
// (cascade DB: User → Project → Service → Deployment/Instance/EnvVar).
me.delete("/", async (c) => {
  const userId = c.get("userId");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return c.json({ error: "User tidak ditemukan" }, 404);
  if (user.role === "ADMIN")
    return c.json({ error: "Akun admin tidak bisa dihapus dari sini." }, 400);

  const services = await prisma.service.findMany({
    where: { project: { ownerId: userId } },
    select: { id: true, dnsRecordId: true },
  });
  for (const svc of services) {
    await enqueueAction("cleanup", svc.id).catch(() => {});
    await removeServiceDns(svc.dnsRecordId).catch(() => {});
  }
  await prisma.user.delete({ where: { id: userId } });
  return c.json({ ok: true });
});

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
