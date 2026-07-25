// Badge status service (dark, dot berpendar).
import { cn } from "@/lib/utils";
import type { ServiceStatus } from "@/store/use-project-store";

const STYLES: Record<
  ServiceStatus,
  { label: string; text: string; dot: string; glow: string }
> = {
  IDLE: { label: "Idle", text: "text-zinc-400", dot: "bg-zinc-500", glow: "" },
  DEPLOYING: {
    label: "Deploying",
    text: "text-amber-300",
    dot: "bg-amber-400 animate-pulse",
    glow: "shadow-[0_0_8px_2px] shadow-amber-400/50",
  },
  RUNNING: {
    label: "Running",
    text: "text-emerald-300",
    dot: "bg-emerald-400",
    glow: "shadow-[0_0_8px_2px] shadow-emerald-400/50",
  },
  FAILED: {
    label: "Failed",
    text: "text-red-300",
    dot: "bg-red-400",
    glow: "shadow-[0_0_8px_2px] shadow-red-400/40",
  },
  STOPPED: { label: "Stopped", text: "text-zinc-400", dot: "bg-zinc-500", glow: "" },
};

export function ServiceStatusBadge({ status }: { status: ServiceStatus }) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-surface2 px-2.5 py-1 text-xs font-medium",
        s.text,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot, s.glow)} />
      {s.label}
    </span>
  );
}
