"use client";
// Kartu project di dashboard — fokus nama + ringkasan status. Klik → halaman project.
import Link from "next/link";
import { type Project } from "@/store/use-project-store";
import { IconFolder } from "./icons";

export function ProjectCard({ project }: { project: Project }) {
  const svcs = project.services;
  const running = svcs.filter((s) => s.status === "RUNNING").length;
  const failed = svcs.filter((s) => s.status === "FAILED").length;

  return (
    <Link
      href={`/dashboard/projects/${project.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:border-violet-500/40"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface2 text-muted-foreground ring-1 ring-inset ring-border">
        <IconFolder className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-base font-semibold tracking-tight group-hover:text-violet-200">
          {project.name}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {svcs.length} service{svcs.length !== 1 ? "s" : ""}
          </span>
          {running > 0 && (
            <span className="inline-flex items-center gap-1.5 text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_7px_2px] shadow-emerald-400/40" />
              {running} running
            </span>
          )}
          {failed > 0 && (
            <span className="inline-flex items-center gap-1.5 text-red-300">
              <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
              {failed} failed
            </span>
          )}
          {svcs.length === 0 && <span className="text-muted-foreground/70">kosong</span>}
        </div>
      </div>

      <span className="shrink-0 text-sm text-violet-400 opacity-0 transition-opacity group-hover:opacity-100">
        Open →
      </span>
    </Link>
  );
}
