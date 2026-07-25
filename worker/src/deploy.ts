/**
 * Orkestrasi satu Deployment (runtime-agnostic):
 *   load → clone → alokasi port → runtime.start() → update status.
 * Runtime aktif (docker/node) ditentukan oleh DEPLOY_RUNTIME.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { simpleGit } from "simple-git";
import { prisma, DeploymentStatus, ServiceStatus } from "@minipaas/db";
import { publishLog } from "./logs.js";
import { allocateFreePort } from "./ports.js";
import { activeRuntime } from "./runtime.js";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? "./.workspaces";

export interface DeployJob {
  deploymentId: string;
}

function makeLogger(deploymentId: string, buffer: string[]) {
  return async (line: string) => {
    const stamped = `[${new Date().toISOString()}] ${line}`;
    buffer.push(stamped);
    await publishLog(deploymentId, stamped);
  };
}

export async function runDeployment({ deploymentId }: DeployJob): Promise<void> {
  const logBuffer: string[] = [];
  const log = makeLogger(deploymentId, logBuffer);

  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { service: { include: { envVars: true } } },
  });
  if (!deployment) throw new Error(`Deployment ${deploymentId} tidak ditemukan`);

  const { service } = deployment;
  const workDir = path.resolve(WORKSPACE_DIR, deploymentId);

  try {
    await setDeploymentStatus(deploymentId, DeploymentStatus.BUILDING, {
      startedAt: new Date(),
    });
    await setServiceStatus(service.id, ServiceStatus.DEPLOYING);

    // ── 1. SIAPKAN SUMBER ───────────────────────────────────────
    if (service.source === "IMAGE") {
      if (!service.image) throw new Error("Service tidak memiliki image");
      await log(`Sumber: image registry → ${service.image}`);
    } else {
      await log(`Mengambil kode dari ${service.repoFullName} (branch: ${service.branch})...`);
      await fs.rm(workDir, { recursive: true, force: true });
      await fs.mkdir(workDir, { recursive: true });
      if (!service.repoUrl) throw new Error("Service tidak memiliki repoUrl");
      await simpleGit().clone(service.repoUrl, workDir, [
        "--depth",
        "1",
        "--branch",
        service.branch ?? "main",
      ]);
      const sha = (await simpleGit(workDir).revparse(["HEAD"])).trim();
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { commitSha: sha },
      });
      await log(`Commit ${sha.slice(0, 8)}`);
    }

    // ── 2. ALOKASI PORT + JALANKAN LEWAT RUNTIME AKTIF ──────────
    await setDeploymentStatus(deploymentId, DeploymentStatus.DEPLOYING);
    const hostPort = await allocateFreePort();
    const containerPort = service.containerPort ?? 3000;
    await log(`Runtime: ${activeRuntime.name}`);

    const { handle } = await activeRuntime.start({
      deploymentId,
      service,
      workDir,
      hostPort,
      containerPort,
      log,
    });

    // ── 3. SUKSES ───────────────────────────────────────────────
    await setDeploymentStatus(deploymentId, DeploymentStatus.RUNNING, {
      finishedAt: new Date(),
      containerId: handle,
      hostPort,
      logs: logBuffer.join("\n"),
    });
    await prisma.service.update({
      where: { id: service.id },
      data: { status: ServiceStatus.RUNNING, activeDeploymentId: deploymentId },
    });
    await log(`✅ Deployment sukses. Aplikasi live di http://localhost:${hostPort}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log(`❌ Deployment gagal: ${message}`);
    await setDeploymentStatus(deploymentId, DeploymentStatus.FAILED, {
      finishedAt: new Date(),
      errorMessage: message,
      logs: logBuffer.join("\n"),
    });
    await setServiceStatus(service.id, ServiceStatus.FAILED);
    // Bersihkan clone yang gagal (runtime yang sukses mengelola workDir-nya sendiri).
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

function setDeploymentStatus(
  id: string,
  status: DeploymentStatus,
  extra: Record<string, unknown> = {},
) {
  return prisma.deployment.update({ where: { id }, data: { status, ...extra } });
}

function setServiceStatus(id: string, status: ServiceStatus) {
  return prisma.service.update({ where: { id }, data: { status } });
}
