/**
 * Eksekutor job di sisi agent — TIDAK menyentuh database.
 * Semua yang dibutuhkan datang lewat DeployJobSpec; hasil dilaporkan balik
 * ke control plane lewat callback (log/result).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import net from "node:net";
import os from "node:os";
import Docker from "dockerode";
import { simpleGit } from "simple-git";
import type { DeployJobSpec } from "@minipaas/agent-proto";
import { forgetInstance } from "./health.js";
import { scheduleRestart, forgetRestarts, currentAttempt, hasGivenUp } from "./supervisor.js";

const WORKSPACE = process.env.AGENT_WORKSPACE ?? resolve(os.tmpdir(), "ronaldocloud-agent");
const PORT_START = Number(process.env.PORT_RANGE_START ?? 20000);
const PORT_END = Number(process.env.PORT_RANGE_END ?? 30000);

type Log = (line: string, stream?: "build" | "runtime") => void;

// Proses/container yang sedang jalan, per instanceId (satu replica = satu entri).
interface Running {
  serviceId: string;
  proc?: ChildProcess;
  containerId?: string;
  workDir?: string;
  port: number;
  startedAt: number; // epoch ms — untuk menghitung uptime
  job: DeployJobSpec; // disimpan agar bisa dihidupkan ulang tanpa clone ulang
  log: Log;
}
const registry = new Map<string, Running>();

/** Instance yang sedang dihentikan/dideploy ulang atas perintah — jangan di-auto-restart. */
const intentionalStop = new Set<string>();

/** Kirim event ke control plane (di-wire dari index.ts). */
type EventSink = (e: {
  instanceId: string;
  deploymentId: string;
  kind: "restarting" | "restarted" | "crash-loop";
  attempt: number;
  reason: string;
  hostPort?: number;
  handle?: string;
}) => void;
let emitEvent: EventSink = () => {};
export function setEventSink(fn: EventSink): void {
  emitEvent = fn;
}

/** Semua instance milik satu service (bisa >1 kalau replicas > 1). */
function instancesOf(serviceId: string): string[] {
  return [...registry.entries()]
    .filter(([, r]) => r.serviceId === serviceId)
    .map(([id]) => id);
}

/** Replica yang sedang berjalan di node ini — untuk sampling metrics & health. */
export function listRunning(): {
  instanceId: string;
  pid?: number;
  containerId?: string;
  port: number;
  startedAt: number;
}[] {
  return [...registry.entries()].map(([instanceId, r]) => ({
    instanceId,
    pid: r.proc?.pid,
    containerId: r.containerId,
    port: r.port,
    startedAt: r.startedAt,
  }));
}

const docker = new Docker();

// ── util ───────────────────────────────────────────────────────
export async function allocatePort(): Promise<number> {
  for (let i = 0; i < 100; i++) {
    const p = PORT_START + Math.floor(Math.random() * (PORT_END - PORT_START));
    if (await isFree(p)) return p;
  }
  throw new Error("Tidak ada port bebas di rentang yang dikonfigurasi");
}

/**
 * Direktori kerja PER-REPLICA. Wajib dipisah: kalau replica berbagi folder,
 * clone replica berikutnya akan menimpa milik replica sebelumnya.
 */
function workDirFor(job: DeployJobSpec): string {
  return join(WORKSPACE, job.deploymentId, `r${job.replicaIndex}`);
}

function isFree(port: number): Promise<boolean> {
  return new Promise((res) => {
    const s = net.createServer();
    s.once("error", () => res(false));
    s.once("listening", () => s.close(() => res(true)));
    s.listen(port, "0.0.0.0");
  });
}

function killTree(pid?: number): Promise<void> {
  return new Promise((res) => {
    if (!pid) return res();
    if (process.platform === "win32") {
      const k = spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
      k.on("exit", () => res());
      k.on("error", () => res());
    } else {
      try {
        process.kill(pid);
      } catch {
        /* sudah mati */
      }
      res();
    }
  });
}

// ── deploy ─────────────────────────────────────────────────────
export async function runJob(
  job: DeployJobSpec,
  log: Log,
): Promise<{ handle: string; hostPort: number }> {
  // Hentikan hanya instance dengan id sama (replica lain dibiarkan hidup).
  await stopInstance(job.instanceId).catch(() => {});
  // Mulai hidup lagi → boleh di-auto-restart bila nanti mati mendadak.
  intentionalStop.delete(job.instanceId);
  const port = await allocatePort();

  if (job.runtime === "docker") {
    return runDocker(job, port, log);
  }
  if (job.source === "IMAGE") {
    throw new Error("Sumber image butuh Docker; agent ini tidak punya Docker aktif.");
  }
  return runNode(job, port, log);
}

