"use client";
// Kartu paket + pemakaian live di sidebar (ala Railway/Vercel).
// Membaca /me/usage tiap 10s; paket awal diambil dari sesi agar tampil instan.
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getUsage, type Usage } from "@/lib/api";

const PLAN_BADGE: Record<string, string> = {
  FREE: "border-border text-muted-foreground",
  PRO: "border-violet-500/40 bg-violet-500/10 text-violet-300",
  ENTERPRISE: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

const PLAN_QUOTA: Record<string, string> = {
  FREE: "256 MB · shared CPU",
  PRO: "4 GB · 2 core / replika",
  ENTERPRISE: "Unlimited",
};

function fmtMem(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB` : `${mb} MB`;
}

export function UsageCard() {
  const { data: session } = useSession();
  const token = session?.apiToken;
  const [u, setU] = useState<Usage | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      setU(await getUsage(token));
    } catch {
      /* diamkan; kartu tetap tampil dgn data terakhir */
    }
  }, [token]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  // Fallback ke paket dari sesi selama fetch pertama belum selesai.
  const plan = u?.plan ?? ((session?.plan as string) ?? "FREE");
  const badge = PLAN_BADGE[plan] ?? PLAN_BADGE.FREE;

  // Meter RAM = pemakaian vs BUDGET RAM paket (tetap) = RAM/replica × maks
  // service. 0 = unlimited → tanpa meter. Budget tetap agar angkanya konsisten.
  const perReplicaMb = u?.limits.memoryMb ?? 0;
  const maxServices = u?.limits.maxServices ?? 0;
  const capMb = perReplicaMb > 0 && maxServices > 0 ? perReplicaMb * maxServices : 0;
  const usedMb = u?.usage.memMb ?? 0;
  const pct = capMb > 0 ? Math.min(100, Math.round((usedMb / capMb) * 100)) : 0;
  const planLabel = u?.limits.label ?? plan.charAt(0) + plan.slice(1).toLowerCase();

  return (
    <div className="rounded-xl border border-border bg-surface2/40 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Paket</span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badge}`}
        >
          {planLabel}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {PLAN_QUOTA[plan] ?? ""}
      </p>

      {/* Meter RAM (disembunyikan utk Enterprise/unlimited) */}
      {capMb > 0 && (
        <div className="mt-2.5">
          <div className="mb-1 flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">RAM aktif</span>
            <span className="font-mono text-foreground">
              {fmtMem(usedMb)} <span className="text-muted-foreground">/ {fmtMem(capMb)}</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface2">
            <div
              className={`h-full rounded-full transition-all ${
                pct >= 90
                  ? "bg-gradient-to-r from-amber-500 to-red-500"
                  : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
      {capMb === 0 && (
        <div className="mt-2.5 flex items-center justify-between text-[11px]">
          <span className="text-muted-foreground">RAM aktif</span>
          <span className="font-mono text-foreground">{fmtMem(usedMb)}</span>
        </div>
      )}

      {/* Ringkasan */}
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Service</span>
          <span className="font-mono">
            {u?.usage.runningServices ?? 0}/{u?.usage.services ?? 0}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Replika</span>
          <span className="font-mono">{u?.usage.replicasRunning ?? 0}</span>
        </div>
      </div>
    </div>
  );
}
