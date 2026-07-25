/**
 * Sisi agent dari tunnel HTTP & WebSocket.
 *
 * Control plane mengirim `proxy-req` (+ opsional `proxy-req-chunk`/`-end` untuk
 * body streaming) atau `ws-open` (untuk WebSocket). Agent meneruskannya ke
 * aplikasi yang berjalan di localhost VPS, lalu men-stream balik status, header,
 * body, atau frame WS. Aplikasi TIDAK perlu terekspos ke internet.
 */
import http from "node:http";
import WebSocket from "ws";
import type {
  AgentMsg,
  ProxyReq,
  WsOpen,
} from "@minipaas/agent-proto";

type Send = (m: AgentMsg) => void;

/** Upstream request yang body-nya masih menyusul (streamed upload). */
const streaming = new Map<string, http.ClientRequest>();
/** Koneksi WebSocket ke app lokal, per tunnel id. */
const wsTunnels = new Map<string, WebSocket>();

export function handleProxyReq(req: ProxyReq, send: Send): void {
  const body = req.body ? Buffer.from(req.body, "base64") : undefined;

  const upstream = http.request(
    {
      host: "127.0.0.1",
      port: req.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        // Aplikasi bicara ke loopback; jaga Host asli untuk vhost-aware app.
        // Body streaming: JANGAN sentuh content-length — dipakai apa adanya
        // dari header asli agar upstream tahu berapa byte yang akan datang.
        ...(body ? { "content-length": String(body.length) } : {}),
      },
    },
    (res) => {
      send({
        t: "proxy-res",
        id: req.id,
        status: res.statusCode ?? 502,
        headers: res.headers as Record<string, string | string[]>,
      });
      res.on("data", (c: Buffer) =>
        send({ t: "proxy-chunk", id: req.id, data: c.toString("base64") }),
      );
      res.on("end", () => {
        streaming.delete(req.id);
        send({ t: "proxy-end", id: req.id });
      });
      res.on("error", (e) => send({ t: "proxy-err", id: req.id, error: e.message }));
    },
  );

  upstream.on("error", (e) => {
    streaming.delete(req.id);
    send({ t: "proxy-err", id: req.id, error: e.message });
  });
  upstream.setTimeout(30_000, () => {
    upstream.destroy();
    streaming.delete(req.id);
    send({ t: "proxy-err", id: req.id, error: "Upstream timeout" });
  });

  if (req.streamed) {
    // Body menyusul lewat proxy-req-chunk. Biarkan upstream terbuka.
    streaming.set(req.id, upstream);
  } else {
    if (body) upstream.write(body);
    upstream.end();
  }
}

/** Potongan body untuk request yang di-stream. */
export function handleProxyReqChunk(id: string, dataB64: string): void {
  streaming.get(id)?.write(Buffer.from(dataB64, "base64"));
}

/** Body streaming selesai — tutup sisi request upstream. */
export function handleProxyReqEnd(id: string): void {
  const up = streaming.get(id);
  if (up) {
    up.end();
    streaming.delete(id);
  }
}

// ── WebSocket ──────────────────────────────────────────────────

/** Kode close WS yang boleh diteruskan (1006/1005 & <1000 dilarang oleh spec). */
function safeCode(code?: number): number | undefined {
  if (code == null) return undefined;
  if (code === 1005 || code === 1006) return undefined; // "no status"/abnormal
  if (code < 1000 || code > 4999) return undefined;
  return code;
}

/**
 * Buka koneksi WebSocket ke app lokal atas nama browser. Handshake ke browser
 * baru diselesaikan control plane SETELAH app menerima (ws-open-ok) — jadi
 * subprotokol yang dipilih app bisa ikut dinegosiasikan dengan benar.
 */
export function handleWsOpen(msg: WsOpen, send: Send): void {
  const protocols = msg.protocols
    ? msg.protocols.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  let opened = false;
  let app: WebSocket;
  try {
    app = new WebSocket(`ws://127.0.0.1:${msg.port}${msg.url}`, protocols, {
      headers: msg.headers,
      perMessageDeflate: false,
      handshakeTimeout: 15_000,
    });
  } catch (e) {
    send({ t: "ws-open-err", id: msg.id, error: e instanceof Error ? e.message : String(e) });
    return;
  }
  wsTunnels.set(msg.id, app);

  app.on("open", () => {
    opened = true;
    send({ t: "ws-open-ok", id: msg.id, protocol: app.protocol || undefined });
  });
  app.on("message", (data: WebSocket.RawData, isBinary: boolean) => {
    const buf = Array.isArray(data)
      ? Buffer.concat(data)
      : Buffer.isBuffer(data)
        ? data
        : Buffer.from(new Uint8Array(data as ArrayBuffer));
    send({ t: "ws-recv", id: msg.id, data: buf.toString("base64"), binary: !!isBinary });
  });
  app.on("close", (code: number, reason: Buffer) => {
    wsTunnels.delete(msg.id);
    // Gagal sebelum sempat open → itu penolakan handshake, bukan penutupan biasa.
    if (!opened) return; // 'error'/'unexpected-response' sudah mengirim ws-open-err
    send({ t: "ws-closed", id: msg.id, code: safeCode(code), reason: reason?.toString() });
  });
  app.on("error", (e: Error) => {
    if (!opened) {
      wsTunnels.delete(msg.id);
      send({ t: "ws-open-err", id: msg.id, error: e.message });
    }
    // Setelah open, 'close' menyusul dan menangani pembersihan.
  });
}

/** Frame dari browser → app lokal. */
export function handleWsSend(id: string, dataB64: string, binary: boolean): void {
  const app = wsTunnels.get(id);
  if (app?.readyState === WebSocket.OPEN) {
    app.send(Buffer.from(dataB64, "base64"), { binary });
  }
}

/** Browser menutup koneksi → tutup app lokal. */
export function handleWsClose(id: string, code?: number, reason?: string): void {
  const app = wsTunnels.get(id);
  wsTunnels.delete(id);
  if (!app) return;
  try {
    app.close(safeCode(code), reason);
  } catch {
    app.terminate();
  }
}
