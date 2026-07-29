"use client";
// Viewer log realtime (SSE) — dipisah Build vs Akses/runtime, search, auto-scroll, unduh.
import { useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
// Penanda tak-terlihat dari control plane: baris runtime/akses (bukan build).
const RUNTIME_MARK = "\x1f";

type LogLine = { text: string; stream: "build" | "runtime" };
type StreamTab = "all" | "build" | "runtime";

function parse(raw: string): LogLine {
  return raw.startsWith(RUNTIME_MARK)
    ? { text: raw.slice(1), stream: "runtime" }
    : { text: raw, stream: "build" };
}

function lineClass(l: string): string {
  const s = l.toLowerCase();
  if (s.includes("❌") || s.includes("error") || s.includes("gagal") || s.includes("failed"))
    return "text-red-400";
  if (s.includes("✅") || s.includes("sukses") || s.includes("success") || s.includes("listening"))
    return "text-emerald-400";
  if (s.includes("warn")) return "text-amber-300";
  return "text-zinc-300";
}

export function DeploymentLogs({
  deploymentId,
  token,
  height = "h-80",
}: {
  deploymentId: string;
  token?: string;
  height?: string;
}) {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [query, setQuery] = useState("");
  const [streamTab, setStreamTab] = useState<StreamTab>("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    if (!deploymentId || !token) return;
    const es = new EventSource(
      `${API}/logs/${deploymentId}/stream?token=${encodeURIComponent(token)}`,
    );
    es.addEventListener("log", (e) => {
      const parsed = (e as MessageEvent).data.split("\n").map(parse);
      setLines((prev) => [...prev, ...parsed]);
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [deploymentId, token]);

  const counts = useMemo(() => {
    let build = 0;
    let runtime = 0;
    for (const l of lines) (l.stream === "runtime" ? runtime++ : build++);
    return { build, runtime };
  }, [lines]);

  const filtered = useMemo(
    () =>
      lines.filter(
        (l) =>
          (streamTab === "all" || l.stream === streamTab) &&
          (!query || l.text.toLowerCase().includes(query.toLowerCase())),
      ),
    [lines, query, streamTab],
  );

  useEffect(() => {
    if (autoScroll) boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [filtered, autoScroll]);

  function download() {
    const blob = new Blob([lines.map((l) => l.text).join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `logs-${deploymentId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const TABS: { id: StreamTab; label: string; n?: number }[] = [
    { id: "all", label: "Semua", n: lines.length },
    { id: "build", label: "Build", n: counts.build },
    { id: "runtime", label: "Akses", n: counts.runtime },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#08080c]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />

        {/* Pilih stream: Semua / Build / Akses */}
        <div className="ml-2 flex items-center gap-0.5 rounded-lg border border-border bg-surface2/50 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setStreamTab(t.id)}
              className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                streamTab === t.id
                  ? "bg-surface2 font-medium text-foreground ring-1 ring-inset ring-border"
                  : "text-zinc-400 hover:text-foreground"
              }`}
            >
              {t.label}
              {typeof t.n === "number" && (
                <span className="ml-1 font-mono text-zinc-500">{t.n}</span>
              )}
            </button>
          ))}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari di log…"
          className="field w-40 px-2 py-1 text-xs"
        />
        <div className="ml-auto flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-zinc-400">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="accent-violet-500"
            />
            Auto-scroll
          </label>
          <button
            onClick={download}
            disabled={!lines.length}
            className="btn-ghost rounded-md px-2 py-1 text-[11px] disabled:opacity-40"
          >
            Unduh
          </button>
        </div>
      </div>

      <div
        ref={boxRef}
        className={`${height} overflow-y-auto p-4 font-mono text-xs leading-5`}
      >
        {filtered.length === 0 ? (
          <span className="text-zinc-600">
            {lines.length
              ? streamTab === "runtime"
                ? "Belum ada log akses (muncul saat app menerima trafik)."
                : "Tidak ada baris yang cocok."
              : "$ menunggu log…"}
          </span>
        ) : (
          filtered.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${lineClass(l.text)}`}>
              {l.text}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
