"use client";
// Viewer log realtime: streaming SSE + search, auto-scroll, pewarnaan level, unduh.
import { useEffect, useMemo, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
  const [lines, setLines] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    if (!deploymentId || !token) return;
    const es = new EventSource(
      `${API}/logs/${deploymentId}/stream?token=${encodeURIComponent(token)}`,
    );
    es.addEventListener("log", (e) => {
      setLines((prev) => [...prev, ...(e as MessageEvent).data.split("\n")]);
    });
    es.onerror = () => es.close();
    return () => es.close();
  }, [deploymentId, token]);

  const filtered = useMemo(
    () =>
      query
        ? lines.filter((l) => l.toLowerCase().includes(query.toLowerCase()))
        : lines,
    [lines, query],
  );

  useEffect(() => {
    if (autoScroll) boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [filtered, autoScroll]);

  function download() {
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `logs-${deploymentId}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-[#08080c]">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari di log…"
          className="field ml-2 w-48 px-2 py-1 text-xs"
        />
        <span className="font-mono text-[11px] text-zinc-500">
          {filtered.length}/{lines.length} baris
        </span>
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
            {lines.length ? "Tidak ada baris yang cocok." : "$ menunggu log…"}
          </span>
        ) : (
          filtered.map((l, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${lineClass(l)}`}>
              {l}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
