"use client";
// Shell dashboard: guard sesi + sidebar + modal New Project (berlaku ke semua sub-halaman).
import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { useProjectStore } from "@/store/use-project-store";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const token = session?.apiToken;
  const createProject = useProjectStore((s) => s.createProject);

  const [npOpen, setNpOpen] = useState(false);
  const [npName, setNpName] = useState("");

  useEffect(() => {
    if (status !== "loading" && !session) router.replace("/login");
  }, [status, session, router]);

  if (status === "loading" || !session)
    return <p className="p-10 text-sm text-muted-foreground">Memuat…</p>;

  async function submitNewProject(e: React.FormEvent) {
    e.preventDefault();
    const name = npName.trim();
    if (!name || !token) return;
    await createProject(token, name);
    setNpName("");
    setNpOpen(false);
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen">
      <Sidebar
        userName={session.user?.name}
        onNewProject={() => setNpOpen(true)}
        onLogout={() => signOut({ callbackUrl: "/" })}
      />

      {npOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setNpOpen(false)}
        >
          <form
            onSubmit={submitNewProject}
            onClick={(e) => e.stopPropagation()}
            className="card w-full max-w-md p-6"
          >
            <h2 className="text-lg font-semibold">Project baru</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Beri nama untuk mengelompokkan service-mu.
            </p>
            <input
              autoFocus
              value={npName}
              onChange={(e) => setNpName(e.target.value)}
              placeholder="mis. my-awesome-app"
              className="field w-full px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNpOpen(false)}
                className="btn-ghost rounded-lg px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!npName.trim()}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold"
              >
                Buat Project
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="pl-60">{children}</div>
    </div>
  );
}
