"use client";
// Admin Console — kelola node. Node terhubung lewat agent yang dipasang di VPS.
import { useEffect, useState, useCallback } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  getStats,
  getNodes,
  createNode,
  updateNode,
  deleteNode,
  type NodeItem,
  type AdminStats,
  type CreateNodeResult,
} from "@/lib/admin-api";
import { DnsSettings } from "@/components/dns-settings";
import { AdminUsers } from "@/components/admin-users";
import { IconShield, IconServer, IconBox, IconWarn, IconCheck } from "@/components/icons";

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token = session?.apiToken;

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [created, setCreated] = useState<CreateNodeResult | null>(null);

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.role !== "ADMIN") router.replace("/admin/login");
  }, [session, status, router]);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, n] = await Promise.all([getStats(token), getNodes(token)]);
    setStats(s);
    setNodes(n);
  }, [token]);

  useEffect(() => {
    if (!token || session?.role !== "ADMIN") return;
    refresh();
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [token, session?.role, refresh]);

  if (status === "loading" || !session || session.role !== "ADMIN")
    return <p className="p-10 text-sm text-muted-foreground">Memeriksa akses…</p>;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-6">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-amber-500 to-orange-500 text-white">
            <IconShield className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-semibold">Admin Console</span>
          <span className="ml-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
            operator
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="ml-auto text-sm text-muted-foreground hover:text-foreground"
          >
            Keluar
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Infrastruktur</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Node terhubung otomatis lewat agent yang dipasang di VPS.
            </p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            + Hubungkan Node
          </button>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Node online" value={`${stats?.online ?? 0}/${stats?.nodes ?? 0}`} />
          <Stat label="Deploy aktif" value={stats?.running ?? 0} />
          <Stat label="Total service" value={stats?.services ?? 0} />
          <Stat label="User" value={stats?.users ?? 0} />
        </div>

        {stats && stats.online === 0 && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <IconWarn className="h-4 w-4 shrink-0" />
            Tidak ada node online — deployment user akan ditolak sampai ada agent
            yang terhubung.
          </div>
        )}

        <div className="card divide-y divide-border">
          {nodes.length === 0 && (
            <div className="p-10 text-center">
              <p className="font-medium">Belum ada node</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Klik “Hubungkan Node” untuk dapat perintah instalasi agent.
              </p>
            </div>
          )}
          {nodes.map((n) => (
            <NodeRow key={n.id} n={n} token={token} onChange={refresh} />
          ))}
        </div>

        {token && <AdminUsers token={token} selfId={session.userId} />}

        <div className="mt-10">{token && <DnsSettings token={token} />}</div>
      </main>

      {addOpen && token && (
        <AddNodeModal
          token={token}
          onClose={() => setAddOpen(false)}
          onCreated={(res) => {
            setAddOpen(false);
            setCreated(res);
            refresh();
          }}
        />
      )}

      {created && <TokenModal res={created} onClose={() => setCreated(null)} />}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

function NodeRow({
  n,
  token,
  onChange,
}: {
  n: NodeItem;
  token?: string;
  onChange: () => void;
}) {
  const pct = Math.min(100, Math.round((n.running / n.maxServices) * 100));
  const seen = n.lastSeenAt ? new Date(n.lastSeenAt) : null;
  const seenAgo = seen ? Math.round((Date.now() - seen.getTime()) / 1000) : null;

  return (
    <div className="flex items-center gap-4 p-4">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface2 text-muted-foreground">
        <IconServer className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{n.name}</span>
          {n.online ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px] shadow-emerald-400/50" />
              Online
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
              {n.lastSeenAt ? "Terputus" : "Menunggu agent…"}
            </span>
          )}
          {n.status === "DRAINING" && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase text-amber-300">
              draining
            </span>
          )}
          {n.dockerAvailable && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              <IconBox className="h-3 w-3" /> docker
            </span>
          )}
        </div>

        {n.hostname ? (
          <p className="font-mono text-xs text-muted-foreground">
            {n.hostname} · {n.os} · {n.arch} · {n.cpuCores} vCPU · {n.memoryMb} MB
            {n.agentVersion ? ` · agent v${n.agentVersion}` : ""}
          </p>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">
            belum ada laporan agent
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-surface2">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">
              {n.running}/{n.maxServices} service
            </span>
          </div>
          {n.online && n.cpuPct != null && (
            <span className="font-mono text-xs text-muted-foreground">
              CPU {n.cpuPct}% · RAM {n.memPct}%
              {seenAgo != null ? ` · ${seenAgo}s lalu` : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() =>
            token &&
            updateNode(token, n.id, {
              status: n.status === "ACTIVE" ? "DRAINING" : "ACTIVE",
            }).then(onChange)
          }
          className="btn-ghost rounded-lg px-2.5 py-1.5 text-xs"
        >
          {n.status === "ACTIVE" ? "Drain" : "Aktifkan"}
        </button>
        <button
          onClick={() => token && deleteNode(token, n.id).then(onChange)}
          className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20"
        >
          Cabut
        </button>
      </div>
    </div>
  );
}

function AddNodeModal({
  token,
  onClose,
  onCreated,
}: {
  token: string;
  onClose: () => void;
  onCreated: (r: CreateNodeResult) => void;
}) {
  const [form, setForm] = useState({ name: "", region: "default", maxServices: 10 });
  const [saving, setSaving] = useState(false);
  const f = "field w-full px-3 py-2 text-sm";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      onCreated(await createNode(token, form));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="card w-full max-w-md space-y-3 p-6">
        <h2 className="text-lg font-semibold">Hubungkan node baru</h2>
        <p className="text-sm text-muted-foreground">
          Kami buatkan join token. Jalankan perintah instalasi di VPS — agent akan
          menghubungi balik dan melaporkan spesifikasinya sendiri.
        </p>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Nama node</label>
          <input
            autoFocus
            className={f}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="mis. vps-jakarta-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Region</label>
            <input
              className={f}
              value={form.region}
              onChange={(e) => setForm({ ...form, region: e.target.value })}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Maks service</label>
            <input
              type="number"
              className={f}
              value={form.maxServices}
              onChange={(e) => setForm({ ...form, maxServices: +e.target.value })}
            />
          </div>
        </div>
        <p className="rounded-lg bg-surface2 px-3 py-2 text-xs text-muted-foreground">
          vCPU & RAM tidak perlu diisi — agent yang melaporkannya.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-ghost rounded-lg px-4 py-2 text-sm">
            Batal
          </button>
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
          >
            {saving ? "Membuat…" : "Buat token"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TokenModal({ res, onClose }: { res: CreateNodeResult; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-2xl p-6">
        <h2 className="text-lg font-semibold">Pasang agent di VPS</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Jalankan perintah ini di server <span className="font-medium text-foreground">{res.node.name}</span>.
          Token hanya ditampilkan sekali.
        </p>

        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-[#08080c]">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="font-mono text-[11px] text-zinc-500">install</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(res.installCommand);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="btn-ghost inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
            >
              {copied ? (
                <>
                  <IconCheck className="h-3 w-3" /> Tersalin
                </>
              ) : (
                "Salin"
              )}
            </button>
          </div>
          <pre className="overflow-x-auto p-4 font-mono text-xs leading-5 text-zinc-300">
            {res.installCommand}
          </pre>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Agent akan dial-out ke control plane (tidak perlu membuka port di VPS) dan
          muncul sebagai <span className="text-emerald-300">Online</span> di daftar
          begitu terhubung.
        </p>

        <div className="mt-5 flex justify-end">
          <button onClick={onClose} className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold">
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
