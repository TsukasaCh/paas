// Terima webhook `push` dari GitHub → trigger auto-deploy service terkait.
import { Hono } from "hono";
import crypto from "node:crypto";
import { prisma, DeploymentStatus } from "@minipaas/db";
import { enqueueDeployment } from "../lib/queue.js";

export const webhooks = new Hono();

// Verifikasi signature HMAC dari GitHub (header x-hub-signature-256).
function verifySignature(payload: string, signature?: string): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET ?? "";
  if (!signature || !secret) return false;
  const digest =
    "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  // timingSafeEqual butuh panjang sama.
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// POST /webhooks/github
webhooks.post("/github", async (c) => {
  const raw = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");
  if (!verifySignature(raw, signature)) {
    return c.json({ error: "Invalid signature" }, 401);
  }

  const event = c.req.header("x-github-event");
  if (event !== "push") return c.json({ ignored: true });

  const payload = JSON.parse(raw);
  const repoFullName: string = payload.repository?.full_name;
  const pushedBranch: string = (payload.ref ?? "").replace("refs/heads/", "");

  // Cari semua service yang cocok repo + branch, lalu deploy ulang.
  const services = await prisma.service.findMany({
    where: { repoFullName, branch: pushedBranch, type: "APP" },
  });

  const deployments = [];
  for (const svc of services) {
    const d = await prisma.deployment.create({
      data: {
        serviceId: svc.id,
        status: DeploymentStatus.QUEUED,
        branch: pushedBranch,
        commitSha: payload.after,
      },
    });
    await enqueueDeployment(d.id);
    deployments.push(d.id);
  }

  return c.json({ triggered: deployments });
});

export default webhooks;
