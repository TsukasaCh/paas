"use client";
// Tombol nav landing: kalau sudah login → "Buka Dashboard", kalau belum → Masuk/Daftar.
import Link from "next/link";
import { useSession } from "next-auth/react";

export function LandingNavAuth() {
  const { status } = useSession();

  // Hindari kedip "Masuk" untuk user yang sebenarnya sudah login.
  if (status === "loading") return <span className="h-8 w-40" />;

  if (status === "authenticated") {
    return (
      <Link
        href="/dashboard"
        className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold"
      >
        Buka Dashboard →
      </Link>
    );
  }

  return (
    <>
      <Link href="/login" className="btn-ghost rounded-lg px-4 py-1.5 text-sm font-medium">
        Masuk
      </Link>
      <Link
        href="/register"
        className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold"
      >
        Mulai gratis
      </Link>
    </>
  );
}
