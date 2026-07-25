/**
 * Smoke test runtime Node — membuktikan mekanisme clone→spawn→serve tanpa
 * Docker, DB, atau Redis. Menjalankan examples/hello-app sebagai child process
 * pada port acak lalu meng-curl-nya.
 *
 *   corepack pnpm --filter @minipaas/worker smoke:node
 */
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { resolveEntry, spawnApp, killTree } from "../src/runtimes/node-exec.js";

const here = dirname(fileURLToPath(import.meta.url)); // worker/scripts
const appDir = resolve(here, "../../examples/hello-app");
const PORT = 8123;

async function main() {
  console.log(`[smoke] app dir: ${appDir}`);
  const plan = await resolveEntry(appDir);
  console.log(`[smoke] rencana start:`, plan);

  const proc = spawnApp(
    appDir,
    plan,
    { ...process.env, PORT: String(PORT), GREETING: "Halo via runtime Node 🚀" },
    (l) => console.log(`[app] ${l}`),
  );

  // Tunggu server siap.
  await new Promise((r) => setTimeout(r, 1500));

  const res = await fetch(`http://localhost:${PORT}`);
  const body = await res.json();
  console.log(`[smoke] HTTP ${res.status}:`, body);

  await killTree(proc.pid);
  console.log(`[smoke] proses dimatikan. ${body.message ? "SUKSES ✅" : "GAGAL"}`);
  process.exit(body?.message ? 0 : 1);
}

main().catch((e) => {
  console.error("[smoke] ERROR:", e);
  process.exit(1);
});
