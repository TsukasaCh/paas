"use client";
// Panel manajemen pengguna untuk Admin Console: ubah paket (Free/Pro/Enterprise)
// dan status akun (aktif/suspend/banned). Semua aksi lewat PATCH /admin/users/:id.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  listUsers,
  updateUser,
  PLAN_INFO,
  type UserItem,
  type UserPlan,
  type UserStatus,
} from "@/lib/admin-api";
import { IconUsers } from "@/components/icons";

const PLAN_ORDER: UserPlan[] = ["FREE", "PRO", "ENTERPRISE"];

const PLAN_BADGE: Record<UserPlan, string> = {
  FREE: "border-border text-muted-foreground",
  PRO: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  ENTERPRISE: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

const STATUS_BADGE: Record<UserStatus, string> = {
  ACTIVE: "text-emerald-300",
  SUSPENDED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  BANNED: "border-red-500/30 bg-red-500/10 text-red-300",
};

const STATUS_LABEL: Record<UserStatus, string> = {
  ACTIVE: "Aktif",
  SUSPENDED: "Disuspend",
  BANNED: "Diblokir",
};

export function AdminUsers({ token, selfId }: { token: string; selfId?: string }) {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setUsers(await listUsers(token));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return users;
    return users.filter((u) =>
      [u.email, u.username, u.name].some((v) => v?.toLowerCase().includes(t)),
    );
  }, [users, q]);

  async function mutate(id: string, data: { plan?: UserPlan; status?: UserStatus }) {
    setBusy(id);
    setErr(null);
    // Optimistic: update lokal dulu agar UI responsif.
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
    try {
      let licenseKey: string | undefined;
      if (data.plan === "ENTERPRISE") {
        const key = window.prompt(
          "Kode lisensi Enterprise (opsional, boleh dikosongkan):",
          "",
        );
        if (key) licenseKey = key.trim();
      }
      await updateUser(token, id, { ...data, licenseKey });
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal memperbarui pengguna");
      await refresh(); // batalkan optimistic bila gagal
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface2 text-muted-foreground">
            <IconUsers className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Pengguna</h2>
            <p className="text-xs text-muted-foreground">
              {users.length} akun · atur paket & moderasi platform
            </p>
          </div>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari email / username…"
          className="field w-56 px-3 py-2 text-sm"
        />
      </div>

      {err && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {err}
        </div>
      )}

      <div className="card divide-y divide-border">
        {loading && (
          <p className="p-8 text-center text-sm text-muted-foreground">Memuat pengguna…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            {q ? "Tidak ada yang cocok." : "Belum ada pengguna terdaftar."}
          </p>
        )}
        {filtered.map((u) => (
          <UserRow
            key={u.id}
            u={u}
            self={u.id === selfId}
            busy={busy === u.id}
            onPlan={(plan) => mutate(u.id, { plan })}
            onStatus={(status) => mutate(u.id, { status })}
          />
        ))}
      </div>
    </section>
  );
}

function UserRow({
  u,
  self,
  busy,
  onPlan,
  onStatus,
}: {
  u: UserItem;
  self: boolean;
  busy: boolean;
  onPlan: (p: UserPlan) => void;
  onStatus: (s: UserStatus) => void;
}) {
  const label = u.name || u.username || u.email || "Tanpa nama";
  const initial = label.charAt(0).toUpperCase();
  const isAdmin = u.role === "ADMIN";
  // Admin tidak bisa dimoderasi (juga diblok di server); diri sendiri juga tidak.
  const locked = isAdmin || self;

  return (
    <div className={`flex flex-wrap items-center gap-4 p-4 ${busy ? "opacity-60" : ""}`}>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-violet-500/80 to-fuchsia-500/80 text-sm font-semibold text-white">
        {initial}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{label}</span>
          {isAdmin && (
            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
              admin
            </span>
          )}
          {self && (
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
              Anda
            </span>
          )}
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_BADGE[u.status]}`}
          >
            {STATUS_LABEL[u.status]}
          </span>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">
          {u.email ?? u.username ?? u.id} · {u.projects} proyek · {u.services} service
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {PLAN_INFO[u.plan].quota}
        </p>
      </div>

      {/* Paket */}
      <label className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground">Paket</span>
        <select
          value={u.plan}
          disabled={busy}
          onChange={(e) => {
            const p = e.target.value as UserPlan;
            if (p !== u.plan) onPlan(p);
          }}
          className={`field px-2.5 py-1.5 text-xs ${PLAN_BADGE[u.plan]}`}
        >
          {PLAN_ORDER.map((p) => (
            <option key={p} value={p}>
              {PLAN_INFO[p].label}
            </option>
          ))}
        </select>
      </label>

      {/* Moderasi */}
      <div className="flex items-center gap-2">
        {locked ? (
          <span className="text-[11px] text-muted-foreground">—</span>
        ) : (
          <>
            {u.status === "ACTIVE" && (
              <button
                disabled={busy}
                onClick={() => onStatus("SUSPENDED")}
                className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-300 hover:bg-amber-500/20 disabled:opacity-50"
              >
                Suspend
              </button>
            )}
            {u.status !== "ACTIVE" && (
              <button
                disabled={busy}
                onClick={() => onStatus("ACTIVE")}
                className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
              >
                Aktifkan
              </button>
            )}
            {u.status !== "BANNED" && (
              <button
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Blokir ${label} dari platform?`)) onStatus("BANNED");
                }}
                className="rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-50"
              >
                Ban
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
