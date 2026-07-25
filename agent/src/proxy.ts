/**
 * Sisi agent dari tunnel HTTP.
 *
 * Control plane mengirim `proxy-req`; agent meneruskannya ke aplikasi yang
 * berjalan di localhost VPS, lalu men-stream balik status/header/body.
 * Aplikasi TIDAK perlu terekspos ke internet.
 */
import http from "node:http";
import type { AgentMsg, ProxyReq } from "@minipaas/agent-proto";

type Send = (m: AgentMsg) => void;

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
      res.on("end", () => send({ t: "proxy-end", id: req.id }));
      res.on("error", (e) => send({ t: "proxy-err", id: req.id, error: e.message }));
    },
  );

  upstream.on("error", (e) =>
    send({ t: "proxy-err", id: req.id, error: e.message }),
  );
  upstream.setTimeout(30_000, () => {
    upstream.destroy();
    send({ t: "proxy-err", id: req.id, error: "Upstream timeout" });
  });

  if (body) upstream.write(body);
  upstream.end();
}
