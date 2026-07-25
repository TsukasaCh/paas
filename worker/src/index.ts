/**
 * Entry point worker: konsumsi antrian BullMQ "deployments".
 * API mem-`enqueue` job { deploymentId }, worker menjalankan runDeployment.
 *
 * Dijalankan sebagai proses terpisah di host yang punya akses Docker daemon.
 */
import "./load-env.js"; // WAJIB paling atas — memuat .env sebelum modul lain.

// Mode demo: deployment dijalankan in-process oleh API (lihat apps/api/src/lib/queue.ts),
// jadi proses worker terpisah + BullMQ/Redis tidak diperlukan.
if ((process.env.QUEUE_DRIVER ?? "redis").toLowerCase() === "memory") {
  console.log(
    "[worker] QUEUE_DRIVER=memory → job diproses in-process oleh API. Proses worker terpisah tidak dijalankan.",
  );
  process.exit(0);
}

import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { runDeployment, type DeployJob } from "./deploy.js";
import {
  stopService,
  restartService,
  cleanupService,
  type ActionJob,
} from "./actions.js";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
// BullMQ Worker memakai koneksi blocking, jadi tiap Worker punya koneksi sendiri.
const deployConn = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
const actionConn = new Redis(REDIS_URL, { maxRetriesPerRequest: null });

// ── Queue deployment: build + run ─────────────────────────────
const deployWorker = new Worker<DeployJob>(
  "deployments",
  async (job) => {
    console.log(`[worker] deploy ${job.data.deploymentId}`);
    await runDeployment(job.data);
  },
  { connection: deployConn, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) },
);

// ── Queue aksi lifecycle: stop / restart / cleanup ────────────
const actionWorker = new Worker<ActionJob>(
  "service-actions",
  async (job) => {
    console.log(`[worker] aksi ${job.name} untuk service ${job.data.serviceId}`);
    switch (job.name) {
      case "stop":
        return stopService(job.data.serviceId);
      case "restart":
        return restartService(job.data.serviceId);
      case "cleanup":
        return cleanupService(job.data.serviceId);
      default:
        throw new Error(`Aksi tidak dikenal: ${job.name}`);
    }
  },
  { connection: actionConn, concurrency: 4 },
);

for (const [label, w] of [
  ["deploy", deployWorker],
  ["action", actionWorker],
] as const) {
  w.on("failed", (job, err) =>
    console.error(`[worker:${label}] gagal ${job?.id} — ${err.message}`),
  );
}

console.log("[worker] siap. Menunggu job deployment & aksi service...");
