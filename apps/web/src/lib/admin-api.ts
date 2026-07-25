// Klien API admin (butuh Bearer token dengan role ADMIN).
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function h(token: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

export interface NodeItem {
  id: string;
  name: string;
  region: string;
  status: "ACTIVE" | "DRAINING"; // niat admin
  online: boolean; // dari heartbeat agent
  hostname?: string | null;
  os?: string | null;
  arch?: string | null;
  agentVersion?: string | null;
  cpuCores: number;
  memoryMb: number;
  dockerAvailable: boolean;
  cpuPct?: number | null;
  memPct?: number | null;
  lastSeenAt?: string | null;
  maxServices: number;
  running: number;
}

export interface AdminStats {
  nodes: number;
  online: number;
  users: number;
  services: number;
  running: number;
}

export interface CreateNodeResult {
  node: NodeItem;
  token: string;
  installCommand: string;
}

export async function getStats(token: string): Promise<AdminStats> {
  const r = await fetch(`${API}/admin/stats`, { headers: h(token) });
  if (!r.ok) throw new Error(`stats ${r.status}`);
  return r.json();
}

export async function getNodes(token: string): Promise<NodeItem[]> {
  const r = await fetch(`${API}/admin/nodes`, { headers: h(token) });
  if (!r.ok) throw new Error(`nodes ${r.status}`);
  return r.json();
}

export async function createNode(
  token: string,
  data: { name: string; region?: string; maxServices?: number },
): Promise<CreateNodeResult> {
  const r = await fetch(`${API}/admin/nodes`, {
    method: "POST",
    headers: h(token, true),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`create ${r.status}`);
  return r.json();
}

export async function updateNode(
  token: string,
  id: string,
  data: Partial<Pick<NodeItem, "name" | "region" | "status" | "maxServices">>,
): Promise<void> {
  const r = await fetch(`${API}/admin/nodes/${id}`, {
    method: "PATCH",
    headers: h(token, true),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`update ${r.status}`);
}

// ── DNS / domain ───────────────────────────────────────────────
export interface DnsConfig {
  provider: string;
  enabled: boolean;
  /** Domain aplikasi user → app tersaji di <slug>.<domain> */
  domain: string;
  /** Domain platform sendiri; kosong = pakai nilai dari env. */
  dashboardDomain: string;
  apiDomain: string;
  zoneId: string;
  target: string;
  proxied: boolean;
  hasToken: boolean;
  lastCheckAt?: string | null;
  lastOk: boolean;
  lastError?: string | null;
  envFallbackDomain: string;
}

export async function getDns(token: string): Promise<DnsConfig> {
  const r = await fetch(`${API}/admin/dns`, { headers: h(token) });
  if (!r.ok) throw new Error(`dns ${r.status}`);
  return r.json();
}

export async function saveDns(
  token: string,
  data: Partial<DnsConfig> & { apiToken?: string },
): Promise<void> {
  const r = await fetch(`${API}/admin/dns`, {
    method: "PUT",
    headers: h(token, true),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`simpan gagal (${r.status})`);
}

export async function testDns(
  token: string,
  data: { apiToken?: string; zoneId?: string },
): Promise<{ ok: boolean; zoneName?: string; error?: string }> {
  const r = await fetch(`${API}/admin/dns/test`, {
    method: "POST",
    headers: h(token, true),
    body: JSON.stringify(data),
  });
  return r.json();
}

export async function deleteNode(token: string, id: string): Promise<void> {
  const r = await fetch(`${API}/admin/nodes/${id}`, {
    method: "DELETE",
    headers: h(token),
  });
  if (!r.ok) throw new Error(`delete ${r.status}`);
}
