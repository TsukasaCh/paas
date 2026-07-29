"use client";
// Detail service ala Railway: header + tab Deployments / Logs / Metrics / Variables / Settings.
// Dipakai oleh halaman penuh (/dashboard/services/[id]) DAN drawer di canvas project.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  getService,
  getMetrics,
  updateService,
  saveEnv,
  deleteService,
  type ServiceDetail,
  type Metrics,
  type EnvVarInput,
} from "@/lib/api";
import { useProjectStore } from "@/store/use-project-store";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { DeploymentLogs } from "@/components/deployment-logs";
import { IconRocket, IconDatabase, IconBox, IconGlobe, IconWarn, IconX, IconCheck } from "@/components/icons";
import { stopService, restartService } from "@/lib/api";

type Tab = "deployments" | "logs" | "metrics" | "variables" | "settings";
const TABS: { id: Tab; label: string }[] = [
  { id: "deployments", label: "Deployments" },
  { id: "logs", label: "Logs" },
  { id: "metrics", label: "Metrics" },
  { id: "variables", label: "Variables" },
  { id: "settings", label: "Settings" },
];

export function ServiceDetailView({
  id,
  variant = "page",
  onClose,
  onDeleted,
}: {
  id: string;
  variant?: "page" | "drawer";
  onClose?: () => void;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const token = session?.apiToken;
  const deployService = useProjectStore((s) => s.deployService);

  const [svc, setSvc] = useState<ServiceDetail | null>(null);
  const [tab, setTab] = useState<Tab>("deployments");
  const [selectedDep, setSelectedDep] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const s = await getService(token, id);
      setSvc(s);
      setSelectedDep((cur) => cur ?? s.deployments[0]?.id ?? null);
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [token, id]);

  useEffect(() => {
    if (!token) return;
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [token, refresh]);

  if (!svc)
    return <p className="p-10 text-sm text-muted-foreground">Memuat service…</p>;

  // URL publik dihitung server (ikut domain yang diatur admin).
  const live = svc.deployments.find((d) => d.status === "RUNNING");
  const url = live ? svc.url : null;

  async function handleDeploy() {
    if (!token) return;
    setErr(null);
    try {
      const depId = await deployService(token, id);
      if (depId) {
        setSelectedDep(depId);
        setTab("logs");
      }
      refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const isDrawer = variant === "drawer";

  return (
    <div
      className={
        isDrawer
          ? "flex h-full flex-col overflow-hidden bg-[#0b0b10]"
          : "mx-auto max-w-5xl px-8 py-8"
      }
    >
      {isDrawer ? (
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <Link href="/dashboard" className="hover:text-foreground">
              Projects
            </Link>
            <span>/</span>
            <span className="truncate">{svc.project.name}</span>
            <span>/</span>
            <span className="truncate text-foreground">{svc.name}</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="btn-ghost shrink-0 rounded-lg p-1.5"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:text-foreground">
            Projects
          </Link>
          <span>/</span>
          <span>{svc.project.name}</span>
          <span>/</span>
          <span className="text-foreground">{svc.name}</span>
        </div>
      )}

      <div className={isDrawer ? "flex-1 overflow-y-auto px-5 py-5" : ""}>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 text-violet-200 ring-1 ring-inset ring-white/5">
            {svc.type === "DATABASE" ? (
              <IconDatabase className="h-5 w-5" />
            ) : svc.source === "IMAGE" ? (
              <IconBox className="h-5 w-5" />
            ) : (
              <IconRocket className="h-5 w-5" />
            )}
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{svc.name}</h1>
            <p className="font-mono text-xs text-muted-foreground">
              {svc.source === "GITHUB"
                ? `${svc.repoFullName ?? svc.repoUrl} · ${svc.branch}`
                : svc.image}
            </p>
          </div>
          <ServiceStatusBadge status={svc.status as any} />
        </div>

        <div className="flex items-center gap-2">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
            >
              <IconGlobe className="h-3.5 w-3.5" /> Buka
            </a>
          )}
          <button onClick={handleDeploy} className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold">
            Deploy
          </button>
          {svc.status === "RUNNING" && (
            <button
              onClick={() => token && stopService(token, id).then(refresh)}
              className="btn-ghost rounded-lg px-3 py-1.5 text-xs"
            >
              Stop
            </button>
          )}
          <button
            onClick={() => token && restartService(token, id).then(refresh)}
            className="btn-ghost rounded-lg px-3 py-1.5 text-xs"
          >
            Restart
          </button>
        </div>
      </div>

      {url && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-border bg-surface2/50 px-4 py-3">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px] shadow-emerald-400/50" />
          <span className="text-sm text-muted-foreground">Live di</span>
          <a href={url} target="_blank" rel="noreferrer" className="font-mono text-sm text-violet-300 hover:underline">
            {url}
          </a>
        </div>
      )}

      {err && (
        <p className="mb-4 flex items-start gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          <IconWarn className="mt-0.5 h-4 w-4 shrink-0" />
          {err}
        </p>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
              tab === t.id
                ? "border-violet-500 font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "deployments" && (
        <DeploymentsTab
          svc={svc}
          onView={(depId) => {
            setSelectedDep(depId);
            setTab("logs");
          }}
        />
      )}

      {tab === "logs" && (
        <div className="space-y-3">
          {svc.deployments.length > 1 && (
            <select
              value={selectedDep ?? ""}
              onChange={(e) => setSelectedDep(e.target.value)}
              className="field px-3 py-2 text-sm"
            >
              {svc.deployments.map((d) => (
                <option key={d.id} value={d.id}>
                  {new Date(d.createdAt).toLocaleString("id-ID")} · {d.status}
                </option>
              ))}
            </select>
          )}
          {selectedDep ? (
            <DeploymentLogs deploymentId={selectedDep} token={token} height="h-[28rem]" />
          ) : (
            <Empty text="Belum ada deployment. Klik Deploy untuk mulai." />
          )}
        </div>
      )}

      {tab === "metrics" && <MetricsTab token={token} id={id} />}

      {tab === "variables" && <VariablesTab token={token} svc={svc} onSaved={refresh} />}

      {tab === "settings" && (
        <SettingsTab
          token={token}
          svc={svc}
          onSaved={refresh}
          onDeleted={onDeleted ?? (() => router.push("/dashboard"))}
        />
      )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card p-10 text-center text-sm text-muted-foreground">{text}</div>
  );
}

// ── Deployments ────────────────────────────────────────────────
function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - +new Date(iso)) / 1000);
  if (s < 45) return "baru saja";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return `${d} hari lalu`;
}

