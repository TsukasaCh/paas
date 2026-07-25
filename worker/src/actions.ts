/**
 * Aksi lifecycle service (stop / restart / cleanup) — delegasi ke runtime aktif
 * (docker atau node), sesuai DEPLOY_RUNTIME.
 */
import { activeRuntime } from "./runtime.js";

export interface ActionJob {
  serviceId: string;
}

export const stopService = (serviceId: string) => activeRuntime.stop(serviceId);
export const restartService = (serviceId: string) => activeRuntime.restart(serviceId);
export const cleanupService = (serviceId: string) => activeRuntime.cleanup(serviceId);
