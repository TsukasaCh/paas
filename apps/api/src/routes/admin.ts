// Admin: kelola Node. Node "lahir" saat agent di VPS join pakai token.
import crypto from "node:crypto";
import { Hono } from "hono";
import { prisma } from "@minipaas/db";
import { encryptSecret, decryptSecret, sealSecret, openSecret } from "@minipaas/auth";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { hashToken } from "../agent-server.js";
import { isNodeOnline } from "../lib/scheduler.js";
import { verifyToken, getZone } from "../lib/cloudflare.js";
import { invalidateDnsCache, getPlatformDomains } from "../lib/dns.js";
import type { AppEnv } from "../types.js";

export const admin = new Hono<AppEnv>();

admin.use("*", requireAuth);
admin.use("*", requireAdmin);

// ── DNS / domain ───────────────────────────────────────────────
// GET /admin/dns — konfigurasi (token TIDAK pernah dikirim balik).
admin.get("/dns", async (c) => {
  const dns = await prisma.platformDns.findUnique({ where: { id: "default" } });
  return c.json({
    provider: dns?.provider ?? "cloudflare",
    enabled: dns?.enabled ?? false,
    domain: dns?.domain ?? "",
    dashboardDomain: dns?.dashboardDomain ?? "",
    apiDomain: dns?.apiDomain ?? "",
    zoneId: dns?.zoneId ?? "",
    target: dns?.target ?? "",
    proxied: dns?.proxied ?? true,
    hasToken: !!dns?.apiTokenEnc,
    lastCheckAt: dns?.lastCheckAt ?? null,
    lastOk: dns?.lastOk ?? false,
    lastError: dns?.lastError ?? null,
    envFallbackDomain: process.env.APP_DOMAIN ?? "localhost",
  });
});

// PUT /admin/dns — simpan konfigurasi. apiToken hanya dikirim saat diganti.
admin.put("/dns", async (c) => {
  const b = await c.req.json();
  const data: Record<string, unknown> = {
    provider: b.provider ?? "cloudflare",
    enabled: !!b.enabled,
    domain: (b.domain ?? "").trim().toLowerCase(),
    dashboardDomain: (b.dashboardDomain ?? "").trim().toLowerCase(),
    apiDomain: (b.apiDomain ?? "").trim().toLowerCase(),
    zoneId: (b.zoneId ?? "").trim(),
    target: (b.target ?? "").trim(),
    proxied: !!b.proxied,
  };
  // Token baru → enkripsi. Kosong → biarkan yang lama.
  if (b.apiToken) data.apiTokenEnc = encryptSecret(String(b.apiToken).trim());

  const dns = await prisma.platformDns.upsert({
    where: { id: "default" },
    update: data,
    create: { id: "default", ...(data as any) },
  });
  invalidateDnsCache();
  return c.json({ ok: true, domain: dns.domain, enabled: dns.enabled });
});

// POST /admin/dns/test — verifikasi token & zone ke Cloudflare sungguhan.
admin.post("/dns/test", async (c) => {
  const b = await c.req.json().catch(() => ({}) as any);
  const saved = await prisma.platformDns.findUnique({ where: { id: "default" } });

  const token = b.apiToken
    ? String(b.apiToken).trim()
    : saved?.apiTokenEnc
      ? decryptSecret(saved.apiTokenEnc)
      : null;
  const zoneId = (b.zoneId ?? saved?.zoneId ?? "").trim();

  if (!token) return c.json({ ok: false, error: "API token belum diisi." }, 400);
  if (!zoneId) return c.json({ ok: false, error: "Zone ID belum diisi." }, 400);

  try {
    await verifyToken(token);
    const zone = await getZone(token, zoneId);
    await prisma.platformDns
      .upsert({
        where: { id: "default" },
        update: { lastCheckAt: new Date(), lastOk: true, lastError: null },
        create: { id: "default", lastCheckAt: new Date(), lastOk: true },
      })
      .catch(() => {});
    invalidateDnsCache();
    return c.json({ ok: true, zoneName: zone.name });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await prisma.platformDns
      .upsert({
        where: { id: "default" },
        update: { lastCheckAt: new Date(), lastOk: false, lastError: error },
        create: { id: "default", lastCheckAt: new Date(), lastOk: false, lastError: error },
      })
      .catch(() => {});
    invalidateDnsCache();
    return c.json({ ok: false, error }, 400);
  }
});

// GET /admin/nodes — daftar node + status online (dari heartbeat) + beban.
admin.get("/nodes", async (c) => {
  const nodes = await prisma.node.findMany({ orderBy: { createdAt: "asc" } });
  const out = await Promise.all(
    nodes.map(async (n) => ({
      id: n.id,
      name: n.name,
      region: n.region,
      status: n.status, // ACTIVE | DRAINING (niat admin)
      online: isNodeOnline(n), // diturunkan dari heartbeat + socket
      hostname: n.hostname,
      os: n.os,
      arch: n.arch,
      agentVersion: n.agentVersion,
      cpuCores: n.cpuCores,
      memoryMb: n.memoryMb,
      dockerAvailable: n.dockerAvailable,
      cpuPct: n.cpuPct,
      memPct: n.memPct,
      lastSeenAt: n.lastSeenAt,
      maxServices: n.maxServices,
      running: await prisma.deployment.count({
        where: { nodeId: n.id, status: "RUNNING" },
      }),
    })),
  );
  return c.json(out);
});

// GET /admin/stats — ringkasan sistem.
admin.get("/stats", async (c) => {
  const [nodes, users, services, running] = await Promise.all([
    prisma.node.findMany(),
    prisma.user.count(),
    prisma.service.count(),
    prisma.deployment.count({ where: { status: "RUNNING" } }),
  ]);
  return c.json({
    nodes: nodes.length,
    online: nodes.filter(isNodeOnline).length,
    users,
    services,
    running,
  });
});

// POST /admin/nodes — daftarkan node baru → balas join token + perintah install.
// Token hanya ditampilkan SEKALI (disimpan sebagai hash).
admin.post("/nodes", async (c) => {
  const b = await c.req.json();
  const token = crypto.randomBytes(24).toString("hex");
  const node = await prisma.node.create({
    data: {
      name: b.name,
      region: b.region || "default",
      maxServices: Number(b.maxServices ?? 10),
      tokenHash: hashToken(token),
    },
  });

  // Domain diambil dari setelan admin (fallback env) supaya perintah yang
  // ditampilkan selalu cocok dengan domain yang benar-benar dipakai.
  const { apiUrl, agentWs } = await getPlatformDomains();
  return c.json(
    {
      node,
      token, // sekali saja
      installCommand: `curl -fsSL ${apiUrl}/install.sh | sudo sh -s -- --url=${agentWs} --token=${token}`,
    },
    201,
  );
});

// PATCH /admin/nodes/:id — ubah niat admin (ACTIVE/DRAINING), nama, kapasitas maks.
admin.patch("/nodes/:id", async (c) => {
  const id = c.req.param("id");
  const b = await c.req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["name", "region", "status"] as const) {
    if (b[k] !== undefined) data[k] = b[k];
  }
  if (b.maxServices !== undefined) data.maxServices = Number(b.maxServices);
  const node = await prisma.node.update({ where: { id }, data });
  return c.json(node);
});

// DELETE /admin/nodes/:id — cabut node (token jadi tidak valid).
admin.delete("/nodes/:id", async (c) => {
  const id = c.req.param("id");
  await prisma.deployment.updateMany({ where: { nodeId: id }, data: { nodeId: null } });
  await prisma.node.delete({ where: { id } });
  return c.json({ ok: true });
});

export default admin;
