"use client";
// Canvas arsitektur project: kartu service yang bisa di-drag; posisi disimpan ke DB.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useProjectStore, type Service } from "@/store/use-project-store";
import { updateService } from "@/lib/api";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { AddServiceDialog } from "@/components/add-service-dialog";
import { IconRocket, IconDatabase } from "@/components/icons";

const CARD_W = 220;
const CARD_H = 96;

export default function ProjectCanvasPage() {
  const { id } = useParams<{ id: string }>();
  const { data: session } = useSession();
  const token = session?.apiToken;
  const { projects, fetchProjects } = useProjectStore();
  const project = projects.find((p) => p.id === id);

  // Posisi lokal saat drag (biar responsif tanpa nunggu server).
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  // Cermin posisi terkini; onMouseUp membacanya agar tidak memakai state basi.
  const posRef = useRef(pos);
  posRef.current = pos;

  useEffect(() => {
    if (!token) return;
    fetchProjects(token);
    const t = setInterval(() => fetchProjects(token), 5000);
    return () => clearInterval(t);
  }, [token, fetchProjects]);

  // Sinkronkan posisi dari server (kecuali yang sedang di-drag).
  useEffect(() => {
    if (!project) return;
    setPos((cur) => {
      const next = { ...cur };
      project.services.forEach((s, i) => {
        if (drag.current?.id === s.id) return;
        if (next[s.id]) return;
        // Kalau belum pernah diatur, susun otomatis berjenjang.
        const x = s.posX || 40 + (i % 3) * (CARD_W + 40);
        const y = s.posY || 40 + Math.floor(i / 3) * (CARD_H + 40);
        next[s.id] = { x, y };
      });
      return next;
    });
  }, [project]);

  const onMouseDown = (e: React.MouseEvent, s: Service) => {
    const p = pos[s.id] ?? { x: 0, y: 0 };
    const rect = canvasRef.current!.getBoundingClientRect();
    drag.current = {
      id: s.id,
      dx: e.clientX - rect.left - p.x,
      dy: e.clientY - rect.top - p.y,
    };
    e.preventDefault();
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    const d = drag.current;
    if (!d || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width - CARD_W, e.clientX - rect.left - d.dx));
    const y = Math.max(0, Math.min(rect.height - CARD_H, e.clientY - rect.top - d.dy));
    const next = { x, y };
    posRef.current = { ...posRef.current, [d.id]: next };
    setPos((p) => ({ ...p, [d.id]: next }));
  }, []);

  const onMouseUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d || !token) return;
    const p = posRef.current[d.id]; // baca dari ref, bukan state
    if (p) updateService(token, d.id, { posX: p.x, posY: p.y }).catch(() => {});
  }, [token]);

  useEffect(() => {
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  if (!project)
    return <p className="p-10 text-sm text-muted-foreground">Memuat project…</p>;

  return (
    <div className="px-8 py-8">
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">
          Projects
        </Link>
        <span>/</span>
        <span className="text-foreground">{project.name}</span>
      </div>

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Architecture · geser kartu untuk menata
          </p>
        </div>
        {token && (
          <AddServiceDialog
            projectId={project.id}
            token={token}
            onCreated={() => fetchProjects(token)}
          />
        )}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative h-[32rem] overflow-hidden rounded-xl border border-border bg-[#0a0a0f]"
        style={{
          backgroundImage:
            "radial-gradient(circle, hsl(240 10% 22%) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      >
        {project.services.length === 0 && (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="font-medium">Canvas kosong</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Klik “+ Create” untuk menambah service.
              </p>
            </div>
          </div>
        )}

        {project.services.map((s) => {
          const p = pos[s.id] ?? { x: 40, y: 40 };
          const dragging = drag.current?.id === s.id;
          return (
            <div
              key={s.id}
              onMouseDown={(e) => onMouseDown(e, s)}
              style={{ left: p.x, top: p.y, width: CARD_W }}
              className={`absolute select-none rounded-xl border bg-card p-3 shadow-lg transition-shadow ${
                dragging
                  ? "cursor-grabbing border-violet-500/60 shadow-violet-500/20"
                  : "cursor-grab border-border hover:border-violet-500/40"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/10 text-violet-200 ring-1 ring-inset ring-white/5">
                  {s.type === "DATABASE" ? (
                    <IconDatabase className="h-3.5 w-3.5" />
                  ) : (
                    <IconRocket className="h-3.5 w-3.5" />
                  )}
                </span>
                <span className="truncate text-sm font-medium">{s.name}</span>
              </div>
              {s.repoFullName && (
                <p className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">
                  {s.repoFullName}
                </p>
              )}
              <div className="mt-2 flex items-center justify-between">
                <ServiceStatusBadge status={s.status} />
                <Link
                  href={`/dashboard/services/${s.id}`}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="text-[11px] text-violet-400 hover:underline"
                >
                  Buka →
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Posisi tersimpan otomatis saat kartu dilepas.
      </p>
    </div>
  );
}