function statusMeta(status: string) {
  switch (status) {
    case "RUNNING":
      return { label: "Aktif", pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300", line: "Deployment berhasil", tone: "ok" as const };
    case "FAILED":
      return { label: "Gagal", pill: "border-red-500/30 bg-red-500/10 text-red-300", line: "Deployment gagal", tone: "err" as const };
    case "BUILDING":
      return { label: "Build", pill: "border-amber-500/30 bg-amber-500/10 text-amber-300", line: "Sedang membangun…", tone: "run" as const };
    case "DEPLOYING":
      return { label: "Deploy", pill: "border-amber-500/30 bg-amber-500/10 text-amber-300", line: "Sedang men-deploy…", tone: "run" as const };
    case "QUEUED":
      return { label: "Antre", pill: "border-border bg-surface2 text-muted-foreground", line: "Menunggu antrean…", tone: "run" as const };
    case "STOPPED":
      return { label: "Berhenti", pill: "border-border bg-surface2 text-muted-foreground", line: "Dihentikan", tone: "idle" as const };
    default:
      return { label: status, pill: "border-border bg-surface2 text-muted-foreground", line: status, tone: "idle" as const };
  }
}

function DeploymentsTab({
  svc,
  onView,
}: {
  svc: ServiceDetail;
  onView: (id: string) => void;
}) {
  if (!svc.deployments.length) return <Empty text="Belum ada deployment." />;
  const via = svc.source === "IMAGE" ? "Docker image" : "GitHub";

  return (
    <div className="space-y-3">
      {svc.deployments.map((d) => {
        const m = statusMeta(d.status);
        const active = d.status === "RUNNING";
        const inst = d.instances ?? [];
        const up = inst.filter((i) => i.status === "RUNNING").length;
        const dur =
          d.startedAt && d.finishedAt
            ? `${Math.max(1, Math.round((+new Date(d.finishedAt) - +new Date(d.startedAt)) / 1000))}s`
            : null;
        const source = d.commitSha
          ? `${d.commitSha.slice(0, 7)} · ${d.branch}`
          : (svc.image ?? svc.repoFullName ?? svc.name);

        return (
          <div
            key={d.id}
            className={`card p-4 ${active ? "border-emerald-500/25 ring-1 ring-inset ring-emerald-500/10" : ""}`}
          >
            {/* Baris atas: status + sumber + waktu | region + replica */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${m.pill}`}
                >
                  {m.label}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-foreground">{source}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {timeAgo(d.createdAt)} · via {via}
                    {dur ? ` · build ${dur}` : ""}
                  </p>
                </div>
              </div>
              <div className="shrink-0 space-y-0.5 text-right text-[11px] text-muted-foreground">
                {d.node?.region && (
                  <div className="flex items-center justify-end gap-1">
                    <IconGlobe className="h-3 w-3" /> {d.node.region}
                  </div>
                )}
                {inst.length > 0 && (
                  <div>
                    {up}/{inst.length} replica
                  </div>
                )}
              </div>
            </div>

            {/* Baris status + aksi */}
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                {m.tone === "ok" ? (
                  <IconCheck className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : m.tone === "err" ? (
                  <IconWarn className="h-3.5 w-3.5 shrink-0 text-red-400" />
                ) : m.tone === "run" ? (
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
                ) : (
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500" />
                )}
                <span
                  className={`truncate ${m.tone === "err" ? "text-red-300" : "text-muted-foreground"}`}
                >
                  {d.errorMessage && d.status === "FAILED" ? d.errorMessage : m.line}
                </span>
              </span>
              <button
                onClick={() => onView(d.id)}
                className="btn-ghost shrink-0 rounded-lg px-2.5 py-1.5 text-xs"
              >
                Lihat log →
              </button>
            </div>

            {/* Chip per replica */}
            {inst.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {inst.map((i) => (
                  <span
                    key={i.id}
                    title={`replica #${i.replicaIndex} · ${i.node?.name ?? "-"}${i.hostPort ? ` · :${i.hostPort}` : ""}`}
                    className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
                      i.status === "RUNNING"
                        ? "bg-emerald-500/10 text-emerald-300"
                        : i.status === "FAILED"
                          ? "bg-red-500/10 text-red-300"
                          : "bg-surface2 text-muted-foreground"
                    }`}
                  >
                    #{i.replicaIndex}
                    {i.hostPort ? `:${i.hostPort}` : ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Metrics ────────────────────────────────────────────────────
function MetricsTab({ token, id }: { token?: string; id: string }) {
  const [m, setM] = useState<Metrics | null>(null);
  const [hist, setHist] = useState<{ cpu: number; mem: number }[]>([]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const tick = async () => {
      try {
        const d = await getMetrics(token, id);
        if (!alive) return;
        setM(d);
        if (d.total.cpu !== null) {
          setHist((p) => [...p.slice(-59), { cpu: d.total.cpu!, mem: d.total.memoryMb ?? 0 }]);
        }
      } catch {
        /* ignore */
      }
    };
    tick();
    const t = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token, id]);

  if (!m?.running)
    return <Empty text="Service tidak berjalan — metrics tersedia saat status Running." />;

  const semuaBasi = m.replicas.length > 0 && m.replicas.every((r) => r.stale);
  const maxCpu = Math.max(10, ...hist.map((h) => h.cpu));
  const maxMem = Math.max(10, ...hist.map((h) => h.mem));

  return (
    <div className="space-y-4">
      {semuaBasi && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <IconWarn className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Agent belum melaporkan metrics terbaru — angka disembunyikan agar tidak
            menyesatkan. Cek koneksi node.
          </span>
        </div>
      )}

      {/* Ringkasan seluruh replica */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="CPU (total)" value={m.total.cpu !== null ? `${m.total.cpu}%` : "—"} />
        <Stat
          label="Memori (total)"
          value={m.total.memoryMb !== null ? `${m.total.memoryMb} MB` : "—"}
        />
        <Stat
          label="Uptime"
          value={m.total.uptimeSec !== null ? fmtUptime(m.total.uptimeSec) : "—"}
        />
        <Stat label="Replica" value={`${m.replicas.filter((r) => !r.stale).length}/${m.replicas.length}`} />
      </div>

      <Chart title="CPU total (%)" data={hist.map((h) => h.cpu)} max={maxCpu} color="from-violet-500 to-fuchsia-500" />
      <Chart title="Memori total (MB)" data={hist.map((h) => h.mem)} max={maxMem} color="from-sky-500 to-cyan-500" />

      {/* Rincian per replica */}
      <div className="card divide-y divide-border">
        <p className="px-4 py-2 text-xs text-muted-foreground">Per replica</p>
        {m.replicas.map((r) => {
          const sehat = r.status === "RUNNING";
          return (
            <div key={r.instanceId} className="flex items-center gap-4 px-4 py-3">
              <span className="font-mono text-xs text-muted-foreground">
                #{r.replicaIndex}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-xs ${
                  sehat
                    ? "text-emerald-300"
                    : r.status === "UNHEALTHY"
                      ? "text-amber-300"
                      : "text-red-300"
                }`}
                title={r.errorMessage ?? undefined}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    sehat
                      ? "bg-emerald-400 shadow-[0_0_8px_2px] shadow-emerald-400/50"
                      : r.status === "UNHEALTHY"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-red-400"
                  }`}
                />
                {sehat ? "Sehat" : r.status === "UNHEALTHY" ? "Tidak sehat" : "Mati"}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">
                  {r.node ?? "—"}
                  <span className="text-muted-foreground">
                    {r.region ? ` · ${r.region}` : ""}
                    {r.hostPort ? ` · :${r.hostPort}` : ""}
                    {r.restarts > 0 ? ` · ↻ ${r.restarts}× dipulihkan` : ""}
                  </span>
                </p>
                {!sehat && r.errorMessage && (
                  <p className="truncate text-xs text-muted-foreground">
                    {r.errorMessage} — dikeluarkan dari rotasi trafik
                  </p>
                )}
              </div>
              {sehat && !r.stale ? (
                <span className="font-mono text-xs text-muted-foreground">
                  CPU {r.cpu}% · {r.memoryMb} MB · {fmtUptime(r.uptimeSec ?? 0)}
                </span>
              ) : (
                <span className="text-xs text-amber-300">
                  {r.stale ? "data basi" : "—"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  return `${Math.floor(s / 3600)}j ${Math.floor((s % 3600) / 60)}m`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function Chart({
  title,
  data,
  max,
  color,
}: {
  title: string;
  data: number[];
  max: number;
  color: string;
}) {
  return (
    <div className="card p-4">
      <p className="mb-3 text-xs text-muted-foreground">{title}</p>
      <div className="flex h-24 items-end gap-[2px]">
        {data.length === 0 && (
          <span className="text-xs text-muted-foreground">Mengumpulkan data…</span>
        )}
        {data.map((v, i) => (
          <div
            key={i}
            title={`${v}`}
            className={`flex-1 rounded-t bg-gradient-to-t ${color}`}
            style={{ height: `${Math.max(2, (v / max) * 100)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Variables ──────────────────────────────────────────────────
function VariablesTab({
  token,
  svc,
  onSaved,
}: {
  token?: string;
  svc: ServiceDetail;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<EnvVarInput[]>(
    svc.envVars.length ? svc.envVars.map((e) => ({ key: e.key, value: e.value })) : [{ key: "", value: "" }],
  );
  const [saving, setSaving] = useState(false);
  const [ok, setOk] = useState(false);

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      await saveEnv(token, svc.id, rows.filter((r) => r.key.trim()));
      setOk(true);
      setTimeout(() => setOk(false), 2000);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Variabel di-inject saat service dijalankan. Deploy ulang agar berlaku.
        </p>
        <button
          onClick={() => setRows((p) => [...p, { key: "", value: "" }])}
          className="text-xs text-violet-400 hover:underline"
        >
          + Tambah
        </button>
      </div>
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="field w-full px-3 py-2 font-mono text-sm"
              value={r.key}
              onChange={(e) =>
                setRows((p) => p.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)))
              }
              placeholder="KEY"
            />
            <input
              className="field w-full px-3 py-2 font-mono text-sm"
              value={r.value}
              onChange={(e) =>
                setRows((p) => p.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))
              }
              placeholder="value"
            />
            <button
              onClick={() => setRows((p) => p.filter((_, idx) => idx !== i))}
              className="btn-ghost grid place-items-center rounded-lg px-2"
              aria-label="Hapus baris"
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
          {saving ? "Menyimpan…" : "Simpan"}
        </button>
        {ok && (
          <span className="flex items-center gap-1 text-xs text-emerald-300">
            <IconCheck className="h-3.5 w-3.5" /> Tersimpan
          </span>
        )}
      </div>
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────
// Batas replica per paket (harus cocok dengan apps/api/src/lib/plans.ts).
const PLAN_REPLICAS: Record<string, { label: string; max: number }> = {
  FREE: { label: "Free", max: 1 },
  PRO: { label: "Pro", max: 2 },
  ENTERPRISE: { label: "Enterprise", max: 50 },
};

function SettingsTab({
  token,
  svc,
  onSaved,
  onDeleted,
}: {
  token?: string;
  svc: ServiceDetail;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { data: session } = useSession();
  const plan = PLAN_REPLICAS[(session?.plan as string) ?? "FREE"] ?? PLAN_REPLICAS.FREE;
  const maxReplicas = plan.max;
  const [form, setForm] = useState({
    name: svc.name,
    branch: svc.branch ?? "main",
    image: svc.image ?? "",
    containerPort: svc.containerPort ?? 3000,
    replicas: svc.replicas ?? 1,
  });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const f = "field w-full px-3 py-2 text-sm";

  async function save() {
    if (!token) return;
    setSaving(true);
    try {
      await updateService(token, svc.id, form);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-5">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Nama</label>
          <input className={f} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        {svc.source === "GITHUB" ? (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Branch</label>
            <input className={f} value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Image</label>
            <input className={f} value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Port aplikasi</label>
            <input
              type="number"
              className={f}
              value={form.containerPort}
              onChange={(e) => setForm({ ...form, containerPort: +e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Replicas <span className="opacity-60">(1–{maxReplicas})</span>
            </label>
            <input
              type="number"
              min={1}
              max={maxReplicas}
              className={f}
              value={form.replicas}
              onChange={(e) =>
                setForm({
                  ...form,
                  replicas: Math.min(maxReplicas, Math.max(1, +e.target.value || 1)),
                })
              }
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Replica disebar ke node yang tersedia. Deploy ulang agar berlaku.
          {maxReplicas <= 2 && (
            <>
              {" "}
              Paket <span className="text-foreground">{plan.label}</span> maksimal {maxReplicas}{" "}
              replica — upgrade untuk lebih banyak.
            </>
          )}
        </p>
        <button onClick={save} disabled={saving} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
          {saving ? "Menyimpan…" : "Simpan perubahan"}
        </button>
      </div>

      <div className="card border-red-500/20 p-5">
        <p className="font-medium text-red-300">Danger zone</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Menghapus service akan menghentikan & membuang seluruh deployment-nya.
        </p>
        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-2 text-sm text-red-300 hover:bg-red-500/20"
          >
            Hapus service
          </button>
        ) : (
          <div className="mt-3 flex gap-2">
            <button onClick={() => setConfirm(false)} className="btn-ghost rounded-lg px-4 py-2 text-sm">
              Batal
            </button>
            <button
              onClick={() => token && deleteService(token, svc.id).then(onDeleted)}
              className="rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300"
            >
              Ya, hapus permanen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
