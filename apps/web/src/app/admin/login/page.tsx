"use client";
// Login ADMIN (operator) — terpisah dari user, aksen amber.
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AuthShell,
  AuthField,
  IconUser,
  IconLock,
  IconShield,
} from "@/components/auth-shell";

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
    const res = await signIn("admin", { username, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Username atau password salah.");
    else router.push("/admin");
  }

  return (
    <AuthShell
      accent="amber"
      title="Operator sign-in"
      subtitle="Kelola node & ketersediaan server."
      badge={<span className="auth-badge">{IconShield} Operator</span>}
      footer={
        <Link href="/" className="auth-link">
          ← Kembali ke beranda
        </Link>
      }
    >
      <form onSubmit={submit}>
        <AuthField
          label="Username"
          icon={IconUser}
          autoFocus
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="admin"
        />
        <AuthField
          label="Password"
          icon={IconLock}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        {error && (
          <p className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="auth-cta">
          {loading ? "Memeriksa…" : "Masuk"}
        </button>
      </form>
    </AuthShell>
  );
}
