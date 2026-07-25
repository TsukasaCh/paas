/**
 * Runtime "node": jalankan aplikasi sebagai child process (tanpa Docker).
 * Cocok untuk aplikasi Node yang punya package.json/server.js.
 *
 * Registry in-memory melacak process yang berjalan (per serviceId) untuk
 * stop/restart/cleanup. Setelah worker restart, stop/cleanup jatuh ke PID
 * yang tersimpan di DB (Deployment.containerId = "pid:<n>").
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ChildProcess } from "node:child_process";
import { prisma, ServiceStatus } from "@minipaas/db";
import type { Runtime, StartContext } from "../runtime.js";
import { publishLog } from "../logs.js";
import { resolveEntry, runInstall, spawnApp, killTree } from "./node-exec.js";

const WORKSPACE_DIR = process.env.WORKSPACE_DIR ?? "./.workspaces";

interface Running {
  proc: ChildProcess;
  workDir: string;
  port: number;
}
const registry = new Map<string, Running>();

function envFor(service: StartContext["service"], port: number): NodeJS.ProcessEnv {
  return {
    ...process.env, // agar `node`/`npm` & PATH tersedia
    ...Object.fromEntries(service.envVars.map((e) => [e.key, e.value])),
    PORT: String(port),
  };
}

/** Jalankan app di workDir; resolve setelah proses stabil (tak langsung exit). */
async function launch(
  serviceId: string,
  workDir: string,
  port: number,
  env: NodeJS.ProcessEnv,
  log: (l: string) => void,
  doInstall: boolean,
): Promise<ChildProcess> {
  const plan = await resolveEntry(workDir);

  // Isolasi module-type: app tanpa package.json sendiri bisa "mewarisi"
  // package.json induk (mis. apps/api "type":"module") sehingga require() gagal.
  // Tulis package.json minimal (default CommonJS) agar app berdiri sendiri.
  const pkgPath = join(workDir, "package.json");
  if (!existsSync(pkgPath)) {
    // Simpan entry sebagai "main" agar deteksi konsisten saat restart
    // (tanpa ini, resolveEntry akan default ke index.js pada run berikutnya).
    const main = plan.cmd === "node" ? plan.args[0] : "index.js";
    await fs.writeFile(pkgPath, JSON.stringify({ private: true, main }) + "\n");
  }

  if (doInstall && plan.install) {
    log("Menjalankan npm install...");
    await runInstall(workDir, log);
  }
  log(`Menjalankan: ${plan.cmd} ${plan.args.join(" ")} (PORT=${port})`);
  const proc = spawnApp(workDir, plan, env, log);

  // Deteksi crash dini: bila proses mati < 1.5s, anggap gagal.
  await new Promise<void>((resolvePromise, reject) => {
    const timer = setTimeout(resolvePromise, 1500);
    proc.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Proses langsung berhenti (exit ${code})`));
    });
    proc.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

  registry.set(serviceId, { proc, workDir, port });
  proc.on("exit", (code) => {
    log(`Proses berhenti (exit ${code})`);
    registry.delete(serviceId);
  });
  return proc;
}

export const nodeRuntime: Runtime = {
  name: "node",

  async start(ctx: StartContext) {
    const { service, workDir, hostPort, log } = ctx;
    if (service.source === "IMAGE" || service.type === "DATABASE") {
      throw new Error(
        "Deploy dari image registry membutuhkan container runtime. Aktifkan DEPLOY_RUNTIME=docker.",
      );
    }
    // Hentikan proses lama service ini bila masih berjalan.
    await nodeRuntime.stop(service.id).catch(() => {});

    const proc = await launch(
      service.id,
      workDir,
      hostPort,
      envFor(service, hostPort),
      (l) => void log(l),
      true,
    );
    return { handle: `pid:${proc.pid}` };
  },

  async stop(serviceId: string) {
    const r = registry.get(serviceId);
    if (r) {
      await killTree(r.proc.pid);
      registry.delete(serviceId);
    } else {
      // Fallback: kill PID tersimpan di deployment terakhir.
      const dep = await prisma.deployment
        .findFirst({ where: { serviceId }, orderBy: { createdAt: "desc" } })
        .catch(() => null);
      if (dep?.containerId?.startsWith("pid:")) {
        await killTree(Number(dep.containerId.slice(4)));
      }
    }
    await prisma.service
      .update({ where: { id: serviceId }, data: { status: ServiceStatus.STOPPED } })
      .catch(() => {});
  },

  async restart(serviceId: string) {
    await nodeRuntime.stop(serviceId);

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      include: { envVars: true },
    });
    if (!service) throw new Error("Service tidak ditemukan");

    const dep = await prisma.deployment.findFirst({
      where: { serviceId },
      orderBy: { createdAt: "desc" },
    });
    if (!dep?.hostPort) throw new Error("Tidak ada deployment untuk di-restart");

    const workDir = resolve(WORKSPACE_DIR, dep.id);
    const log = (l: string) =>
      void publishLog(dep.id, `[${new Date().toISOString()}] ${l}`);

    // Reuse workDir (node_modules sudah ada) → tak perlu install ulang.
    await launch(serviceId, workDir, dep.hostPort, envFor(service, dep.hostPort), log, false);
    await prisma.service
      .update({ where: { id: serviceId }, data: { status: ServiceStatus.RUNNING } })
      .catch(() => {});
  },

  async cleanup(serviceId: string) {
    const r = registry.get(serviceId);
    if (r) {
      await killTree(r.proc.pid);
      registry.delete(serviceId);
      await fs.rm(r.workDir, { recursive: true, force: true }).catch(() => {});
    } else {
      // Service mungkin sudah terhapus dari DB (cascade); best-effort saja.
      const dep = await prisma.deployment
        .findFirst({ where: { serviceId }, orderBy: { createdAt: "desc" } })
        .catch(() => null);
      if (dep?.containerId?.startsWith("pid:")) {
        await killTree(Number(dep.containerId.slice(4)));
      }
      if (dep) {
        await fs
          .rm(resolve(WORKSPACE_DIR, dep.id), { recursive: true, force: true })
          .catch(() => {});
      }
    }
  },
};