// Jalankan aplikasi Node sebagai child process.
async function runNode(job: DeployJobSpec, port: number, log: Log) {
  const workDir = workDirFor(job);
  log(`Menyiapkan kode dari ${job.repoUrl} (${job.branch})…`);
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  await simpleGit().clone(job.repoUrl!, workDir, ["--depth", "1", "--branch", job.branch ?? "main"]);
  const sha = (await simpleGit(workDir).revparse(["HEAD"])).trim();
  log(`Commit ${sha.slice(0, 8)}`);

  const plan = await resolveEntry(workDir);
  // Isolasi module-type: app tanpa package.json bisa mewarisi milik induk.
  const pkg = join(workDir, "package.json");
  if (!existsSync(pkg)) {
    await fs.writeFile(pkg, JSON.stringify({ private: true, main: plan.args[0] }) + "\n");
  }
  if (plan.install) {
    log("Menjalankan npm install…");
    await runInstall(workDir, log);
  }

  log(`Menjalankan: ${plan.cmd} ${plan.args.join(" ")} (PORT=${port})`);
  const proc = spawn(plan.cmd, plan.args, {
    cwd: workDir,
    env: { ...process.env, ...job.env, PORT: String(port) },
    shell: process.platform === "win32" && plan.cmd.endsWith(".cmd"),
  });
  proc.stdout?.on("data", (d: Buffer) => log(d.toString().trim(), "runtime"));
  proc.stderr?.on("data", (d: Buffer) => log(d.toString().trim(), "runtime"));

  await new Promise<void>((res, rej) => {
    const t = setTimeout(res, 1500);
    proc.once("exit", (c) => {
      clearTimeout(t);
      rej(new Error(`Proses langsung berhenti (exit ${c})`));
    });
    proc.once("error", (e) => {
      clearTimeout(t);
      rej(e);
    });
  });

  registry.set(job.instanceId, {
    serviceId: job.serviceId,
    proc,
    workDir,
    port,
    startedAt: Date.now(),
    job,
    log,
  });
  proc.on("exit", (c) => {
    log(`Proses berhenti (exit ${c})`);
    registry.delete(job.instanceId);
    // Mati tak terduga → hidupkan ulang (auto-heal).
    if (!intentionalStop.has(job.instanceId)) {
      triggerRestart(job, log, `proses berhenti (exit ${c})`);
    }
  });
  return { handle: `pid:${proc.pid}`, hostPort: port };
}

// Jalankan lewat Docker: build dari repo atau pull image.
async function runDocker(job: DeployJobSpec, port: number, log: Log) {
  let imageTag: string;
  let workDir: string | undefined;

  if (job.source === "IMAGE") {
    imageTag = job.image!;
    log(`Menarik image ${imageTag}…`);
    await pullImage(imageTag, log);
  } else {
    workDir = workDirFor(job);
    log(`Menyiapkan kode dari ${job.repoUrl} (${job.branch})…`);
    await fs.rm(workDir, { recursive: true, force: true });
    await fs.mkdir(workDir, { recursive: true });
    await simpleGit().clone(job.repoUrl!, workDir, ["--depth", "1", "--branch", job.branch ?? "main"]);
    imageTag = `ronaldocloud/${job.serviceId.toLowerCase()}:${job.deploymentId.slice(0, 12)}`;
    log(`Membangun image ${imageTag}…`);
    await buildImage(workDir, imageTag, log, job);
  }

  // Nama container deterministik per replica → sama antar-deploy service ini.
  const containerName = `rc_${job.serviceId}_${job.replicaIndex}`.toLowerCase();
  await removeContainerFor(job.instanceId);
  // Redeploy: deployment baru punya instanceId beda, tapi container LAMA memakai
  // nama yang sama → buang by-nama juga, kalau tidak createContainer 409 Conflict.
  await removeContainerByName(containerName);
  log(`Menjalankan container replica #${job.replicaIndex} → :${port}`);
  const container = await docker.createContainer({
    Image: imageTag,
    name: containerName,
    // PORT=containerPort DIPAKSA terakhir: app (mis. hasil Nixpacks) yang baca
    // process.env.PORT akan bind ke port yang benar-benar di-expose & di-map.
    Env: [...Object.entries(job.env).map(([k, v]) => `${k}=${v}`), `PORT=${job.containerPort}`],
    Labels: {
      "ronaldocloud.serviceId": job.serviceId,
      "ronaldocloud.instanceId": job.instanceId,
    },
    ExposedPorts: { [`${job.containerPort}/tcp`]: {} },
    HostConfig: {
      PortBindings: { [`${job.containerPort}/tcp`]: [{ HostPort: String(port) }] },
      RestartPolicy: { Name: "unless-stopped" },
    },
  });
  await container.start();
  void streamContainerLogs(container, log);
  if (workDir) await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});

  registry.set(job.instanceId, {
    serviceId: job.serviceId,
    containerId: container.id,
    port,
    startedAt: Date.now(),
    job,
    log,
  });
  // Container punya RestartPolicy sendiri dari Docker; auto-heal agent
  // menangani kasus container hilang total (lihat health check).
  return { handle: container.id, hostPort: port };
}

