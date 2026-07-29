"use client";
// Dialog "Create service" ala Railway: GitHub Repo / Template / Docker Image / Database.
import { useState, type ReactNode } from "react";
import { createService, type EnvVarInput } from "@/lib/api";
import { TEMPLATES, type Template } from "@/lib/templates";

type Kind = "GITHUB" | "TEMPLATE" | "IMAGE" | "DATABASE";

const KINDS: { id: Kind; icon: ReactNode; title: string; desc: string }[] = [
  { id: "GITHUB", icon: <IcoGit />, title: "GitHub Repo", desc: "Deploy dari repositori" },
  { id: "TEMPLATE", icon: <IcoLayers />, title: "Template", desc: "App siap deploy" },
  { id: "IMAGE", icon: <IcoBox />, title: "Docker Image", desc: "Dari registry" },
  { id: "DATABASE", icon: <IcoDb />, title: "Database", desc: "Postgres, Redis, MySQL" },
];

const DB_PRESETS = [
  { label: "PostgreSQL", image: "postgres:16-alpine", port: 5432, env: [{ key: "POSTGRES_PASSWORD", value: "secret" }] },
  { label: "Redis", image: "redis:7-alpine", port: 6379, env: [] },
  { label: "MySQL", image: "mysql:8", port: 3306, env: [{ key: "MYSQL_ROOT_PASSWORD", value: "secret" }] },
];

const f = "field w-full px-3 py-2 text-sm";

