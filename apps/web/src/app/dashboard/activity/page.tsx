"use client";
// Activity: status terbaru seluruh service.
import { useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useProjectStore } from "@/store/use-project-store";
import { ServiceStatusBadge } from "@/components/service-status-badge";

export default function ActivityPage() {
  const { data: session } = useSession();
  const token = session?.apiToken;
  const { projects, fetchProjects } = useProjectStore();

  useEffect(() => {
    if (!token) return;
    fetchProjects(token);
    const t = setInterval(() => fetchProjects(token), 4000);
    return () => clearInterval(t);
  }, [token, fetchProjects]);

  const services = projects.flatMap((p) =>
    p.services.map((s) => ({ ...s, projectName: p.name })),
  );

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Status terbaru seluruh service
        </p>
      </header>

      {services.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="font-medium">Belum ada aktivitas</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Buat service untuk melihat aktivitas.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-border">
          {services.map((s) => (
            <Link
              key={s.id}
              href={`/dashboard/services/${s.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface2/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {s.name}
                  <span className="text-muted-foreground"> · {s.projectName}</span>
                </p>
                {s.repoFullName && (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {s.repoFullName}
                  </p>
                )}
              </div>
              <ServiceStatusBadge status={s.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