/**
 * Hidupkan ulang replica yang mati/hang, dengan backoff & batas crash-loop.
 * Port baru dialokasikan lalu dilaporkan ke control plane agar rotasi proxy
 * menunjuk alamat yang benar.
 */
export function triggerRestart(job: DeployJobSpec, log: Log, reason: string): void {
  const ev = {
    instanceId: job.instanceId,
    deploymentId: job.deploymentId,
  };

  const sched = scheduleRestart(
    job.instanceId,
    async () => {
      const attempt = currentAttempt(job.instanceId);
      try {
        const r = await runJob(job, log);
        log(`✅ Replica hidup lagi di port ${r.hostPort} (percobaan ${attempt})`);
        emitEvent({ ...ev, kind: "restarted", attempt, reason, ...r });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log(`❌ Gagal menghidupkan ulang: ${msg}`);
        triggerRestart(job, log, msg); // coba lagi; supervisor yang membatasi
      }
    },
    (attempt) => {
      log(`⛔ Menyerah setelah ${attempt} percobaan — aplikasi crash-loop. Perbaiki lalu Deploy ulang.`);
      emitEvent({ ...ev, kind: "crash-loop", attempt, reason });
    },
  );

  if (sched) {
    log(`↻ Menghidupkan ulang dalam ${Math.round(sched.delayMs / 1000)}s (percobaan ${sched.attempt})…`);
    emitEvent({ ...ev, kind: "restarting", attempt: sched.attempt, reason });
  }
}

/**
 * Replica hidup tapi tidak menerima koneksi (hang) → matikan lalu hidupkan ulang.
 *
 * Sengaja TIDAK memakai stopInstance(): fungsi itu me-reset riwayat restart,
 * sehingga aplikasi yang hang berulang tak akan pernah terdeteksi crash-loop.
 */
export function reviveHung(instanceId: string): void {
  const r = registry.get(instanceId);
  if (!r || hasGivenUp(instanceId)) return;

  const { job, log } = r;
  intentionalStop.add(instanceId); // cegah exit handler ikut memicu restart
  registry.delete(instanceId);
  void (async () => {
    if (r.proc) await killTree(r.proc.pid);
    if (r.containerId) await docker.getContainer(r.containerId).stop().catch(() => {});
    intentionalStop.delete(instanceId);
    triggerRestart(job, log, "aplikasi tidak merespons (hang)");
  })();
}

// ── aksi lifecycle ─────────────────────────────────────────────
/** Hentikan satu replica. */
export async function stopInstance(instanceId: string): Promise<void> {
  // Tandai disengaja agar handler exit tidak memicu auto-restart.
  intentionalStop.add(instanceId);
  forgetRestarts(instanceId);
  const r = registry.get(instanceId);
  if (r?.proc) await killTree(r.proc.pid);
  if (r?.containerId) await docker.getContainer(r.containerId).stop().catch(() => {});
  await removeContainerFor(instanceId).catch(() => {});
  registry.delete(instanceId);
  forgetInstance(instanceId);
}

/** Hentikan SEMUA replica milik sebuah service. */
export async function stopService(serviceId: string): Promise<void> {
  for (const id of instancesOf(serviceId)) await stopInstance(id);
  await removeContainersOfService(serviceId).catch(() => {});
}

export async function cleanupService(serviceId: string): Promise<void> {
  const dirs = instancesOf(serviceId)
    .map((id) => registry.get(id)?.workDir)
    .filter(Boolean) as string[];
  await stopService(serviceId);
  for (const d of dirs) await fs.rm(d, { recursive: true, force: true }).catch(() => {});
}

async function removeContainerFor(instanceId: string) {
  const list = await docker
    .listContainers({ all: true, filters: { label: [`ronaldocloud.instanceId=${instanceId}`] } })
    .catch(() => [] as any[]);
  for (const info of list) {
    await docker.getContainer(info.Id).remove({ force: true }).catch(() => {});
  }
}

/** Buang container berdasarkan nama (idempoten) — untuk redeploy nama sama. */
async function removeContainerByName(name: string) {
  await docker.getContainer(name).remove({ force: true }).catch(() => {});
}

