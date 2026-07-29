"use client";
// Sidebar app-shell: logo, aksi, nav (route-based), user di bawah.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { UsageCard } from "./usage-card";

const ICON: Record<string, React.ReactNode> = {
  projects: <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" />,
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
};

const NAV = [
  { key: "projects", label: "Projects", href: "/dashboard" },
  { key: "activity", label: "Activity", href: "/dashboard/activity" },
  { key: "settings", label: "Settings", href: "/dashboard/settings" },
];

export function Sidebar({
  userName,
  onLogout,
}: {
  userName?: string | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const initial = (userName ?? "U").charAt(0).toUpperCase();

  function isActive(href: string) {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname.startsWith("/dashboard/services");
    }
    return pathname.startsWith(href);
  }

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-border bg-[#0c0c11]">
      <Link href="/" className="flex h-14 items-center gap-2 border-b border-border px-4">
        <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[13px] shadow-lg shadow-violet-500/30">
          ▲
        </span>
        <span className="text-sm font-semibold tracking-tight">
          Ronaldo<span className="gradient-text">Cloud</span>
        </span>
      </Link>

      <nav className="mt-3 flex flex-col gap-1 px-3">
        {NAV.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive(item.href)
                ? "bg-surface2 font-medium text-foreground ring-1 ring-inset ring-border"
                : "text-muted-foreground hover:bg-surface2/60 hover:text-foreground",
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {ICON[item.key]}
            </svg>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      <div className="px-3 pb-1">
        <UsageCard />
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-semibold text-white">
            {initial}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{userName ?? "User"}</p>
            <button onClick={onLogout} className="text-xs text-muted-foreground hover:text-foreground">
              Keluar
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
