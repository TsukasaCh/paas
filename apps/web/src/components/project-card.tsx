"use client";
// Kartu satu Project: daftar Service (tile) + status + aksi (dark, ala Railway).
import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useProjectStore, type Project } from "@/store/use-project-store";
import { ServiceStatusBadge } from "./service-status-badge";
import { DeploymentLogs } from "./deployment-logs";
import { AddServiceDialog } from "./add-service-dialog";
import { stopService, restartService, deleteService } from "@/lib/api";

export function ProjectCard({ project }: { project: Project }) {
  const { data: session } = useSession();
  const token = session?.apiToken;
  const deployService = useProjectStore((s) => s.deployService);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const [activeDeployment, setActiveDeployment] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);
  const [deployErr, setDeployErr] = useState<Record<string, string>>({});

  async function handleDeploy(serviceId: string) {
    if (!token) return;
    setDeployErr((p) => ({ ...p, [serviceId]: "" }));
    try {
      const deploymentId = await deployService(token, serviceId);
      if (deploymentId) setActiveDeployment(deploymentId);
    } catch (e) {
      setDeployErr((p) => ({ ...p, [serviceId]: (e as Error).message }));
    }
  }

  async function runAction(
    serviceId: string,
    action: (t: string, id: string) => Promise<void>,
  ) {
    if (!token) return;
    setBusy(serviceId);
    try {
      await action(token, serviceId);
      await fetchProjects(token);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-surface2 text-sm">
            🗂️
          </span>
          <h3 className="font-semibold tracking-tight">{project.name}</h3>
          <span className="rounded-full bg-surface2 px-2 py-0.5 text-[11px] text-muted-foreground">
            {project.services.length} service
          </span>
          <Link
            href={`/dashboard/projects/${project.id}`}
            className="text-xs text-violet-400 hover:underline"
          >
            Architecture →
          </Link>
        </div>
        {token && (
          <AddServiceDialog
            projectId={project.id}
            token={token}
            onCreated={() => fetchProjects(token)}
          />
        )}
      </div>

      <ul className="space-y-2.5">
        {project.services.map((svc) => (
          <li
            key={svc.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface2/50 px-3.5 py-3 transition-colors hover:border-border/80 hover:bg-surface2"
          >
            <Link
              href={`/dashboard/services/${svc.id}`}
              className="flex min-w-0 flex-1 items-center gap-3 group"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 text-base ring-1 ring-inset ring-white/5">
                {svc.type === "DATABASE" ? "🗄️" : "🚀"}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium group-hover:text-violet-300">
                    {svc.name}
                  </span>
                  <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border">
                    {svc.type}
                  </span>
                </div>
                {svc.repoFullName && (
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                    {svc.repoFullName}
                    <span className="text-muted-foreground/50"> · {svc.branch}</span>
                  </span>
                )}
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <ServiceStatusBadge status={svc.status} />
              <button
                onClick={() => handleDeploy(svc.id)}
                disabled={svc.status === "DEPLOYING" || busy === svc.id}
                className="btn-primary rounded-lg px-3 py-1.5 text-xs font-semibold"
              >
                {svc.status === "DEPLOYING" ? "Deploying…" : "Deploy"}
              </button>
              {svc.status === "RUNNING" && (
                <button
                  onClick={() => runAction(svc.id, stopService)}
                  disabled={busy === svc.id}
                  className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs"
                >
                  Stop
                </button>
              )}
              {(svc.status === "RUNNING" || svc.status === "STOPPED") && (
                <button
                  onClick={() => runAction(svc.id, restartService)}
                  disabled={busy === svc.id}
                  className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs"
                >
                  Restart
                </button>
              )}
              <button
                onClick={() => setConfirmDel({ id: svc.id, name: svc.name })}
                disabled={busy === svc.id}
                className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
              >
                Delete
              </button>
            </div>

            {deployErr[svc.id] && (
              <p className="basis-full rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                ⚠️ {deployErr[svc.id]}
              </p>
            )}
          </li>
        ))}
        {project.services.length === 0 && (
          <li className="rounded-xl border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            Belum ada service. Klik <span className="text-foreground">+ Add Service</span>.
          </li>
        )}
      </ul>

      {activeDeployment && (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
            Deployment logs
          </p>
          <DeploymentLogs deploymentId={activeDeployment} token={token} />
        </div>
      )}

      {confirmDel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setConfirmDel(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card w-full max-w-md p-6"
          >
            <h2 className="text-lg font-semibold">Hapus service?</h2>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              Service <span className="font-medium text-foreground">{confirmDel.name}</span>{" "}
              akan dihentikan & dihapus permanen. Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDel(null)}
                className="btn-ghost rounded-lg px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  const id = confirmDel.id;
                  setConfirmDel(null);
                  runAction(id, deleteService);
                }}
                className="rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/25"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