async function removeContainersOfService(serviceId: string) {
  const list = await docker
    .listContainers({ all: true, filters: { label: [`ronaldocloud.serviceId=${serviceId}`] } })
    .catch(() => [] as any[]);
  for (const info of list) {
    await docker.getContainer(info.Id).remove({ force: true }).catch(() => {});
  }
}

// ── helper node ────────────────────────────────────────────────
interface Plan {
  install: boolean;
  cmd: string;
  args: string[];
}
const npmCmd = () => (process.platform === "win32" ? "npm.cmd" : "npm");

async function resolveEntry(workDir: string): Promise<Plan> {
  const p = join(workDir, "package.json");
  if (existsSync(p)) {
    const pkg = JSON.parse(await fs.readFile(p, "utf8"));
    const hasDeps = pkg.dependencies && Object.keys(pkg.dependencies).length > 0;
    if (pkg.scripts?.start) return { install: !!hasDeps, cmd: npmCmd(), args: ["start"] };
    return { install: !!hasDeps, cmd: "node", args: [pkg.main ?? "index.js"] };
  }
  for (const f of ["server.js", "index.js", "app.js"]) {
    if (existsSync(join(workDir, f))) return { install: false, cmd: "node", args: [f] };
  }
  throw new Error("Tidak menemukan entrypoint (package.json/server.js/index.js)");
}

function runInstall(workDir: string, log: Log): Promise<void> {
  return new Promise((res, rej) => {
    const p = spawn(npmCmd(), ["install", "--no-audit", "--no-fund"], {
      cwd: workDir,
      shell: process.platform === "win32",
    });
    p.stdout?.on("data", (d: Buffer) => log(d.toString().trim()));
    p.stderr?.on("data", (d: Buffer) => log(d.toString().trim()));
    p.on("error", rej);
    p.on("exit", (c) => (c === 0 ? res() : rej(new Error(`npm install exit ${c}`))));
  });
}

// ── helper docker ──────────────────────────────────────────────
function pullImage(image: string, log: Log): Promise<void> {
  return new Promise((res, rej) => {
    docker.pull(image, (err: unknown, stream: NodeJS.ReadableStream) => {
      if (err) return rej(err);
      docker.modem.followProgress(
        stream,
        (e) => (e ? rej(e) : res()),
        (evt: any) => {
          const s = (evt.status ?? "").toString().trim();
          if (s) log(s);
        },
      );
    });
  });
}

/**
 * Bangun image dari repo. Ada Dockerfile → `docker build`. Tidak ada →
 * **Nixpacks** auto-deteksi bahasa (Node/Python/Go/Bun/…) dan membangun image
 * TANPA perlu Dockerfile — jadi user cukup connect repo, seperti Railway.
 */
async function buildImage(
  context: string,
  tag: string,
  log: Log,
  job: DeployJobSpec,
): Promise<void> {
  if (existsSync(join(context, "Dockerfile"))) {
    const stream = await docker.buildImage({ context, src: ["."] }, { t: tag, dockerfile: "Dockerfile" });
    await new Promise<void>((res, rej) => {
      docker.modem.followProgress(
        stream,
        (err, out) => {
          const failed = out?.find((o: any) => o.error);
          if (err) return rej(err);
          if (failed) return rej(new Error(failed.error));
          res();
        },
        (evt: any) => {
          const s = (evt.stream ?? evt.status ?? "").toString().trim();
          if (s) log(s);
        },
      );
    });
    return;
  }

  log("Tidak ada Dockerfile → build otomatis dengan Nixpacks…");
  await new Promise<void>((res, rej) => {
    const args = ["build", context, "--name", tag];
    // Env build-time (mis. NEXT_PUBLIC_*) ikut agar ter-bake saat build.
    for (const [k, v] of Object.entries(job.env)) args.push("--env", `${k}=${v}`);
    const p = spawn("nixpacks", args, { env: process.env });
    p.stdout?.on("data", (d: Buffer) => {
      const s = d.toString().trim();
      if (s) log(s);
    });
    p.stderr?.on("data", (d: Buffer) => {
      const s = d.toString().trim();
      if (s) log(s);
    });
    p.on("error", (e) =>
      rej(new Error(`Nixpacks tak bisa dijalankan (pastikan terpasang di node): ${e.message}`)),
    );
    p.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`Nixpacks build gagal (exit ${code})`)),
    );
  });
}

async function streamContainerLogs(container: Docker.Container, log: Log) {
  const stream = await container.logs({ follow: true, stdout: true, stderr: true, tail: 0 });
  (stream as NodeJS.ReadableStream).on("data", (c: Buffer) => {
    const t = c.toString("utf8").replace(/[\x00-\x08]/g, "").trim();
    if (t) log(t, "runtime");
  });
}
