"use client";
// Tombol + modal "New Project" mandiri — dipakai di sidebar, header, & empty-state.
import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useProjectStore } from "@/store/use-project-store";

export function NewProjectButton({
  triggerLabel = "+ New",
  triggerClassName = "btn-primary rounded-lg px-4 py-2 text-sm font-semibold",
}: {
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const { data: session } = useSession();
  const token = session?.apiToken;
  const createProject = useProjectStore((s) => s.createProject);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n || !token) return;
    setSaving(true);
    try {
      await createProject(token, n);
      setName("");
      setOpen(false);
      router.push("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClassName}>
        {triggerLabel}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="card w-full max-w-md p-6"
          >
            <h2 className="text-lg font-semibold">Project baru</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Beri nama untuk mengelompokkan service-mu.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. my-awesome-app"
              className="field w-full px-3 py-2 text-sm"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn-ghost rounded-lg px-4 py-2 text-sm"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={!name.trim() || saving}
                className="btn-primary rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {saving ? "Membuat…" : "Buat Project"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
