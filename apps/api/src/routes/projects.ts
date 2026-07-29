// CRUD Project & Service + trigger deploy.
// `userId` sudah diverifikasi oleh middleware requireAuth (Bearer token internal).
import { uniqueSlug } from "../lib/slug.js";
import { Hono } from "hono";
import { prisma, DeploymentStatus } from "@minipaas/db";
import { enqueueDeployment, enqueueAction } from "../lib/queue.js";
import { requireAuth } from "../middleware/auth.js";
import { sealSecret, openSecret } from "@minipaas/auth";
import { pickNodesForReplicas } from "../lib/scheduler.js";
import { ensureServiceDns, removeServiceDns, publicUrlFor } from "../lib/dns.js";
import type { AppEnv } from "../types.js";

export const projects = new Hono<AppEnv>();

// Semua route di bawah ini butuh sesi user.
projects.use("*", requireAuth);

// Pastikan project milik user; kembalikan project atau null.
async function ownedProject(projectId: string, userId: string) {
  return prisma.project.findFirst({ where: { id: projectId, ownerId: userId } });
}

/** Slug subdomain acak & ramah dibaca (mis. "swift-otter"), dijamin unik. */
function makeSlug(): Promise<string> {
  return uniqueSlug(
    async (slug) => !!(await prisma.service.findUnique({ where: { slug } })),
  );
}

// Pastikan service milik user (lewat project-nya).
async function ownedService(serviceId: string, userId: string) {
  return prisma.service.findFirst({
    where: { id: serviceId, project: { ownerId: userId } },
  });
}

/**
 * Buat Deployment + satu Instance per replica, masing-masing sudah dipetakan
 * ke node. Mengembalikan { error } bila kapasitas tidak cukup.
 */
async function createDeployment(service: {
  id: string;
  branch: string | null;
  replicas: number;
}) {
  const want = Math.max(1, service.replicas ?? 1);
  const nodes = await pickNodesForReplicas(want);
  if (!nodes.length) {
    return { error: "Kapasitas server sedang penuh. Coba lagi beberapa saat lagi." };
  }

  const deployment = await prisma.deployment.create({
    data: {
      serviceId: service.id,
      status: DeploymentStatus.QUEUED,
      branch: service.branch,
      nodeId: nodes[0].id,
      instances: {
        create: nodes.map((n, i) => ({ replicaIndex: i, nodeId: n.id })),
      },
    },
  });
  return deployment;
}

// GET /projects — daftar project milik user beserta service-nya.
projects.get("/", async (c) => {
  const ownerId = c.get("userId");
  const data = await prisma.project.findMany({
    where: { ownerId },
    include: {
      services: {
        include: { deployments: { orderBy: { createdAt: "desc" }, take: 1 } },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return c.json(data);
});

// POST /projects — buat project baru.
projects.post("/", async (c) => {
  const ownerId = c.get("userId");
  const { name } = await c.req.json();
  const project = await prisma.project.create({ data: { name, ownerId } });
  return c.json(project, 201);
});

// POST /projects/:id/services — tambah service (APP atau DATABASE).
projects.post("/:id/services", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  if (!(await ownedProject(projectId, userId)))
    return c.json({ error: "Forbidden" }, 403);

  const body = await c.req.json();
  const service = await prisma.service.create({
    data: {
      projectId,
      slug: await makeSlug(),
      name: body.name,
      type: body.type ?? "APP",
      source: body.source ?? "GITHUB", // "GITHUB" | "IMAGE"
      repoFullName: body.repoFullName,
      repoUrl: body.repoUrl,
      branch: body.branch ?? "main",
      containerPort: body.containerPort ?? 3000,
      image: body.image, // image registry (source=IMAGE) / DATABASE
      envVars: body.envVars
        ? {
            // Nilai env var kerap berisi rahasia (password DB, API key) →
            // simpan terenkripsi, bukan plaintext.
            create: body.envVars.map((e: { key: string; value: string }) => ({
              key: e.key,
              value: sealSecret(e.value ?? ""),
            })),
          }
        : undefined,
    },
    include: { envVars: true },
  });

  // Buat subdomain otomatis (best-effort; gagal DNS tak membatalkan service).
  await ensureServiceDns(service.id, service.slug);
  return c.json(service, 201);
});

// GET /services/:id — detail service + riwayat deployment + env vars.
projects.get("/services/:id", async (c) => {
  const userId = c.get("userId");
  const serviceId = c.req.param("id");
  if (!(await ownedService(serviceId, userId)))
    return c.json({ error: "Forbidden" }, 403);

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: {
      envVars: { orderBy: { key: "asc" } },
      project: { select: { id: true, name: true } },
      deployments: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          node: { select: { name: true, region: true } },
          instances: {
            orderBy: { replicaIndex: "asc" },
            include: { node: { select: { name: true, region: true } } },
          },
        },
      },
    },
  });
  if (!service) return c.json({ error: "Not found" }, 404);
  // URL publik dihitung server agar ikut domain yang diatur admin.
  return c.json({
    ...service,
    // Env var tersimpan terenkripsi; dibuka hanya untuk pemilik service.
    envVars: service.envVars.map((e) => ({ ...e, value: openSecret(e.value) ?? "" })),
    url: await publicUrlFor(service.slug),
  });
});

