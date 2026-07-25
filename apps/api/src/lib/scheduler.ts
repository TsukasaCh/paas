// Scheduler: pilih node yang agent-nya benar-benar terhubung & punya kapasitas.
import { prisma } from "@minipaas/db";
import { isConnected } from "../agent-server.js";

// Node dianggap online bila heartbeat terakhir < 60 detik DAN socket terbuka.
const STALE_MS = 60_000;

export function isNodeOnline(n: { lastSeenAt: Date | null; id: string }): boolean {
  if (!n.lastSeenAt) return false;
  if (Date.now() - n.lastSeenAt.getTime() > STALE_MS) return false;
  return isConnected(n.id);
}

export async function pickAvailableNode(): Promise<{ id: string; name: string } | null> {
  return (await pickNodesForReplicas(1))[0] ?? null;
}

/**
 * Pilih node untuk N replica — disebar (round-robin) ke node online yang
 * masih punya kapasitas. Kalau node lebih sedikit dari replica, node dipakai
 * ulang selama kapasitasnya cukup.
 */
export async function pickNodesForReplicas(
  replicas: number,
): Promise<{ id: string; name: string }[]> {
  const nodes = await prisma.node.findMany({ where: { status: "ACTIVE" } });
  const usable: { id: string; name: string; free: number }[] = [];

  for (const node of nodes) {
    if (!isNodeOnline(node)) continue;
    const running = await prisma.instance.count({
      where: { nodeId: node.id, status: "RUNNING" },
    });
    const free = node.maxServices - running;
    if (free > 0) usable.push({ id: node.id, name: node.name, free });
  }
  if (!usable.length) return [];

  // Round-robin: sebar merata, node dengan sisa kapasitas terbanyak dulu.
  usable.sort((a, b) => b.free - a.free);
  const out: { id: string; name: string }[] = [];
  let i = 0;
  while (out.length < replicas) {
    const before = out.length;
    for (const n of usable) {
      if (out.length >= replicas) break;
      if (n.free > 0) {
        out.push({ id: n.id, name: n.name });
        n.free--;
      }
    }
    if (out.length === before) break; // semua kapasitas habis
    i++;
    if (i > replicas + 1) break;
  }
  return out;
}
