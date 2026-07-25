"use client";
// Registrasi akun: nama + email + password (tanpa perlu GitHub).
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "Gagal mendaftar.");
        return;
      }
      // Langsung login setelah daftar.
      const s = await signIn("credentials", {
        identifier: form.username,
        password: form.password,
        redirect: false,
      });
      if (s?.error) setError("Akun dibuat, tapi gagal login. Coba masuk manual.");
      else router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  const f = "field w-full px-3 py-2 text-sm";
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm shadow-lg shadow-violet-500/30">
          ▲
        </span>
        <span className="font-semibold tracking-tight">
          Ronaldo<span className="gradient-text">Cloud</span>
        </span>
      </Link>

      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold">Buat akun</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gratis. Tanpa kartu kredit.
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Username
            </label>
            <input
              autoFocus
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className={f}
              placeholder="username kamu"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Nama <span className="opacity-60">(opsional)</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={f}
              placeholder="Nama tampilan"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={f}
              placeholder="kamu@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Password
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className={f}
              placeholder="Minimal 8 karakter"
            />
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="btn-primary mt-5 w-full rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          {loading ? "Membuat akun…" : "Daftar"}
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">atau</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
          className="btn-ghost w-full rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          Daftar dengan GitHub
        </button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Sudah punya akun?{" "}
        <Link href="/login" className="text-violet-400 hover:underline">
          Masuk
        </Link>
      </p>
    </div>
  );
}
