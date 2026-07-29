"use client";
// Login: username/email + password (utama), GitHub opsional.
import { useEffect, useState } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AuthShell,
  AuthField,
  AuthDivider,
  GitHubButton,
  IconUser,
  IconLock,
} from "@/components/auth-shell";

export default function LoginPage() {
  const router = useRouter();
  const { status } = useSession();

  // Sudah login → langsung ke dashboard (jangan tampilkan form lagi).
  useEffect(() => {
    if (status === "authenticated") router.replace("/dashboard");
  }, [status, router]);
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
    if (res?.error) {
      // Pesan spesifik (mis. akun disuspend/banned) diteruskan apa adanya;
      // kegagalan kredensial biasa memakai pesan generik.
      setError(
        res.error === "CredentialsSignin"
          ? "Username/email atau password salah."
          : res.error,
      );
    } else router.push("/dashboard");
  }

  return (
    <AuthShell
      title="Masuk"
      subtitle="Kelola dan deploy project-mu."
      footer={
        <>
          Belum punya akun?{" "}
          <Link href="/register" className="auth-link">
            Daftar gratis
          </Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <AuthField
          label="Username atau email"
          icon={IconUser}
          autoFocus
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="username / kamu@email.com"
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

      <AuthDivider />

      <GitHubButton
        label="Lanjut dengan GitHub"
        onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
      />
    </AuthShell>
  );
}
