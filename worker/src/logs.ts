// Bus log deployment dengan dua driver:
//  - redis  : publish ke Redis pub/sub (produksi, multi-process).
//  - memory : EventEmitter in-process (mode demo tanpa Redis).
// Dipilih oleh QUEUE_DRIVER ("redis" default, atau "memory").
import { EventEmitter } from "node:events";
import { Redis } from "ioredis";

const useMemory = (process.env.QUEUE_DRIVER ?? "redis").toLowerCase() === "memory";

// Emitter dibagikan lintas modul dalam satu proses (mode memory).
export const logBus = new EventEmitter();
logBus.setMaxListeners(0);

let publisher: Redis | undefined;
if (!useMemory) {
  publisher = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
}

export function logChannel(deploymentId: string): string {
  return `logs:${deploymentId}`;
}

export async function publishLog(deploymentId: string, line: string): Promise<void> {
  if (useMemory) {
    logBus.emit(logChannel(deploymentId), line);
  } else {
    await publisher!.publish(logChannel(deploymentId), line);
  }
}