export function AddServiceDialog({
  projectId,
  token,
  onCreated,
  triggerLabel = "+ Add Service",
  triggerClassName = "btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium",
}: {
  projectId: string;
  token: string;
  onCreated: () => void;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("GITHUB");
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [image, setImage] = useState("nginx:alpine");
  const [preset, setPreset] = useState(DB_PRESETS[0]);
  const [port, setPort] = useState(3000);
  const [envVars, setEnvVars] = useState<EnvVarInput[]>([{ key: "", value: "" }]);

  function reset() {
    setKind("GITHUB");
    setTemplate(null);
    setName("");
    setRepoUrl("");
    setBranch("main");
    setImage("nginx:alpine");
    setPreset(DB_PRESETS[0]);
    setPort(3000);
    setEnvVars([{ key: "", value: "" }]);
    setError(null);
  }

  function openTemplates() {
    setKind("TEMPLATE");
    setTemplate(null);
    setError(null);
  }

  function pickKind(k: Kind) {
    setKind(k);
    setTemplate(null); // pilih sumber manual → keluar dari mode template
    setError(null);
    if (k === "DATABASE") {
      setPort(preset.port);
      setEnvVars(preset.env.length ? preset.env : [{ key: "", value: "" }]);
    } else if (k === "IMAGE") {
      setPort(80);
    } else if (k === "GITHUB") {
      setPort(3000);
    }
  }

  function pickPreset(p: (typeof DB_PRESETS)[number]) {
    setPreset(p);
    setPort(p.port);
    setEnvVars(p.env.length ? [...p.env] : [{ key: "", value: "" }]);
    if (!name) setName(p.label.toLowerCase());
  }

  // Terapkan template → isi form sumber terkait, lalu user tinggal Deploy.
  function applyTemplate(t: Template) {
    setTemplate(t);
    setKind(t.source);
    setName(t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
    setPort(t.containerPort);
    setEnvVars(t.env && t.env.length ? t.env.map((e) => ({ ...e })) : [{ key: "", value: "" }]);
    if (t.source === "GITHUB") {
      setRepoUrl(t.repoUrl ?? "");
      setBranch(t.branch ?? "main");
    } else {
      setImage(t.image ?? "");
    }
    setError(null);
  }

  function autoName(): string {
    if (name.trim()) return name.trim();
    if (kind === "GITHUB" && repoUrl)
      return repoUrl.replace(/\.git$/, "").split("/").filter(Boolean).pop() ?? "app";
    if (kind === "IMAGE" && image) return image.split(":")[0].split("/").pop() ?? "app";
    if (kind === "DATABASE") return preset.label.toLowerCase();
    return "app";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind === "GITHUB" && !repoUrl.trim())
      return setError("Tempel link repositori GitHub-nya.");
    if (kind === "IMAGE" && !image.trim())
      return setError("Isi nama image (mis. nginx:alpine).");

    setSaving(true);
    try {
      const base = {
        name: autoName(),
        containerPort: port,
        envVars: envVars.filter((e) => e.key.trim()),
      };
      if (kind === "GITHUB") {
        const url = repoUrl.trim();
        await createService(token, projectId, {
          ...base,
          type: "APP",
          source: "GITHUB",
          repoUrl: url,
          repoFullName: url.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, ""),
          branch: branch.trim() || "main",
        });
      } else {
        // IMAGE / DATABASE. Template kategori Database → type DATABASE.
        const isDb = template ? template.category === "Database" : kind === "DATABASE";
        await createService(token, projectId, {
          ...base,
          type: isDb ? "DATABASE" : "APP",
          source: "IMAGE",
          image: template ? image.trim() : kind === "DATABASE" ? preset.image : image.trim(),
        });
      }
      onCreated();
      setOpen(false);
      reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
          >
            <h2 className="text-lg font-semibold">Buat service baru</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Pilih sumber deployment.
            </p>

            {/* Pilih sumber */}
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k) => {
                const active = k.id === "TEMPLATE" ? kind === "TEMPLATE" || !!template : kind === k.id && !template;
                return (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => (k.id === "TEMPLATE" ? openTemplates() : pickKind(k.id))}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                      active
                        ? "border-violet-500/60 bg-violet-500/10"
                        : "border-border bg-surface2 hover:border-border/80"
                    }`}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-surface2 text-violet-300">
                      {k.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium">{k.title}</span>
                      <span className="block text-[10px] text-muted-foreground">{k.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* ── Galeri template ── */}
            {kind === "TEMPLATE" && (
              <div className="mt-4">
                <p className="mb-2 text-xs text-muted-foreground">
                  Pilih template — kami isi konfigurasinya, kamu tinggal Deploy.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="rounded-xl border border-border bg-surface2 p-3 text-left transition-colors hover:border-violet-500/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-background text-violet-300">
                          {catIcon(t.category)}
                        </span>
                        <span className="truncate text-sm font-medium">{t.name}</span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {t.desc}
                      </p>
                    </button>
                  ))}
                </div>
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="btn-ghost rounded-lg px-4 py-2 text-sm"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}

            {/* ── Form sumber (juga tampil setelah template dipilih) ── */}
            {kind !== "TEMPLATE" && (
              <>
                {template && (
                  <div className="mt-4 flex items-center justify-between rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs">
                    <span className="text-violet-200">
                      Dari template: <span className="font-medium">{template.name}</span>
                    </span>
                    <button
                      type="button"
                      onClick={openTemplates}
                      className="text-violet-300 hover:underline"
                    >
                      ganti
                    </button>
                  </div>
                )}

                <div className="mt-4 space-y-3">
                  {kind === "GITHUB" && (
                    <>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Link repositori
                        </label>
                        <input
                          autoFocus={!template}
                          className={f}
                          value={repoUrl}
                          onChange={(e) => setRepoUrl(e.target.value)}
                          placeholder="https://github.com/user/repo"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Branch
                          </label>
                          <input
                            className={f}
                            value={branch}
                            onChange={(e) => setBranch(e.target.value)}
                            placeholder="main"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-muted-foreground">
                            Port aplikasi
                          </label>
                          <input
                            type="number"
                            className={f}
                            value={port}
                            onChange={(e) => setPort(+e.target.value)}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {kind === "IMAGE" && (
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Image
                        </label>
                        <input
                          autoFocus={!template}
                          className={f}
                          value={image}
                          onChange={(e) => setImage(e.target.value)}
                          placeholder="nginx:alpine"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-muted-foreground">
                          Port
                        </label>
                        <input
                          type="number"
                          className={f}
                          value={port}
                          onChange={(e) => setPort(+e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  {kind === "DATABASE" && (
                    <div className="flex gap-2">
                      {DB_PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => pickPreset(p)}
                          className={`flex-1 rounded-lg border px-3 py-2 text-xs transition-colors ${
                            preset.label === p.label
                              ? "border-violet-500/60 bg-violet-500/10 font-medium"
                              : "border-border bg-surface2 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {p.label}
                          <span className="mt-0.5 block font-mono text-[10px] opacity-70">
                            {p.image}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Nama service <span className="opacity-60">(opsional)</span>
                    </label>
                    <input
                      className={f}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={autoName()}
                    />
                  </div>

                  {/* Env vars */}
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-medium text-muted-foreground">
                        Environment Variables
                      </label>
                      <button
                        type="button"
                        onClick={() => setEnvVars((p) => [...p, { key: "", value: "" }])}
                        className="text-xs text-violet-400 hover:underline"
                      >
                        + Tambah
                      </button>
                    </div>
                    <div className="space-y-2">
                      {envVars.map((row, i) => (
                        <div key={i} className="flex gap-2">
                          <input
                            className={f}
                            value={row.key}
                            onChange={(e) =>
                              setEnvVars((p) =>
                                p.map((x, idx) => (idx === i ? { ...x, key: e.target.value } : x)),
                              )
                            }
                            placeholder="KEY"
                          />
                          <input
                            className={f}
                            value={row.value}
                            onChange={(e) =>
                              setEnvVars((p) =>
                                p.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)),
                              )
                            }
                            placeholder="value"
                          />
                          <button
                            type="button"
                            onClick={() => setEnvVars((p) => p.filter((_, idx) => idx !== i))}
                            className="btn-ghost grid place-items-center rounded-lg px-2"
                            aria-label="Hapus baris"
                          >
                            <IcoX />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {error && (
                  <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {error}
                  </p>
                )}

                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="btn-ghost rounded-lg px-4 py-2 text-sm"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
                  >
                    {saving ? "Membuat…" : "Deploy"}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </>
  );
}

function catIcon(cat: Template["category"]): ReactNode {
  if (cat === "Database") return <IcoDb />;
  if (cat === "Tool") return <IcoCog />;
  return <IcoGit />;
}

// ── Ikon garis ──
function Ico({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
function IcoGit() {
  return (
    <Ico>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Ico>
  );
}
function IcoLayers() {
  return (
    <Ico>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </Ico>
  );
}
function IcoBox() {
  return (
    <Ico>
      <path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </Ico>
  );
}
function IcoDb() {
  return (
    <Ico>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </Ico>
  );
}
function IcoCog() {
  return (
    <Ico>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Ico>
  );
}
function IcoX() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
