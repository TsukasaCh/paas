"use client";
// Settings akun.
import { useSession } from "next-auth/react";

export default function AccountSettingsPage() {
  const { data: session } = useSession();

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Akun kamu</p>
      </header>

      <div className="card divide-y divide-border">
        <Row label="Nama" value={session?.user?.name ?? "—"} />
        <Row label="Email" value={session?.user?.email ?? "—"} />
        <Row label="Paket" value="Free" />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}
