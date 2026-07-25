"use client";
// Dialog "Create service" ala Railway: pilih sumber → GitHub Repo / Docker Image / Database.
import { useState } from "react";
import { createService, type EnvVarInput } from "@/lib/api";

type Kind = "GITHUB" | "IMAGE" | "DATABASE";

const KINDS: { id: Kind; icon: string; title: string; desc: string }[] = [
  { id: "GITHUB", icon: "🐙", title: "GitHub Repo", desc: "Deploy dari repositori" },
  { id: "IMAGE", icon: "🐳", title: "Docker Image", desc: "Dari Docker Hub" },
  { id: "DATABASE", icon: "🗄️", title: "Database", desc: "Postgres, Redis, MySQL" },
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
}: {
  projectId: string;
  token: string;
  onCreated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [kind, setKind] = useState<Kind>("GITHUB");
  const [name, setName] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [branch, setBranch] = useState("main");
  const [image, setImage] = useState("nginx:alpine");
  const [preset, setPreset] = useState(DB_PRESETS[0]);
  const [port, setPort] = useState(3000);
  const [envVars, setEnvVars] = useState<EnvVarInput[]>([{ key: "", value: "" }]);

  function reset() {
    setKind("GITHUB");
    setName("");
    setRepoUrl("");
    setBranch("main");
    setImage("nginx:alpine");
    setPreset(DB_PRESETS[0]);
    setPort(3000);
    setEnvVars([{ key: "", value: "" }]);
    setError(null);
  }

  function pickKind(k: Kind) {
    setKind(k);
    setError(null);
    if (k === "DATABASE") {
      setPort(preset.port);
      setEnvVars(preset.env.length ? preset.env : [{ key: "", value: "" }]);
    } else if (k === "IMAGE") {
      setPort(80);
    } else {
      setPort(3000);
    }
  }

  function pickPreset(p: (typeof DB_PRESETS)[number]) {
    setPreset(p);
    setPort(p.port);
    setEnvVars(p.env.length ? [...p.env] : [{ key: "", value: "" }]);
    if (!name) setName(p.label.toLowerCase());
  }

  // Derive nama default dari repo/image.
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
        await createService(token, projectId, {
          ...base,
          type: kind === "DATABASE" ? "DATABASE" : "APP",
          source: "IMAGE",
          image: kind === "DATABASE" ? preset.image : image.trim(),
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
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost rounded-lg px-3 py-1.5 text-xs font-medium"
      >
        + Create
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
            <div className="grid grid-cols-3 gap-2">
              {KINDS.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  onClick={() => pickKind(k.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    kind === k.id
                      ? "border-violet-500/60 bg-violet-500/10"
                      : "border-border bg-surface2 hover:border-border/80"
                  }`}
                >
                  <div className="text-lg">{k.icon}</div>
                  <div className="mt-1 text-xs font-medium">{k.title}</div>
                  <div className="text-[10px] text-muted-foreground">{k.desc}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-3">
              {kind === "GITHUB" && (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">
                      Link repositori
                    </label>
                    <input
                      autoFocus
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
                      autoFocus
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
                        className="btn-ghost rounded-lg px-2 text-xs"
                        aria-label="Hapus baris"
                      >
                        ✕
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
              <button type="button" onClick={() => setOpen(false)} className="btn-ghost rounded-lg px-4 py-2 text-sm">
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
          </form>
        </div>
      )}
    </>
  );
}
