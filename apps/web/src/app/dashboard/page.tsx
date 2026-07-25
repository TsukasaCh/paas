"use client";
// Daftar Project + service.
import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useProjectStore } from "@/store/use-project-store";
import { ProjectCard } from "@/components/project-card";

export default function ProjectsPage() {
  const { data: session } = useSession();
  const token = session?.apiToken;
  const { projects, loading, fetchProjects } = useProjectStore();

  useEffect(() => {
    if (!token) return;
    fetchProjects(token);
    const t = setInterval(() => fetchProjects(token), 4000);
    return () => clearInterval(t);
  }, [token, fetchProjects]);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {projects.length} project{projects.length !== 1 ? "s" : ""}
        </p>
      </header>

      {loading && projects.length === 0 ? (
        <p className="text-sm text-muted-foreground">Memuat project…</p>
      ) : projects.length === 0 ? (
        <div className="card grid place-items-center p-16 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-surface2 text-xl">
            📦
          </div>
          <p className="font-medium">Belum ada project</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Klik “New Project” di sidebar untuk memulai.
          </p>
        </div>
      ) : (
        <div className="grid gap-5">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </div>
  );
}