/**
 * GET /services/:id/metrics — telemetry per replica.
 *
 * Angkanya DILAPORKAN AGENT lewat heartbeat, bukan diukur di sini: proses ada
 * di mesin agent, jadi mengukur dari control plane akan salah (atau membaca
 * proses lain yang PID-nya kebetulan sama).
 */
const METRICS_STALE_MS = 20_000;

projects.get("/services/:id/metrics", async (c) => {
  const userId = c.get("userId");
  const serviceId = c.req.param("id");
  if (!(await ownedService(serviceId, userId)))
    return c.json({ error: "Forbidden" }, 403);

  const dep = await prisma.deployment.findFirst({
    where: { serviceId, status: "RUNNING" },
    orderBy: { createdAt: "desc" },
    include: {
      instances: {
        orderBy: { replicaIndex: "asc" },
        include: { node: { select: { name: true, region: true } } },
      },
    },
  });
  if (!dep) return c.json({ running: false, replicas: [] });

  const now = Date.now();
  // Sertakan yang UNHEALTHY & FAILED juga — user berhak tahu replica mana yang
  // bermasalah, bukan sekadar hilang dari daftar.
  const replicas = dep.instances
    .filter((i) => ["RUNNING", "UNHEALTHY", "FAILED"].includes(i.status))
    .map((i) => {
      const fresh = !!i.metricsAt && now - i.metricsAt.getTime() < METRICS_STALE_MS;
      const ok = i.status === "RUNNING";
      return {
        instanceId: i.id,
        replicaIndex: i.replicaIndex,
        status: i.status, // RUNNING | UNHEALTHY | FAILED
        restarts: i.restarts, // berapa kali di-auto-heal
        node: i.node?.name ?? null,
        region: i.node?.region ?? null,
        hostPort: i.hostPort,
        errorMessage: i.errorMessage,
        // Data basi → jangan tampilkan angka lama seolah masih live.
        stale: !fresh,
        cpu: fresh && ok ? i.cpuPct : null,
        memoryMb: fresh && ok ? i.memMb : null,
        uptimeSec: fresh && ok ? i.uptimeSec : null,
      };
    });

  const live = replicas.filter((r) => !r.stale && r.status === "RUNNING");
  return c.json({
    running: live.length > 0,
    healthy: live.length,
    replicas,
    // Ringkasan: CPU dijumlah, memori dijumlah, uptime diambil yang terlama.
    total: {
      cpu: live.length ? Math.round(live.reduce((a, r) => a + (r.cpu ?? 0), 0) * 10) / 10 : null,
      memoryMb: live.length
        ? Math.round(live.reduce((a, r) => a + (r.memoryMb ?? 0), 0) * 10) / 10
        : null,
      uptimeSec: live.length ? Math.max(...live.map((r) => r.uptimeSec ?? 0)) : null,
    },
  });
});

