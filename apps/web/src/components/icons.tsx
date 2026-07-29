// Ikon garis minimalis dipakai di dashboard (pengganti emoji).
import type { ReactNode } from "react";

function Ic({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconFolder({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9l-.72-1.2A2 2 0 0 0 7.99 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
    </Ic>
  );
}
export function IconRocket({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </Ic>
  );
}
export function IconDatabase({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
    </Ic>
  );
}
export function IconBox({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <path d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </Ic>
  );
}
export function IconGlobe({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 2.5 15.5 0 18M12 3c-2.5 2.5-2.5 15.5 0 18" />
    </Ic>
  );
}
export function IconWarn({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Ic>
  );
}
export function IconX({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Ic>
  );
}
export function IconCheck({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Ic>
  );
}
export function IconGit({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <line x1="6" y1="3" x2="6" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </Ic>
  );
}
export function IconLayers({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="m2 17 10 5 10-5" />
      <path d="m2 12 10 5 10-5" />
    </Ic>
  );
}
export function IconPlus({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <path d="M12 5v14M5 12h14" />
    </Ic>
  );
}
export function IconGrid({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </Ic>
  );
}
export function IconList({ className }: { className?: string }) {
  return (
    <Ic className={className}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </Ic>
  );
}
