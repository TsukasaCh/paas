"use client";
// Panel admin: atur domain & Cloudflare → user dapat subdomain otomatis.
import { useEffect, useState } from "react";
import { getDns, saveDns, testDns, type DnsConfig } from "@/lib/admin-api";

const f = "field w-full px-3 py-2 text-sm";

export function DnsSettings({ token }: { token: string }) {
  const [cfg, setCfg] = useState<DnsConfig | null>(null);
  const [apiToken, setApiToken] = useState(""); // hanya diisi bila mau ganti
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    getDns(token).then(setCfg).catch(() => {});
  }, [token]);

  if (!cfg) return null;
  const set = (p: Partial<DnsConfig>) => setCfg({ ...cfg, ...p });

  async function save() {
    setBusy("save");
    setMsg(null);
    try {
      await saveDns(token, { ...cfg!, apiToken: apiToken || undefined });
      setApiToken("");
      setCfg(await getDns(token));
      setMsg({ ok: true, text: "Tersimpan." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  async function test() {
    setBusy("test");
    setMsg(null);
    const r = await testDns(token, { apiToken: apiToken || undefined, zoneId: cfg!.zoneId });
    setMsg(
      r.ok
        ? { ok: true, text: `Terhubung ke zone "${r.zoneName}".` }
        : { ok: false, text: r.error ?? "Gagal terhubung." },
    );
    setBusy("");
    // JANGAN muat ulang config di sini — isian form yang belum disimpan
    // (domain/zone/target) akan tertimpa. Cukup catat hasil pengecekannya.
    setCfg((c) => (c ? { ...c, lastOk: r.ok, lastCheckAt: new Date().toISOString() } : c));
  }

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold">Domain &amp; DNS</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Tiap service otomatis dapat subdomain acak, mis.{" "}
            <span className="font-mono text-foreground">
              swift-otter.{cfg.domain || cfg.envFallbackDomain}
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Tip: isi domain dengan awalan seperti{" "}
            <span className="font-mono">app.domainmu.live</span> agar app user
            berada di <span className="font-mono">*.app.domainmu.live</span>,
            terpisah dari dashboard.
          </p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => set({ enabled: e.target.checked })}
            className="accent-violet-500"
          />
          Aktif
        </label>
      </div>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Domain aplikasi
            </label>
            <input
              className={f}
              value={cfg.domain}
              onChange={(e) => set({ domain: e.target.value })}
              placeholder="mis. app.domainmu.live"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Zone ID (Cloudflare)
            </label>
            <input
              className={f}
              value={cfg.zoneId}
              onChange={(e) => set({ zoneId: e.target.value })}
              placeholder="32 karakter hex"
            />
          </div>
        </div>

        {/* Domain platform sendiri — terpisah dari domain aplikasi user. */}
        <div className="rounded-xl border border-border bg-surface2/40 p-3">
          <p className="mb-2 text-xs font-medium">Domain platform</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Dashboard
              </label>
              <input
                className={f}
                value={cfg.dashboardDomain}
                onChange={(e) => set({ dashboardDomain: e.target.value })}
                placeholder="mis. app.domainmu.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                API &amp; agent
              </label>
              <input
                className={f}
                value={cfg.apiDomain}
                onChange={(e) => set({ apiDomain: e.target.value })}
                placeholder="mis. api.domainmu.com"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Dipakai untuk menyusun perintah instalasi agent. Kosongkan untuk
            memakai nilai dari environment server.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            API Token{" "}
            <span className="opacity-60">
              {cfg.hasToken ? "(tersimpan — isi hanya bila ingin mengganti)" : "(wajib)"}
            </span>
          </label>
          <input
            type="password"
            className={f}
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={cfg.hasToken ? "••••••••••••" : "Token dengan izin Zone:DNS:Edit"}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Disimpan terenkripsi (AES-256-GCM) dan tidak pernah dikirim balik ke browser.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Target record
            </label>
            <input
              className={f}
              value={cfg.target}
              onChange={(e) => set({ target: e.target.value })}
              placeholder="IP control plane / hostname"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              IP → record A, hostname → CNAME.
            </p>
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={cfg.proxied}
                onChange={(e) => set({ proxied: e.target.checked })}
                className="accent-violet-500"
              />
              Proxied (TLS &amp; DDoS di edge Cloudflare)
            </label>
          </div>
        </div>
      </div>

      {msg && (
        <p
          className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
            msg.ok
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
              : "border-red-500/25 bg-red-500/10 text-red-300"
          }`}
        >
          {msg.ok ? "✓ " : "⚠️ "}
          {msg.text}
        </p>
      )}

      {!msg && cfg.lastCheckAt && (
        <p className="mt-4 text-xs text-muted-foreground">
          Pengecekan terakhir: {new Date(cfg.lastCheckAt).toLocaleString("id-ID")} —{" "}
          {cfg.lastOk ? (
            <span className="text-emerald-300">OK</span>
          ) : (
            <span className="text-red-300">{cfg.lastError}</span>
          )}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={test}
          disabled={!!busy}
          className="btn-ghost rounded-lg px-4 py-2 text-sm disabled:opacity-50"
        >
          {busy === "test" ? "Menguji…" : "Tes koneksi"}
        </button>
        <button
          onClick={save}
          disabled={!!busy}
          className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          {busy === "save" ? "Menyimpan…" : "Simpan"}
        </button>
      </div>

      {cfg.enabled && !cfg.domain && (
        <p className="mt-3 text-xs text-amber-300">
          ⚠️ Domain masih kosong — sementara memakai fallback{" "}
          <span className="font-mono">{cfg.envFallbackDomain}</span>.
        </p>
      )}
    </div>
  );
}
