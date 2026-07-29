"use client";
// Canvas arsitektur project: kartu service yang bisa di-drag; posisi disimpan ke DB.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useProjectStore, type Service } from "@/store/use-project-store";
import { updateService, deleteProject } from "@/lib/api";
import { ServiceStatusBadge } from "@/components/service-status-badge";
import { AddServiceDialog } from "@/components/add-service-dialog";
import { IconRocket, IconDatabase } from "@/components/icons";
import { ServiceDetailView } from "@/components/service-detail";

const CARD_W = 220;
const CARD_H = 96;

export default function ProjectCanvasPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const token = session?.apiToken;
  const { projects, fetchProjects } = useProjectStore();
  const project = projects.find((p) => p.id === id);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Service yang detailnya sedang dibuka di drawer (null = tertutup).
  const [openSvc, setOpenSvc] = useState<string | null>(null);

  // Posisi lokal saat drag (biar responsif tanpa nunggu server).
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  // startX/startY + moved dipakai untuk membedakan KLIK (buka detail) vs GESER.
  const drag = useRef<{
    id: string;
    dx: number;
    dy: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
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
    if (e.button !== 0) return; // hanya klik kiri
    const p = pos[s.id] ?? { x: 0, y: 0 };
    const rect = canvasRef.current!.getBoundingClientRect();
    drag.current = {
      id: s.id,
      dx: e.clientX - rect.left - p.x,
      dy: e.clientY - rect.top - p.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    e.preventDefault();
  };

  const onMouseMove = useCallback((e: MouseEvent) => {
    const d = drag.current;
    if (!d || !canvasRef.current) return;
    // Anggap "geser" hanya bila pointer bergerak >5px — di bawah itu = klik.
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 5)
      d.moved = true;
    if (!d.moved) return;
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
    if (!d) return;
    // Tidak digeser → perlakukan sebagai klik: buka detail service di drawer.
    if (!d.moved) {
      setOpenSvc(d.id);
      return;
    }
    if (!token) return;
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

  // Tutup drawer detail service dengan tombol Escape.
  useEffect(() => {
    if (!openSvc) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenSvc(null);
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [openSvc]);

  if (!project)
    return <p className="p-10 text-sm text-muted-foreground">Memuat project…</p>;

  async function handleDelete() {
    if (!token || !project) return;
    setDeleting(true);
    try {
      await deleteProject(token, project.id);
      router.push("/dashboard");
    } catch (e) {
      alert((e as Error).message);
      setDeleting(false);
    }
  }

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
              title="Klik untuk buka · seret untuk menata"
              style={{ left: p.x, top: p.y, width: CARD_W }}
              className={`group absolute select-none rounded-xl border bg-card p-3 shadow-lg transition-all ${
                dragging
                  ? "cursor-grabbing border-violet-500/60 shadow-violet-500/20"
                  : "cursor-pointer border-border hover:-translate-y-0.5 hover:border-violet-500/50 hover:shadow-violet-500/10"
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
                <span className="text-[11px] text-violet-400 opacity-0 transition-opacity group-hover:opacity-100">
                  Buka →
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Posisi tersimpan otomatis saat kartu dilepas.
      </p>

      {/* Danger zone — hapus project (destruktif). */}
      <div className="mt-10 rounded-xl border border-red-500/20 bg-red-500/[0.03] p-5">
        <p className="font-medium text-red-300">Danger zone</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Hapus project ini beserta{" "}
            <span className="text-foreground">{project.services.length} service</span>-nya
            secara permanen.
          </p>
          <button
            onClick={() => setDelOpen(true)}
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-500/20"
          >
            Hapus project
          </button>
        </div>
      </div>

      {delOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !deleting && setDelOpen(false)}
        >
          <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-md p-6">
            <h2 className="text-lg font-semibold">Hapus project “{project.name}”?</h2>
            <p className="mb-5 mt-1 text-sm text-muted-foreground">
              Project ini &amp;{" "}
              <span className="font-medium text-foreground">
                {project.services.length} service
              </span>{" "}
              (container &amp; deployment-nya) akan dihentikan &amp; dihapus permanen.
              Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDelOpen(false)}
                disabled={deleting}
                className="btn-ghost rounded-lg px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
              >
                {deleting ? "Menghapus…" : "Ya, hapus permanen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer detail service (ala Railway): canvas tetap terlihat di kiri. */}
      {openSvc && (
        <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[760px] flex-col border-l border-border bg-[#0b0b10] shadow-2xl shadow-black/50">
          <ServiceDetailView
            key={openSvc}
            id={openSvc}
            variant="drawer"
            onClose={() => setOpenSvc(null)}
            onDeleted={() => {
              setOpenSvc(null);
              if (token) fetchProjects(token);
            }}
          />
        </aside>
      )}
    </div>
  );
}
