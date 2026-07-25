// Kumpulkan info & telemetry host tempat agent berjalan.
import os from "node:os";
import Docker from "dockerode";
import type { AgentSysInfo } from "@minipaas/agent-proto";

export const AGENT_VERSION = "0.1.0";

export async function collectSysInfo(): Promise<AgentSysInfo> {
  let dockerAvailable = false;
  try {
    await new Docker().version();
    dockerAvailable = true;
  } catch {
    dockerAvailable = false;
  }

  return {
    hostname: os.hostname(),
    os: `${os.type()} ${os.release()}`,
    arch: os.arch(),
    cpuCores: os.cpus().length,
    memoryMb: Math.round(os.totalmem() / 1024 / 1024),
    dockerAvailable,
    agentVersion: AGENT_VERSION,
  };
}

// CPU% dihitung dari delta idle/total antar sampling.
let prev = cpuTimes();

function cpuTimes() {
  const c = os.cpus();
  let idle = 0;
  let total = 0;
  for (const one of c) {
    for (const k of Object.keys(one.times) as (keyof typeof one.times)[]) {
      total += one.times[k];
    }
    idle += one.times.idle;
  }
  return { idle, total };
}

export function sampleTelemetry(): { cpuPct: number; memPct: number } {
  const cur = cpuTimes();
  const idleDiff = cur.idle - prev.idle;
  const totalDiff = cur.total - prev.total;
  prev = cur;
  const cpuPct = totalDiff > 0 ? Math.max(0, Math.min(100, (1 - idleDiff / totalDiff) * 100)) : 0;
  const memPct = ((os.totalmem() - os.freemem()) / os.totalmem()) * 100;
  return {
    cpuPct: Math.round(cpuPct * 10) / 10,
    memPct: Math.round(memPct * 10) / 10,
  };
}
