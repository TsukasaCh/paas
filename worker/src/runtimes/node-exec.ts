/**
 * Helper eksekusi murni untuk runtime Node — TANPA dependency Prisma/Redis,
 * sehingga bisa diuji langsung (lihat scripts/smoke-node.ts).
 *
 * Bertugas: deteksi entrypoint, npm install, spawn app, dan kill process tree.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface StartPlan {
  install: boolean; // perlu `npm install`?
  cmd: string; // "npm" | "node"
  args: string[];
}

function npmCmd(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

/**
 * Tentukan cara menjalankan aplikasi dari isi repo:
 *  1. package.json → scripts.start  → `npm start`
 *  2. package.json → main           → `node <main>`
 *  3. server.js / index.js / app.js → `node <file>`
 */
export async function resolveEntry(workDir: string): Promise<StartPlan> {
  const pkgPath = join(workDir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8"));
    const hasDeps =
      pkg.dependencies && Object.keys(pkg.dependencies).length > 0;
    if (pkg.scripts?.start) return { install: !!hasDeps, cmd: npmCmd(), args: ["start"] };
    const main = pkg.main ?? "index.js";
    return { install: !!hasDeps, cmd: "node", args: [main] };
  }
  for (const f of ["server.js", "index.js", "app.js"]) {
    if (existsSync(join(workDir, f))) return { install: false, cmd: "node", args: [f] };
  }
  throw new Error(
    "Tidak menemukan entrypoint Node (package.json/server.js/index.js/app.js)",
  );
}

/** Jalankan `npm install` di workDir, forward output ke logger. */
export function runInstall(
  workDir: string,
  log: (l: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(npmCmd(), ["install", "--no-audit", "--no-fund"], {
      cwd: workDir,
      shell: process.platform === "win32",
    });
    p.stdout?.on("data", (d: Buffer) => log(d.toString().trim()));
    p.stderr?.on("data", (d: Buffer) => log(d.toString().trim()));
    p.on("error", reject);
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`npm install keluar dengan kode ${code}`)),
    );
  });
}

/** Spawn aplikasi. Env sudah termasuk PORT + env vars service. */
export function spawnApp(
  workDir: string,
  plan: StartPlan,
  env: NodeJS.ProcessEnv,
  log: (l: string) => void,
): ChildProcess {
  const proc = spawn(plan.cmd, plan.args, {
    cwd: workDir,
    env,
    shell: process.platform === "win32" && plan.cmd.endsWith(".cmd"),
  });
  proc.stdout?.on("data", (d: Buffer) => log(d.toString().trim()));
  proc.stderr?.on("data", (d: Buffer) => log(d.toString().trim()));
  return proc;
}

/** Bunuh process beserta anak-anaknya (npm → node) lintas-platform. */
export function killTree(pid: number | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (process.platform === "win32") {
      const k = spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
      k.on("exit", () => resolve());
      k.on("error", () => resolve());
    } else {
      try {
        process.kill(pid);
      } catch {
        /* sudah mati */
      }
      resolve();
    }
  });
}
