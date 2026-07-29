"use client";
// Halaman Projects — header + view toggle + grid kartu (ala Railway).
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useProjectStore } from "@/store/use-project-store";
import { ProjectCard } from "@/components/project-card";
import { NewProjectButton } from "@/components/new-project-button";
import { IconGit, IconDatabase, IconLayers, IconPlus, IconGrid, IconList } from "@/components/icons";

export default function ProjectsPage() {
  const { data: session } = useSession();
  const token = session?.apiToken;
  const { projects, loading, fetchProjects } = useProjectStore();
  const [view, setView] = useState<"grid" | "list">("grid");

  useEffect(() => {
    if (!token) return;
    fetchProjects(token);
    const t = setInterval(() => fetchProjects(token), 4000);
    return () => clearInterval(t);
  }, [token, fetchProjects]);

  const count = projects.length;
  const empty = !loading && count === 0;

  return (
    <div className="mx-auto max-w-5xl px-8 py-9">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <NewProjectButton triggerLabel="+ New" />
      </div>

      {/* Sub-header: jumlah + view toggle */}
      <div className="mt-5 flex items-center justify-between border-b border-border pb-4">
        <span className="text-sm text-muted-foreground">
          {count} project{count !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface2/60 p-0.5">
          <ToggleBtn active={view === "grid"} onClick={() => setView("grid")} label="Grid">
            <IconGrid className="h-4 w-4" />
          </ToggleBtn>
          <ToggleBtn active={view === "list"} onClick={() => setView("list")} label="List">
            <IconList className="h-4 w-4" />
          </ToggleBtn>
        </div>
      </div>

      {/* Konten */}
      <div className="mt-6">
        {loading && count === 0 ? (
          <p className="text-sm text-muted-foreground">Memuat project…</p>
        ) : empty ? (
          <EmptyState />
        ) : (
          <div className={view === "grid" ? "grid gap-5 lg:grid-cols-2" : "grid gap-5"}>
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} variant={view === "grid" ? "card" : "row"} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`grid h-7 w-7 place-items-center rounded-md transition-colors ${
        active ? "bg-surface2 text-foreground ring-1 ring-inset ring-border" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-2xl border border-dashed border-border py-20 text-center">
      {/* Klaster ikon */}
      <div className="mb-5 grid grid-cols-2 gap-2">
        {[<IconGit />, <IconDatabase />, <IconLayers />, <IconPlus />].map((ic, i) => (
          <span
            key={i}
            className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-surface2 text-violet-300"
          >
            <span className="h-5 w-5 [&>svg]:h-5 [&>svg]:w-5">{ic}</span>
          </span>
        ))}
      </div>
      <h2 className="text-lg font-semibold">Buat project pertamamu</h2>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
        Deploy dari GitHub, pilih template, tarik Docker image, atau siapkan database — semua
        dikelompokkan dalam satu project.
      </p>
      <div className="mt-6">
        <NewProjectButton triggerLabel="+ New Project" />
      </div>
    </div>
  );
}
