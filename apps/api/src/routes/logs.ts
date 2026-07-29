// Stream log deployment ke browser lewat Server-Sent Events (SSE).
// Sumber log: Redis pub/sub (produksi) atau bus memory (mode demo) — sesuai QUEUE_DRIVER.
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { Redis } from "ioredis";
import { prisma } from "@minipaas/db";
import { verifyApiToken } from "@minipaas/auth";
import { logBus, logChannel } from "@minipaas/worker/logs";
import { getRuntimeTail } from "../agent-server.js";

export const logs = new Hono();

const useMemory = (process.env.QUEUE_DRIVER ?? "redis").toLowerCase() === "memory";

// GET /logs/:deploymentId/stream?token=...  (EventSource dari frontend)
logs.get("/:deploymentId/stream", async (c) => {
  const deploymentId = c.req.param("deploymentId");

  // Auth: verifikasi token + pastikan deployment milik user.
  const token = c.req.query("token");
  if (!token) return c.json({ error: "Unauthorized" }, 401);
  let userId: string;
  try {
    userId = (await verifyApiToken(token)).userId;
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  const owned = await prisma.deployment.findFirst({
    where: { id: deploymentId, service: { project: { ownerId: userId } } },
    select: { id: true },
  });
  if (!owned) return c.json({ error: "Forbidden" }, 403);

  return streamSSE(c, async (stream) => {
    // 1. Kirim log historis yang tersimpan (jika deployment sudah/ sedang berjalan).
    const existing = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { logs: true },
    });
    if (existing?.logs) {
      await stream.writeSSE({ event: "log", data: existing.logs });
    }
    // Ekor log runtime/akses terakhir (rolling) → bertahan saat refresh browser.
    const rtail = getRuntimeTail(deploymentId);
    if (rtail) {
      await stream.writeSSE({ event: "log", data: rtail });
    }

    // 2. Berlangganan log realtime.
    const channel = logChannel(deploymentId);
    if (useMemory) {
      const handler = (line: string) =>
        void stream.writeSSE({ event: "log", data: line });
      logBus.on(channel, handler);
      stream.onAbort(() => {
        logBus.off(channel, handler);
      });
    } else {
      const sub = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
      await sub.subscribe(channel);
      sub.on("message", (_ch, message) =>
        void stream.writeSSE({ event: "log", data: message }),
      );
      stream.onAbort(() => void sub.quit());
    }

    // Jaga koneksi tetap hidup.
    while (!stream.closed) {
      await stream.sleep(15000);
      await stream.writeSSE({ event: "ping", data: "keep-alive" });
    }
  });
});

export default logs;
