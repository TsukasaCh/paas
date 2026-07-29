// Paket langganan → kuota resource. Dipakai untuk membatasi replica saat buat
// service, dan untuk mengatur limit Memory/CPU container saat deploy.
export type Plan = "FREE" | "PRO" | "ENTERPRISE";

export interface PlanLimits {
  label: string;
  maxReplicas: number;
  /** Maksimal service yang boleh BERJALAN bersamaan per akun. 0 = tanpa batas. */
  maxServices: number;
  /** Batas RAM per replica (MB). 0 = tanpa batas. */
  memoryMb: number;
  /** Batas CPU per replica (core). < 1 = shared; 0 = tanpa batas. */
  cpus: number;
}

export const PLANS: Record<Plan, PlanLimits> = {
  FREE: { label: "Free", maxReplicas: 1, maxServices: 1, memoryMb: 256, cpus: 0.5 },
  PRO: { label: "Pro", maxReplicas: 2, maxServices: 3, memoryMb: 4096, cpus: 2 },
  ENTERPRISE: { label: "Enterprise", maxReplicas: 50, maxServices: 0, memoryMb: 0, cpus: 0 },
};

export function normalizePlan(p?: string | null): Plan {
  const up = (p ?? "FREE").toUpperCase();
  return up === "PRO" || up === "ENTERPRISE" ? (up as Plan) : "FREE";
}

export function limitsFor(plan?: string | null): PlanLimits {
  return PLANS[normalizePlan(plan)];
}
