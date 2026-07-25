/**
 * Abstraksi runtime deployment. Dua implementasi:
 *  - docker : build image + jalankan container (butuh Docker daemon).
 *  - node   : jalankan aplikasi Node sebagai child process (tanpa Docker).
 *
 * Dipilih lewat env DEPLOY_RUNTIME ("docker" default, atau "node").
 */
import type { Service, EnvironmentVariable } from "@minipaas/db";

export type ServiceWithEnv = Service & { envVars: EnvironmentVariable[] };

export interface StartContext {
  deploymentId: string;
  service: ServiceWithEnv;
  workDir: string; // direktori hasil clone
  hostPort: number; // port publik yang dialokasikan
  containerPort: number; // port yang diekspos app (untuk docker)
  log: (line: string) => Promise<void>;
}

export interface Runtime {
  readonly name: string;
  /** Materialisasi & jalankan; kembalikan handle (containerId atau pid). */
  start(ctx: StartContext): Promise<{ handle: string }>;
  stop(serviceId: string): Promise<void>;
  restart(serviceId: string): Promise<void>;
  cleanup(serviceId: string): Promise<void>;
}

import { dockerRuntime } from "./runtimes/docker.js";
import { nodeRuntime } from "./runtimes/node.js";

const selected = (process.env.DEPLOY_RUNTIME ?? "docker").toLowerCase();

export const activeRuntime: Runtime =
  selected === "node" ? nodeRuntime : dockerRuntime;

console.log(`[worker] runtime aktif: ${activeRuntime.name}`);
