// Kerangka split-screen untuk halaman auth (login / register / admin).
// Kiri: panel brand + terminal beranimasi. Kanan: form (children).
// accent="amber" dipakai halaman operator (admin).
import Link from "next/link";
import type { ReactNode, InputHTMLAttributes } from "react";

const DEPLOY_LINES: ReactNode[] = [
  <>
    <span className="text-violet-300">➜</span> git push{" "}
    <span className="text-muted-foreground">origin main</span>
  </>,
  <>
    <span className="text-emerald-400">✓</span> Repository siap
  </>,
  <>
    <span className="text-emerald-400">✓</span> Build selesai
  </>,
  <>
    <span className="text-emerald-400">✓</span> Environment ter-inject
  </>,
  <>
    <span className="text-emerald-400">✓</span> Live ·{" "}
    <span className="text-violet-300 underline underline-offset-2">
      web-mu.ronaldocloud.id
    </span>
  </>,
];

const OPERATOR_LINES: ReactNode[] = [
  <>
    <span className="text-amber-300">➜</span> ronaldocloud node connect
  </>,
  <>
    <span className="text-emerald-400">✓</span> Agent terhubung ·{" "}
    <span className="text-muted-foreground">sin1</span>
  </>,
  <>
    <span className="text-emerald-400">✓</span> Node online
  </>,
  <>
    <span className="text-emerald-400">✓</span> Kapasitas 3 service
  </>,
  <>
    <span className="text-amber-300">●</span> Menunggu deployment…
  </>,
];

export function AuthShell({
  accent = "violet",
  title,
  subtitle,
  badge,
  footer,
  children,
}: {
  accent?: "violet" | "amber";
  title: string;
  subtitle: string;
  badge?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const operator = accent === "amber";
  const lines = operator ? OPERATOR_LINES : DEPLOY_LINES;
  const chips = operator ? ["sin1", "3 node", "online"] : ["web", "api", "worker"];

  return (
    <div className="auth-shell" data-accent={accent}>
      <aside className="auth-brand">
        <div className="auth-grid" />
        <Link
          href="/"
          className="relative flex items-center gap-2.5 text-base font-semibold tracking-tight"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm shadow-lg shadow-violet-500/30">
            ▲
          </span>
          Ronaldo<span className="gradient-text">Cloud</span>
        </Link>

        <div className="auth-bhead">
          <h1>
            {operator ? (
              <>
                Kelola <span className="auth-accent-text">node &amp; kapasitas.</span>
              </>
            ) : (
              <>
                Dari <span className="auth-accent-text">git push</span> ke production.
              </>
            )}
          </h1>
          <p className="sub">
            {operator
              ? "Pantau agent, sebar deployment, dan jaga ketersediaan server."
              : "Hubungkan repo, kami urus build, environment, database, dan domain. Tanpa konfigurasi infra."}
          </p>

          <div className="auth-term">
            <div className="auth-tbar">
              <i style={{ background: "#f87171" }} />
              <i style={{ background: "#fbbf24" }} />
              <i style={{ background: "#34d399" }} />
              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                {operator ? "operator" : "deploy"}
              </span>
            </div>
            <div className="auth-tbody">
              {lines.map((ln, i) => (
                <div className="auth-tline" key={i}>
                  {ln}
                </div>
              ))}
            </div>
          </div>

          <div className="auth-chips">
            {chips.map((c) => (
              <span className="auth-chip" key={c}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px] shadow-emerald-400/40" />
                {c}
              </span>
            ))}
          </div>
        </div>
      </aside>

      <main className="auth-formwrap">
        <div className="auth-form">
          {badge}
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="mb-7 mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
          {children}
          <p className="mt-6 text-center text-sm text-muted-foreground">{footer}</p>
        </div>
      </main>
    </div>
  );
}

export function AuthField({
  label,
  icon,
  ...props
}: { label: ReactNode; icon: ReactNode } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <div className="auth-inp">
        {icon}
        <input {...props} />
      </div>
    </div>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">atau</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

export function GitHubButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="auth-gh">
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
      </svg>
      {label}
    </button>
  );
}

// Ikon field (garis, mewarisi warna).
export const IconUser = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);
export const IconLock = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
export const IconMail = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);
export const IconTag = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.5 7.5h.01" />
    <path d="M3 3h7l11 11-7 7L3 10V3z" />
  </svg>
);
export const IconShield = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" width="13" height="13">
    <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" />
  </svg>
);
