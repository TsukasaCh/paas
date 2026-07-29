"use client";
// Shell dashboard: guard sesi + sidebar (New Project modal ada di NewProjectButton).
import { useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status !== "loading" && !session) router.replace("/login");
  }, [status, session, router]);

  if (status === "loading" || !session)
    return <p className="p-10 text-sm text-muted-foreground">Memuat…</p>;

  return (
    <div className="min-h-screen">
      <Sidebar
        userName={session.user?.name}
        onLogout={() => signOut({ callbackUrl: "/" })}
      />
      <div className="pl-60">{children}</div>
    </div>
  );
}
