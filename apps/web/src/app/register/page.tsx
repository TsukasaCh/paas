"use client";
// Registrasi akun: username + nama + email + password (GitHub opsional).
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AuthShell,
  AuthField,
  AuthDivider,
  GitHubButton,
  IconUser,
  IconLock,
  IconMail,
  IconTag,
} from "@/components/auth-shell";

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

  return (
    <AuthShell
      title="Buat akun"
      subtitle="Gratis. Tanpa kartu kredit."
      footer={
        <>
          Sudah punya akun?{" "}
          <Link href="/login" className="auth-link">
            Masuk
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <AuthField
          label="Username"
          icon={IconUser}
          autoFocus
          value={form.username}
          onChange={(e) => setForm({ ...form, username: e.target.value })}
          placeholder="username kamu"
        />
        <AuthField
          label={
            <>
              Nama <span className="opacity-60">(opsional)</span>
            </>
          }
          icon={IconTag}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          placeholder="Nama tampilan"
        />
        <AuthField
          label="Email"
          icon={IconMail}
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          placeholder="kamu@email.com"
        />
        <AuthField
          label="Password"
          icon={IconLock}
          type="password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          placeholder="Minimal 8 karakter"
        />
        {error && (
          <p className="mb-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <button type="submit" disabled={loading} className="auth-cta">
          {loading ? "Membuat akun…" : "Daftar"}
        </button>
      </form>

      <AuthDivider />

      <GitHubButton
        label="Daftar dengan GitHub"
        onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
      />
    </AuthShell>
  );
}
