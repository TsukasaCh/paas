"use client";
// Login: email + password (utama), GitHub opsional.
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { identifier, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Username/email atau password salah.");
    else router.push("/dashboard");
  }

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
        <h1 className="text-xl font-semibold">Masuk</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kelola dan deploy project-mu.
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Username atau email
            </label>
            <input
              autoFocus
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="field w-full px-3 py-2 text-sm"
              placeholder="username / kamu@email.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field w-full px-3 py-2 text-sm"
              placeholder="••••••••"
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
          {loading ? "Memeriksa…" : "Masuk"}
        </button>

        <div className="my-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">atau</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
          className="btn-ghost flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Lanjut dengan GitHub
        </button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Belum punya akun?{" "}
        <Link href="/register" className="text-violet-400 hover:underline">
          Daftar gratis
        </Link>
      </p>
    </div>
  );
}
