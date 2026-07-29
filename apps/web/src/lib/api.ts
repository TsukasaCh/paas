// Klien API kecil untuk sisi client (semua request menyertakan Bearer token).
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function headers(token: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

export interface GitHubRepo {
  id: number;
  fullName: string;
  cloneUrl: string;
  defaultBranch: string;
  private: boolean;
}

export interface Branch {
  name: string;
}

// GET /github/repos
export async function getRepos(token: string): Promise<GitHubRepo[]> {
  const res = await fetch(`${API}/github/repos`, { headers: headers(token) });
  if (!res.ok) throw new Error(`Gagal memuat repo (${res.status})`);
  return res.json();
}

// GET /github/repos/:owner/:repo/branches
export async function getBranches(
  token: string,
  fullName: string,
): Promise<Branch[]> {
  const [owner, repo] = fullName.split("/");
  const res = await fetch(
    `${API}/github/repos/${owner}/${repo}/branches`,
    { headers: headers(token) },
  );
  if (!res.ok) throw new Error(`Gagal memuat branch (${res.status})`);
  return res.json();
}

export interface EnvVarInput {
  key: string;
  value: string;
}

export interface CreateServiceInput {
  name: string;
  type: "APP" | "DATABASE";
  source?: "GITHUB" | "IMAGE";
  repoFullName?: string;
  repoUrl?: string;
  branch?: string;
  containerPort?: number;
  image?: string;
  envVars?: EnvVarInput[];
}

export interface InstanceItem {
  id: string;
  replicaIndex: number;
  status: string;
  hostPort?: number | null;
  errorMessage?: string | null;
  node?: { name: string; region: string } | null;
}

export interface DeploymentItem {
  id: string;
  status: string;
  commitSha?: string | null;
  branch?: string | null;
  hostPort?: number | null;
  errorMessage?: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  node?: { name: string; region: string } | null;
  instances?: InstanceItem[];
}

export interface ServiceDetail {
  id: string;
  name: string;
  slug: string;
  /** URL publik dihitung server (ikut domain yang diatur admin). */
  url: string;
  type: "APP" | "DATABASE";
  source: "GITHUB" | "IMAGE";
  status: string;
  repoFullName?: string | null;
  repoUrl?: string | null;
  branch?: string | null;
  image?: string | null;
  containerPort?: number | null;
  replicas: number;
  project: { id: string; name: string };
  envVars: { id: string; key: string; value: string }[];
  deployments: DeploymentItem[];
}

export interface ReplicaMetric {
  instanceId: string;
  replicaIndex: number;
  /** RUNNING = sehat & menerima trafik · UNHEALTHY = hang · FAILED = mati. */
  status: "RUNNING" | "UNHEALTHY" | "FAILED";
  /** Berapa kali agent menghidupkan ulang replica ini (auto-heal). */
  restarts: number;
  node: string | null;
  region: string | null;
  hostPort: number | null;
  errorMessage: string | null;
  /** true = agent belum melapor akhir-akhir ini (angka tidak ditampilkan). */
  stale: boolean;
  cpu: number | null;
  memoryMb: number | null;
  uptimeSec: number | null;
}

export interface Metrics {
  running: boolean;
  healthy: number;
  replicas: ReplicaMetric[];
  total: { cpu: number | null; memoryMb: number | null; uptimeSec: number | null };
}

// GET /projects/services/:id
export async function getService(token: string, id: string): Promise<ServiceDetail> {
  const r = await fetch(`${API}/projects/services/${id}`, { headers: headers(token) });
  if (!r.ok) throw new Error(`Gagal memuat service (${r.status})`);
  return r.json();
}

// GET /projects/services/:id/metrics
export async function getMetrics(token: string, id: string): Promise<Metrics> {
  const r = await fetch(`${API}/projects/services/${id}/metrics`, {
    headers: headers(token),
  });
  if (!r.ok) throw new Error(`Gagal memuat metrics (${r.status})`);
  return r.json();
}

// PATCH /projects/services/:id
export async function updateService(
  token: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const r = await fetch(`${API}/projects/services/${id}`, {
    method: "PATCH",
    headers: headers(token, true),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`Gagal menyimpan (${r.status})`);
}

// PUT /projects/services/:id/env
export async function saveEnv(
  token: string,
  id: string,
  envVars: EnvVarInput[],
): Promise<void> {
  const r = await fetch(`${API}/projects/services/${id}/env`, {
    method: "PUT",
    headers: headers(token, true),
    body: JSON.stringify({ envVars }),
  });
  if (!r.ok) throw new Error(`Gagal menyimpan variables (${r.status})`);
}

// POST /projects/:id/services
export async function createService(
  token: string,
  projectId: string,
  input: CreateServiceInput,
): Promise<void> {
  const res = await fetch(`${API}/projects/${projectId}/services`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Gagal membuat service (${res.status})`);
}

// Aksi lifecycle service (stop / restart / delete).
export async function stopService(token: string, serviceId: string): Promise<void> {
  const res = await fetch(`${API}/projects/services/${serviceId}/stop`, {
    method: "POST",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Gagal stop service (${res.status})`);
}

export async function restartService(
  token: string,
  serviceId: string,
): Promise<void> {
  const res = await fetch(`${API}/projects/services/${serviceId}/restart`, {
    method: "POST",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Gagal restart service (${res.status})`);
}

export async function deleteService(
  token: string,
  serviceId: string,
): Promise<void> {
  const res = await fetch(`${API}/projects/services/${serviceId}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Gagal hapus service (${res.status})`);
}

export async function deleteProject(
  token: string,
  projectId: string,
): Promise<void> {
  const res = await fetch(`${API}/projects/${projectId}`, {
    method: "DELETE",
    headers: headers(token),
  });
  if (!res.ok) throw new Error(`Gagal hapus project (${res.status})`);
}

export interface Usage {
  plan: "FREE" | "PRO" | "ENTERPRISE";
  limits: { label: string; memoryMb: number; cpus: number; maxReplicas: number };
  usage: {
    projects: number;
    services: number;
    runningServices: number;
    replicasRunning: number;
    memMb: number;
    cpuPct: number;
  };
}

// GET /me/usage — paket + pemakaian live user (untuk kartu sidebar).
export async function getUsage(token: string): Promise<Usage> {
  const r = await fetch(`${API}/me/usage`, { headers: headers(token) });
  if (!r.ok) throw new Error(`Gagal memuat usage (${r.status})`);
  return r.json();
}
