/**
 * Sampling metrics per replica — HARUS dilakukan agent.
 *
 * Control plane tidak boleh mengukur ini: PID/container hanya ada di mesin
 * agent. Mengukur dari control plane akan selalu gagal untuk VPS jarak jauh,
 * atau lebih buruk: PID kebetulan cocok dengan proses lain dan melaporkan
 * angka yang salah.
 */
import Docker from "dockerode";
import pidusage from "pidusage";
import type { InstanceMetric } from "@minipaas/agent-proto";
import { listRunning } from "./exec.js";
import { checkHealthy } from "./health.js";

const docker = new Docker();

export async function sampleInstances(): Promise<InstanceMetric[]> {
  const running = listRunning();
  const out: InstanceMetric[] = [];

  for (const r of running) {
    const uptimeSec = Math.max(0, Math.round((Date.now() - r.startedAt) / 1000));
    const healthy = await checkHealthy(r.instanceId, r.port, r.startedAt);
    try {
      if (r.pid) {
        const s = await pidusage(r.pid);
        out.push({
          instanceId: r.instanceId,
          cpuPct: Math.round(s.cpu * 10) / 10,
          memMb: Math.round((s.memory / 1024 / 1024) * 10) / 10,
          uptimeSec,
          healthy,
        });
      } else if (r.containerId) {
        const st: any = await docker.getContainer(r.containerId).stats({ stream: false });
        out.push({
          instanceId: r.instanceId,
          cpuPct: Math.round(dockerCpuPct(st) * 10) / 10,
          memMb: Math.round(((st?.memory_stats?.usage ?? 0) / 1024 / 1024) * 10) / 10,
          uptimeSec,
          healthy,
        });
      }
    } catch {
      // Proses/container hilang di tengah sampling — abaikan replica ini
      // (control plane akan menandainya mati karena tak dilaporkan).
    }
  }
  return out;
}

/** Hitung CPU% container ala `docker stats`. */
function dockerCpuPct(st: any): number {
  const cpu = st?.cpu_stats,
    pre = st?.precpu_stats;
  if (!cpu || !pre) return 0;
  const delta = cpu.cpu_usage?.total_usage - pre.cpu_usage?.total_usage;
  const sysDelta = cpu.system_cpu_usage - pre.system_cpu_usage;
  const cores = cpu.online_cpus || cpu.cpu_usage?.percpu_usage?.length || 1;
  if (!(delta > 0) || !(sysDelta > 0)) return 0;
  return (delta / sysDelta) * cores * 100;
}