// PATCH /services/:id — ubah pengaturan service.
projects.patch("/services/:id", async (c) => {
  const userId = c.get("userId");
  const serviceId = c.req.param("id");
  if (!(await ownedService(serviceId, userId)))
    return c.json({ error: "Forbidden" }, 403);

  const b = await c.req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["name", "branch", "image", "repoUrl", "repoFullName"] as const) {
    if (b[k] !== undefined) data[k] = b[k];
  }
  if (b.containerPort !== undefined) data.containerPort = Number(b.containerPort);
  // Replicas dibatasi 1..10 agar tidak menghabiskan kapasitas node.
  if (b.replicas !== undefined)
    data.replicas = Math.min(10, Math.max(1, Number(b.replicas)));
  // Posisi kartu di canvas.
  if (b.posX !== undefined) data.posX = Number(b.posX);
  if (b.posY !== undefined) data.posY = Number(b.posY);
  const service = await prisma.service.update({ where: { id: serviceId }, data });
  return c.json(service);
});

// PUT /services/:id/env — set ulang seluruh env vars service.
projects.put("/services/:id/env", async (c) => {
  const userId = c.get("userId");
  const serviceId = c.req.param("id");
  if (!(await ownedService(serviceId, userId)))
    return c.json({ error: "Forbidden" }, 403);

  const { envVars } = await c.req.json(); // [{ key, value }]
  await prisma.$transaction([
    prisma.environmentVariable.deleteMany({ where: { serviceId } }),
    prisma.environmentVariable.createMany({
      data: envVars.map((e: { key: string; value: string }) => ({
        serviceId,
        key: e.key,
        value: sealSecret(e.value ?? ""), // terenkripsi at-rest
      })),
    }),
  ]);
  return c.json({ ok: true });
});

// POST /services/:id/deploy — buat Deployment + kirim job ke worker.
projects.post("/services/:id/deploy", async (c) => {
  const userId = c.get("userId");
  const serviceId = c.req.param("id");
  const service = await ownedService(serviceId, userId);
  if (!service) return c.json({ error: "Forbidden" }, 403);

  const deployment = await createDeployment(service);
  if ("error" in deployment) return c.json({ error: deployment.error }, 503);
  await enqueueDeployment(deployment.id);
  return c.json(deployment, 202);
});

// POST /services/:id/stop — hentikan container service.
projects.post("/services/:id/stop", async (c) => {
  const userId = c.get("userId");
  const serviceId = c.req.param("id");
  if (!(await ownedService(serviceId, userId)))
    return c.json({ error: "Forbidden" }, 403);
  await enqueueAction("stop", serviceId);
  return c.json({ ok: true }, 202);
});

// POST /services/:id/restart — jalankan ulang = deployment baru
// (agent bersifat stateless; control plane yang menyimpan spesifikasinya).
projects.post("/services/:id/restart", async (c) => {
  const userId = c.get("userId");
  const serviceId = c.req.param("id");
  const service = await ownedService(serviceId, userId);
  if (!service) return c.json({ error: "Forbidden" }, 403);

  const deployment = await createDeployment(service);
  if ("error" in deployment) return c.json({ error: deployment.error }, 503);
  await enqueueDeployment(deployment.id);
  return c.json(deployment, 202);
});

// DELETE /services/:id — hapus service + bersihkan container-nya.
projects.delete("/services/:id", async (c) => {
  const userId = c.get("userId");
  const serviceId = c.req.param("id");
  const svc = await ownedService(serviceId, userId);
  if (!svc) return c.json({ error: "Forbidden" }, 403);

  // Bersihkan container lewat label (tak butuh baris DB), lalu hapus record.
  await enqueueAction("cleanup", serviceId);
  await removeServiceDns(svc.dnsRecordId); // lepas subdomain di provider
  await prisma.service.delete({ where: { id: serviceId } });
  return c.json({ ok: true });
});

// DELETE /:id — hapus project + SEMUA service-nya (Danger Zone).
projects.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const projectId = c.req.param("id");
  const project = await prisma.project.findFirst({
    where: { id: projectId, ownerId: userId },
    include: { services: { select: { id: true, dnsRecordId: true } } },
  });
  if (!project) return c.json({ error: "Forbidden" }, 403);

  // Bersihkan container + subdomain tiap service dulu, lalu hapus project.
  // (delete Project → cascade ke Service/Deployment/Instance/EnvVar via schema.)
  for (const svc of project.services) {
    await enqueueAction("cleanup", svc.id).catch(() => {});
    await removeServiceDns(svc.dnsRecordId).catch(() => {});
  }
  await prisma.project.delete({ where: { id: projectId } });
  return c.json({ ok: true });
});

export default projects;
