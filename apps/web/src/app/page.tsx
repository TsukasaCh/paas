import Link from "next/link";

// Landing page (marketing). Benefit-focused, tanpa jargon internal.
export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-40 border-b border-border/70 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-6">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm shadow-lg shadow-violet-500/30">
            ▲
          </span>
          <span className="text-base font-semibold tracking-tight">
            Ronaldo<span className="gradient-text">Cloud</span>
          </span>
          <div className="ml-6 hidden items-center gap-5 text-sm text-muted-foreground md:flex">
            <a href="#fitur" className="transition-colors hover:text-foreground">Fitur</a>
            <a href="#cara" className="transition-colors hover:text-foreground">Cara kerja</a>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/login"
              className="btn-ghost rounded-lg px-4 py-1.5 text-sm font-medium"
            >
              Masuk
            </Link>
            <Link
              href="/register"
              className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold"
            >
              Mulai gratis
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-20 text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface2 px-3 py-1 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-violet-400 shadow-[0_0_8px_2px] shadow-violet-400/50" />
          Build &amp; deploy
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-6xl">
          Deploy apa saja,
          <br />
          <span className="gradient-text">tanpa ribetnya.</span>
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
          Hubungkan repo GitHub-mu, kami urus sisanya — build, environment
          variables, database, dan domain. Tanpa konfigurasi infra.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/register"
            className="btn-primary rounded-lg px-6 py-3 text-sm font-semibold"
          >
            Mulai gratis →
          </Link>
          <a
            href="#cara"
            className="btn-ghost rounded-lg px-6 py-3 text-sm font-medium"
          >
            Lihat cara kerja
          </a>
        </div>

        {/* Terminal mock */}
        <div className="mx-auto mt-14 max-w-2xl overflow-hidden rounded-xl border border-border bg-[#08080c] text-left shadow-2xl shadow-violet-500/10">
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-2.5">
            <span className="h-3 w-3 rounded-full bg-red-500/70" />
            <span className="h-3 w-3 rounded-full bg-amber-500/70" />
            <span className="h-3 w-3 rounded-full bg-emerald-500/70" />
            <span className="ml-2 font-mono text-xs text-zinc-500">deploy</span>
          </div>
          <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6 text-zinc-300">
            <span className="text-violet-400">➜</span> git push{" "}
            <span className="text-zinc-500">origin main</span>
            {"\n"}
            <span className="text-emerald-400">✓</span> Menyiapkan repository…
            {"\n"}
            <span className="text-emerald-400">✓</span> Membangun aplikasi…
            {"\n"}
            <span className="text-emerald-400">✓</span> Menyuntik environment variables…
            {"\n"}
            <span className="text-emerald-400">✓</span> Menjalankan &amp; mengekspos ke internet
            {"\n"}
            <span className="text-emerald-400">✓</span> Live di{" "}
            <span className="text-violet-300 underline">
              https://app-mu.ronaldocloud.id
            </span>
          </pre>
        </div>
      </section>

      {/* Cara kerja */}
      <section id="cara" className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-3">
          {[
            { icon: "🔗", title: "Hubungkan repo", desc: "Pilih repositori GitHub & branch yang ingin dijalankan." },
            { icon: "⚙️", title: "Kami build otomatis", desc: "Deteksi cara build & jalankan aplikasimu tanpa setup." },
            { icon: "🌍", title: "Langsung online", desc: "Dapat URL publik, SSL, dan log realtime seketika." },
          ].map((s, i) => (
            <div key={s.title}>
              <div className="mb-3 flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-surface2 text-lg">
                  {s.icon}
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                  0{i + 1}
                </span>
              </div>
              <h3 className="text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Networking mock — "hidup begitu di-deploy" */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Jaringan instan.
              <br />
              <span className="gradient-text">Tanpa setup.</span>
            </h2>
            <p className="mt-4 max-w-md text-muted-foreground">
              Koneksi privat antar-service, endpoint publik, SSL, dan load
              balancing aktif sejak detik pertama deploy.
            </p>
          </div>
          <div className="space-y-3">
            <MockCard name="web-app" url="web-app.ronaldocloud.id" color="from-violet-500 to-fuchsia-500" />
            <MockCard name="api" url="api.ronaldocloud.id" color="from-sky-500 to-cyan-500" />
            <MockCard name="postgres" url="internal · TCP 5432" color="from-indigo-500 to-blue-500" />
          </div>
        </div>
      </section>

      {/* Fitur */}
      <section id="fitur" className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: "🐙", title: "Deploy dari GitHub", desc: "Push ke branch, otomatis build & rilis." },
            { icon: "🗄️", title: "Database sekali klik", desc: "Postgres & Redis siap pakai sebagai service." },
            { icon: "📡", title: "Log realtime", desc: "Streaming build & runtime langsung ke dashboard." },
            { icon: "🚀", title: "Scaling otomatis", desc: "Kapasitas menyesuaikan — kamu fokus ke kode." },
          ].map((f) => (
            <div key={f.title} className="card p-5">
              <div className="mb-3 grid h-10 w-10 place-items-center rounded-lg bg-surface2 text-lg">
                {f.icon}
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA band */}
        <div className="card mt-10 flex flex-col items-center gap-4 p-10 text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            Siap men-deploy aplikasimu?
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Dari repo ke production dalam hitungan menit.
          </p>
          <Link
            href="/register"
            className="btn-primary rounded-lg px-6 py-3 text-sm font-semibold"
          >
            Mulai sekarang →
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} Ronaldo Cloud</span>
          <a
            href="https://ronaldocloud.id"
            className="flex items-center gap-2 transition-colors hover:text-foreground"
          >
            <span className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-violet-500 to-fuchsia-500 text-[10px]">
              ▲
            </span>
            <span className="font-medium text-foreground">ronaldocloud.id</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

function MockCard({ name, url, color }: { name: string; url: string; color: string }) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${color} text-sm`}>
        ●
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">{name}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">{url}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px] shadow-emerald-400/50" />
        Online
      </span>
    </div>
  );
}
