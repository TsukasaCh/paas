"use client";
// Kartu project di dashboard (ala Railway): nama + preview mini-canvas berisi
// node service + footer status. Varian "row" untuk mode List (ringkas).
import Link from "next/link";
import { type Project, type Service } from "@/store/use-project-store";
import { IconFolder, IconRocket, IconDatabase } from "./icons";

const DOTS = "radial-gradient(circle, hsl(240 10% 22%) 1px, transparent 1px)";

function counts(svcs: Service[]) {
  const running = svcs.filter((s) => s.status === "RUNNING").length;
  const failed = svcs.filter((s) => s.status === "FAILED").length;
  return { running, failed, total: svcs.length };
}

function statusDot(running: number, failed: number, total: number) {
  if (running > 0) return "bg-emerald-400 shadow-[0_0_7px_2px] shadow-emerald-400/40";
  if (failed > 0) return "bg-red-400";
  if (total === 0) return "bg-zinc-600";
  return "bg-zinc-500";
}

export function ProjectCard({
  project,
  variant = "card",
}: {
  project: Project;
  variant?: "card" | "row";
}) {
  const svcs = project.services;
  const { running, failed, total } = counts(svcs);
  const href = `/dashboard/projects/${project.id}`;

  const footer =
    total === 0 ? (
      <span className="text-muted-foreground/70">Belum ada service</span>
    ) : (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={running > 0 ? "text-emerald-300" : "text-muted-foreground"}>
          {running}/{total} service jalan
        </span>
        {failed > 0 && <span className="text-red-300">· {failed} gagal</span>}
      </span>
    );

  // ── Varian ringkas untuk mode List ──
  if (variant === "row") {
    return (
      <Link
        href={href}
        className="group flex items-center gap-4 rounded-2xl border border-border bg-card px-5 py-4 transition-colors hover:border-violet-500/40"
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface2 text-muted-foreground ring-1 ring-inset ring-border">
          <IconFolder className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold tracking-tight group-hover:text-violet-200">
            {project.name}
          </h3>
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot(running, failed, total)}`} />
            {footer}
          </div>
        </div>

        {/* Node service inline — mengisi baris & memperlihatkan arsitektur sekilas */}
        {total > 0 && (
          <div className="hidden shrink-0 items-center gap-2 sm:flex">
            {svcs.slice(0, 5).map((s) => (
              <NodeTile key={s.id} s={s} size="sm" />
            ))}
            {total > 5 && (
              <span className="text-xs font-medium text-muted-foreground">+{total - 5}</span>
            )}
          </div>
        )}

        <span className="shrink-0 text-sm text-violet-400 opacity-0 transition-opacity group-hover:opacity-100">
          Buka →
        </span>
      </Link>
    );
  }

  // ── Varian kartu (grid) dengan preview mini-canvas ──
  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-violet-500/40"
    >
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
        <h3 className="truncate text-base font-semibold tracking-tight group-hover:text-violet-200">
          {project.name}
        </h3>
        <span className="shrink-0 text-xs text-violet-400 opacity-0 transition-opacity group-hover:opacity-100">
          Buka →
        </span>
      </div>

      {/* Preview arsitektur (grid titik + node service) */}
      <div
        className="relative mx-4 h-40 overflow-hidden rounded-xl border border-border/60 bg-[#0a0a0f]"
        style={{ backgroundImage: DOTS, backgroundSize: "16px 16px" }}
      >
        {total === 0 ? (
          <div className="grid h-full place-items-center">
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-dashed border-border text-muted-foreground/50">
              <IconFolder className="h-5 w-5" />
            </span>
          </div>
        ) : (
          <div className="flex h-full flex-wrap content-center items-center justify-center gap-3 p-4">
            {svcs.slice(0, 6).map((s) => (
              <NodeTile key={s.id} s={s} />
            ))}
            {total > 6 && (
              <span className="text-xs font-medium text-muted-foreground">+{total - 6}</span>
            )}
          </div>
        )}
      </div>

      {/* Footer status */}
      <div className="flex items-center gap-2 px-5 py-3 text-xs text-muted-foreground">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(running, failed, total)}`} />
        {footer}
      </div>
    </Link>
  );
}

function NodeTile({ s, size = "md" }: { s: Service; size?: "md" | "sm" }) {
  const dot =
    s.status === "RUNNING"
      ? "bg-emerald-400"
      : s.status === "FAILED"
        ? "bg-red-400"
        : s.status === "DEPLOYING"
          ? "bg-amber-400 animate-pulse"
          : "bg-zinc-500";
  const sm = size === "sm";
  return (
    <span
      title={`${s.name} · ${s.status.toLowerCase()}`}
      className={`relative grid place-items-center border border-border bg-card text-violet-200 shadow-md shadow-black/30 ring-1 ring-inset ring-white/5 ${
        sm ? "h-8 w-8 rounded-lg" : "h-12 w-12 rounded-xl"
      }`}
    >
      {s.type === "DATABASE" ? (
        <IconDatabase className={sm ? "h-4 w-4" : "h-5 w-5"} />
      ) : (
        <IconRocket className={sm ? "h-4 w-4" : "h-5 w-5"} />
      )}
      <span
        className={`absolute rounded-full ring-2 ring-card ${dot} ${
          sm ? "-right-0.5 -top-0.5 h-2 w-2" : "-right-1 -top-1 h-2.5 w-2.5"
        }`}
      />
    </span>
  );
}
