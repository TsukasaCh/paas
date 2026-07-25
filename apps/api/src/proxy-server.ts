/**
 * Reverse proxy publik: <slug>.<APP_DOMAIN> → aplikasi user.
 *
 * Alur: request user → cari service dari subdomain → pilih replica RUNNING
 * (round-robin) → tembuskan lewat WebSocket agent node tempat replica itu
 * berjalan → stream response balik.
 *
 * Aplikasi user tidak pernah terekspos langsung; VPS tidak membuka port.
 */
import http from "node:http";
import crypto from "node:crypto";
import { prisma } from "@minipaas/db";
import { sendProxyReq, isConnected } from "./agent-server.js";
import { getAppDomain } from "./lib/dns.js";

const PROXY_PORT = Number(process.env.PROXY_PORT ?? 8080);
const CACHE_MS = 3000;

interface Target {
  nodeId: string;
  port: number;
}
interface Route {
  targets: Target[];
  at: number;
  /** false = slug tidak terdaftar sama sekali (→ 404, bukan 503). */
  exists: boolean;
}
const cache = new Map<string, Route>();
const rr = new Map<string, number>(); // penghitung round-robin per slug

/** Ambil slug dari Host header: "app.ronaldo.live" → "app". */
export function slugFromHost(host: string | undefined, domain: string): string | null {
  if (!host) return null;
  const h = host.split(":")[0].toLowerCase();
  if (h === domain) return null;
  if (!h.endsWith(`.${domain}`)) return null;
  const sub = h.slice(0, -(domain.length + 1));
  return sub.includes(".") ? null : sub || null; // tolak sub-sub-domain
}

/** Semua replica RUNNING milik service, di node yang agent-nya terhubung. */
async function resolveTargets(slug: string): Promise<Target[] | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.exists ? hit.targets : null;

  const svc = await prisma.service.findUnique({
    where: { slug },
    select: { activeDeploymentId: true, status: true },
  });
  // Bedakan "subdomain tidak terdaftar" (404) dari "ada tapi tidak jalan" (503).
  if (!svc) {
    cache.set(slug, { targets: [], at: Date.now(), exists: false });
    return null;
  }

  let targets: Target[] = [];
  // Service yang STOPPED langsung dianggap tidak berjalan → 503, tanpa mencoba
  // replica basi (mencegah 502 palsu saat status instance masih menyusul).
  if (svc.activeDeploymentId && svc.status !== "STOPPED") {
    // HANYA replica sehat yang masuk rotasi. Agent menandai replica yang
    // portnya tak merespons sebagai UNHEALTHY (dan yang hilang → FAILED),
    // sehingga filter "RUNNING" di sini otomatis mengeluarkannya. Tanpa ini
    // sebagian request akan jatuh ke replica mati → 502 acak.
    const inst = await prisma.instance.findMany({
      where: { deploymentId: svc.activeDeploymentId, status: "RUNNING" },
      select: { nodeId: true, hostPort: true },
    });
    targets = inst
      .filter((i) => i.nodeId && i.hostPort && isConnected(i.nodeId))
      .map((i) => ({ nodeId: i.nodeId!, port: i.hostPort! }));
  }
  cache.set(slug, { targets, at: Date.now(), exists: true });
  return targets;
}

/** Buang cache route (dipanggil saat deployment berubah). */
export function invalidateRoute(slug?: string): void {
  if (slug) cache.delete(slug);
  else cache.clear();
}

function fail(res: http.ServerResponse, code: number, msg: string) {
  res.writeHead(code, { "content-type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><meta charset="utf-8"><title>${code}</title>
     <div style="font:14px system-ui;padding:3rem;text-align:center">
       <h1 style="font-size:2rem;margin:0 0 .5rem">${code}</h1>
       <p style="color:#666">${msg}</p>
       <p style="color:#999;font-size:12px">Ronaldo Cloud</p>
     </div>`,
  );
}

export function startProxyServer(): http.Server {
  const server = http.createServer(async (req, res) => {
    // Domain diambil dari config admin (fallback env) → bisa diubah tanpa restart.
    const domain = await getAppDomain();
    const slug = slugFromHost(req.headers.host, domain);
    if (!slug) return fail(res, 404, "Aplikasi tidak ditemukan untuk domain ini.");

    const targets = await resolveTargets(slug);
    if (targets === null) {
      return fail(res, 404, "Aplikasi tidak ditemukan untuk domain ini.");
    }
    if (!targets.length) {
      return fail(res, 503, "Aplikasi sedang tidak berjalan.");
    }

    // Round-robin antar replica.
    const n = (rr.get(slug) ?? 0) % targets.length;
    rr.set(slug, n + 1);

    // Kumpulkan body (cukup untuk MVP; streaming request menyusul).
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? Buffer.concat(chunks).toString("base64") : undefined;

      /**
       * Coba replica ke-i; bila gagal SEBELUM response mulai terkirim,
       * lanjut ke replica berikutnya.
       *
       * Ini menutup celah antara "replica mati" dan "health check menyadarinya"
       * (bisa beberapa detik). Tanpa retry, request yang jatuh ke replica mati
       * akan jadi 502 walau replica lain sehat.
       */
      const attempt = async (i: number) => {
        if (i >= targets.length) {
          if (res.headersSent) return;
          // Semua replica gagal. Bedakan sebabnya secara jujur: kalau setelah
          // di-resolve ulang memang sudah tidak ada replica (mis. service baru
          // saja di-stop), itu 503 "tidak berjalan" — bukan 502 "upstream rusak".
          const fresh = await resolveTargets(slug).catch(() => null);
          if (fresh === null) return fail(res, 404, "Aplikasi tidak ditemukan untuk domain ini.");
          if (!fresh.length) return fail(res, 503, "Aplikasi sedang tidak berjalan.");
          return fail(res, 502, "Semua replica gagal merespons.");
        }
        const target = targets[(n + i) % targets.length];
        const id = crypto.randomUUID();

        const sent = sendProxyReq(
          target.nodeId,
          {
            t: "proxy-req",
            id,
            port: target.port,
            method: req.method ?? "GET",
            url: req.url ?? "/",
            headers: {
              ...(req.headers as Record<string, string>),
              "x-forwarded-host": req.headers.host ?? "",
              "x-forwarded-proto": "http",
            },
            body,
          },
          {
            onRes: (status, headers) => res.writeHead(status, headers),
            onChunk: (buf) => res.write(buf),
            onEnd: () => res.end(),
            onErr: (e) => {
              // Response belum mulai → aman dicoba ke replica lain.
              if (!res.headersSent) {
                invalidateRoute(slug); // paksa muat ulang daftar replica
                void attempt(i + 1);
              } else {
                res.end(); // sudah terlanjur mengalir; tak bisa diulang
              }
            },
          },
        );
        if (!sent) void attempt(i + 1); // agent node itu sedang putus
      };

      void attempt(0);
    });
  });

  // Sama seperti API: di produksi hanya Caddy yang terbuka ke internet.
  const bind = process.env.BIND_ADDRESS ?? "0.0.0.0";
  server.listen(PROXY_PORT, bind, async () =>
    console.log(
      `[proxy] listening on ${bind}:${PROXY_PORT} — routing *.${await getAppDomain()} lewat tunnel agent`,
    ),
  );
  return server;
}
