"use client";
// Settings akun — bercabang seperti Railway: Akun, Keamanan, Paket, Danger Zone.
import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  getMe,
  getUsage,
  updateProfile,
  changePassword,
  deleteAccount,
  type Me,
  type Usage,
} from "@/lib/api";

type Section = "akun" | "keamanan" | "paket" | "bahaya";

const NAV: { id: Section; label: string; icon: React.ReactNode; danger?: boolean }[] = [
  { id: "akun", label: "Akun", icon: <IconUser /> },
  { id: "keamanan", label: "Keamanan", icon: <IconLock /> },
  { id: "paket", label: "Paket", icon: <IconLayers /> },
  { id: "bahaya", label: "Danger Zone", icon: <IconWarn />, danger: true },
];

export default function SettingsPage() {
  const { data: session } = useSession();
  const token = session?.apiToken;
  const [section, setSection] = useState<Section>("akun");
  const [me, setMe] = useState<Me | null>(null);

  const loadMe = useCallback(async () => {
    if (token) setMe(await getMe(token));
  }, [token]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kelola akun, keamanan, dan paket.</p>
      </header>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Sub-nav kiri */}
        <nav className="flex shrink-0 gap-1 md:w-52 md:flex-col">
          {NAV.map((n) => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                section === n.id
                  ? n.danger
                    ? "bg-red-500/10 font-medium text-red-300 ring-1 ring-inset ring-red-500/20"
                    : "bg-surface2 font-medium text-foreground ring-1 ring-inset ring-border"
                  : n.danger
                    ? "text-red-300/70 hover:bg-red-500/10 hover:text-red-300"
                    : "text-muted-foreground hover:bg-surface2/60 hover:text-foreground"
              }`}
            >
              <span className="opacity-80">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>

        {/* Panel */}
        <div className="min-w-0 flex-1">
          {section === "akun" && <AccountPanel token={token} me={me} onSaved={loadMe} />}
          {section === "keamanan" && <SecurityPanel token={token} me={me} />}
          {section === "paket" && <PlanPanel token={token} />}
          {section === "bahaya" && <DangerPanel token={token} />}
        </div>
      </div>
    </div>
  );
}

// ── Akun ───────────────────────────────────────────────────────
function AccountPanel({
  token,
  me,
  onSaved,
}: {
  token?: string;
  me: Me | null;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const f = "field w-full px-3 py-2 text-sm";

  useEffect(() => {
    setName(me?.name ?? "");
    setUsername(me?.username ?? "");
  }, [me]);

  const dirty = me && (name !== (me.name ?? "") || username !== (me.username ?? ""));

  async function save() {
    if (!token || !dirty) return;
    setSaving(true);
    setMsg(null);
    try {
      await updateProfile(token, { name, username });
      setMsg({ ok: true, text: "Perubahan tersimpan." });
      onSaved();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal menyimpan." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PanelCard title="Akun" desc="Informasi profil yang tampil di dashboard.">
      <Field label="Nama">
        <input className={f} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Username" hint="Dipakai untuk login. 3–32 karakter (huruf/angka/._-).">
        <input className={f} value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label="Email" hint={me?.githubLogin ? `Terhubung GitHub: @${me.githubLogin}` : "Tidak bisa diubah."}>
        <input className={`${f} opacity-60`} value={me?.email ?? ""} disabled />
      </Field>

      {msg && <Notice ok={msg.ok} text={msg.text} />}

      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={save}
          disabled={saving || !dirty}
          className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "Simpan perubahan"}
        </button>
        {me?.createdAt && (
          <span className="text-xs text-muted-foreground">
            Bergabung {new Date(me.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        )}
      </div>
    </PanelCard>
  );
}

// ── Keamanan ───────────────────────────────────────────────────
function SecurityPanel({ token, me }: { token?: string; me: Me | null }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const f = "field w-full px-3 py-2 text-sm";

  if (me && !me.hasPassword) {
    return (
      <PanelCard title="Keamanan" desc="Kelola password akun.">
        <Notice ok text={`Akun ini masuk lewat GitHub${me.githubLogin ? ` (@${me.githubLogin})` : ""}. Password diatur di GitHub, bukan di sini.`} />
      </PanelCard>
    );
  }

  async function submit() {
    setMsg(null);
    if (next.length < 8) return setMsg({ ok: false, text: "Password baru minimal 8 karakter." });
    if (next !== confirm) return setMsg({ ok: false, text: "Konfirmasi password tidak cocok." });
    if (!token) return;
    setSaving(true);
    try {
      await changePassword(token, { currentPassword: cur, newPassword: next });
      setMsg({ ok: true, text: "Password berhasil diganti." });
      setCur("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Gagal ganti password." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <PanelCard title="Keamanan" desc="Ganti password akunmu.">
      <Field label="Password saat ini">
        <input type="password" className={f} value={cur} onChange={(e) => setCur(e.target.value)} placeholder="••••••••" />
      </Field>
      <Field label="Password baru" hint="Minimal 8 karakter.">
        <input type="password" className={f} value={next} onChange={(e) => setNext(e.target.value)} placeholder="••••••••" />
      </Field>
      <Field label="Konfirmasi password baru">
        <input type="password" className={f} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" />
      </Field>

      {msg && <Notice ok={msg.ok} text={msg.text} />}

      <div className="pt-1">
        <button
          onClick={submit}
          disabled={saving || !cur || !next || !confirm}
          className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "Ganti password"}
        </button>
      </div>
    </PanelCard>
  );
}

// ── Paket & Pemakaian ──────────────────────────────────────────
const PLANS: { id: string; label: string; quota: string[] }[] = [
  { id: "FREE", label: "Free", quota: ["256 MB RAM / replika", "1 service berjalan", "Shared CPU · 1 replika"] },
  { id: "PRO", label: "Pro", quota: ["4 GB RAM / replika", "3 service berjalan", "2 core CPU · 2 replika"] },
  { id: "ENTERPRISE", label: "Enterprise", quota: ["RAM & CPU unlimited", "Service tak terbatas", "Via lisensi"] },
];

function fmtMem(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(mb >= 10240 ? 0 : 1)} GB` : `${mb} MB`;
}

function PlanPanel({ token }: { token?: string }) {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    if (token) getUsage(token).then(setU).catch(() => {});
  }, [token]);

  const current = u?.plan ?? "FREE";
  const perReplicaMb = u?.limits.memoryMb ?? 0;
  const maxServices = u?.limits.maxServices ?? 0;
  const capMb = perReplicaMb > 0 && maxServices > 0 ? perReplicaMb * maxServices : 0;
  const usedMb = u?.usage.memMb ?? 0;
  const pct = capMb > 0 ? Math.min(100, Math.round((usedMb / capMb) * 100)) : 0;

  return (
    <div className="space-y-4">
      <PanelCard title="Paket saat ini" desc="Pemakaian resource live milikmu.">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
              current === "PRO"
                ? "border-violet-500/40 bg-violet-500/10 text-violet-300"
                : current === "ENTERPRISE"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-border text-muted-foreground"
            }`}
          >
            {u?.limits.label ?? current}
          </span>
          <span className="text-sm text-muted-foreground">
            {PLANS.find((p) => p.id === current)?.quota.join(" · ")}
          </span>
        </div>

        {/* Meter RAM */}
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">RAM aktif</span>
            <span className="font-mono">
              {fmtMem(usedMb)}
              {capMb > 0 && <span className="text-muted-foreground"> / {fmtMem(capMb)}</span>}
            </span>
          </div>
          {capMb > 0 && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface2">
              <div
                className={`h-full rounded-full ${pct >= 90 ? "bg-gradient-to-r from-amber-500 to-red-500" : "bg-gradient-to-r from-violet-500 to-fuchsia-500"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3">
          <MiniStat label="Proyek" value={u?.usage.projects ?? 0} />
          <MiniStat
            label="Service jalan"
            value={`${u?.usage.runningServices ?? 0}/${maxServices > 0 ? maxServices : "∞"}`}
          />
          <MiniStat label="CPU" value={`${u?.usage.cpuPct ?? 0}%`} />
        </div>
      </PanelCard>

      <PanelCard title="Bandingkan paket" desc="Upgrade menaikkan batas RAM/CPU & jumlah replika.">
        <div className="grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => {
            const active = p.id === current;
            return (
              <div
                key={p.id}
                className={`rounded-xl border p-4 ${active ? "border-violet-500/40 bg-violet-500/5 ring-1 ring-violet-500/20" : "border-border"}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{p.label}</span>
                  {active && <span className="text-[10px] uppercase tracking-wide text-violet-300">Paket kamu</span>}
                </div>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {p.quota.map((q) => (
                    <li key={q} className="flex items-center gap-1.5">
                      <IconCheckSm /> {q}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Butuh upgrade ke Pro atau Enterprise? Enterprise diaktifkan lewat lisensi.
          Hubungi admin platform untuk menaikkan paketmu.
        </p>
      </PanelCard>
    </div>
  );
}

// ── Danger Zone ────────────────────────────────────────────────
function DangerPanel({ token }: { token?: string }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function remove() {
    if (!token) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAccount(token);
      await signOut({ callbackUrl: "/" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal hapus akun.");
      setBusy(false);
    }
  }

  return (
    <div className="card border-red-500/25 p-6">
      <h2 className="font-semibold text-red-300">Hapus akun</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Menghapus akun akan <span className="text-foreground">menghentikan & membuang seluruh project, service, dan deployment</span> milikmu secara permanen. Tindakan ini tidak bisa dibatalkan.
      </p>
      <div className="mt-4 max-w-sm">
        <label className="mb-1 block text-xs text-muted-foreground">
          Ketik <span className="font-mono text-foreground">HAPUS</span> untuk konfirmasi
        </label>
        <input
          className="field w-full px-3 py-2 text-sm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="HAPUS"
        />
      </div>
      {err && <div className="mt-3"><Notice ok={false} text={err} /></div>}
      <button
        onClick={remove}
        disabled={busy || confirm !== "HAPUS"}
        className="mt-4 rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/25 disabled:opacity-40"
      >
        {busy ? "Menghapus…" : "Hapus akun saya"}
      </button>
    </div>
  );
}

// ── Primitives ─────────────────────────────────────────────────
function PanelCard({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="card space-y-4 p-6">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {desc && <p className="mt-0.5 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function Notice({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p
      className={`rounded-lg border px-3 py-2 text-sm ${
        ok
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
          : "border-red-500/25 bg-red-500/10 text-red-300"
      }`}
    >
      {text}
    </p>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface2/50 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

// ── Ikon kecil (garis) ─────────────────────────────────────────
function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}
function IconUser() {
  return <Ic><circle cx="12" cy="8" r="4" /><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" /></Ic>;
}
function IconLock() {
  return <Ic><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Ic>;
}
function IconLayers() {
  return <Ic><path d="M12 2 2 7l10 5 10-5-10-5z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></Ic>;
}
function IconWarn() {
  return <Ic><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></Ic>;
}
function IconCheckSm() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-emerald-400">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
