"use client";
// Halaman login ADMIN — terpisah dari user, pakai username + password.
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("admin", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Username atau password salah.");
    } else {
      router.push("/admin");
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <Link href="/" className="mb-8 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-amber-500 to-orange-500 text-sm shadow-lg shadow-amber-500/30">
          🛡️
        </span>
        <span className="font-semibold tracking-tight">Admin Console</span>
      </Link>

      <form onSubmit={submit} className="card w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold">Operator sign-in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kelola node & ketersediaan server.
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Username
            </label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="field w-full px-3 py-2 text-sm"
              placeholder="admin"
              autoFocus
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
          className="mt-5 w-full rounded-lg bg-gradient-to-b from-amber-500 to-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/25 disabled:opacity-50"
        >
          {loading ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </div>
  );
}
