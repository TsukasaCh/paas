/**
 * Ronaldo Cloud Agent — dipasang di VPS.
 *
 * Agent DIAL-OUT ke control plane (WebSocket), jadi:
 *  - tembus NAT/firewall, tidak ada port yang perlu dibuka di VPS
 *  - control plane tidak menyimpan kredensial SSH
 *  - koneksi otomatis pulih (reconnect + backoff)
 *
 * Jalankan:
 *   RC_URL=wss://ronaldocloud.id/agent RC_TOKEN=xxx node dist/index.js
 */
import WebSocket from "ws";
import {
  decode,
  encode,
  type AgentMsg,
  type ServerMsg,
} from "@minipaas/agent-proto";
import { collectSysInfo, sampleTelemetry, AGENT_VERSION } from "./sysinfo.js";
import { runJob, stopService, cleanupService, reviveHung, setEventSink } from "./exec.js";
import {
  handleProxyReq,
  handleProxyReqChunk,
  handleProxyReqEnd,
  handleWsOpen,
  handleWsSend,
  handleWsClose,
} from "./proxy.js";
import { sampleInstances } from "./metrics.js";

const URL = process.env.RC_URL ?? "ws://localhost:4000/agent";
const TOKEN = process.env.RC_TOKEN ?? "";
const HEARTBEAT_MS = 5_000;

if (!TOKEN) {
  console.error("[agent] RC_TOKEN belum di-set. Keluar.");
  process.exit(1);
}

let ws: WebSocket | null = null;
let heartbeat: NodeJS.Timeout | null = null;
let backoff = 1000;

function send(m: AgentMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(encode(m));
}

// Laporkan kejadian auto-heal (restart/crash-loop) ke control plane.
setEventSink((e) => send({ t: "instance-event", ...e }));

function connect() {
  console.log(`[agent] menghubungi control plane ${URL}…`);
  ws = new WebSocket(URL);

  ws.on("open", async () => {
    backoff = 1000;
    const info = await collectSysInfo();
    console.log(
      `[agent] terhubung. host=${info.hostname} cpu=${info.cpuCores} mem=${info.memoryMb}MB docker=${info.dockerAvailable}`,
    );
    send({ t: "register", token: TOKEN, info });

    heartbeat = setInterval(async () => {
      const s = sampleTelemetry();
      // Metrics per replica ikut heartbeat — agent satu-satunya yang bisa
      // mengukur proses/container di mesin ini.
      const instances = await sampleInstances().catch(() => []);
      send({ t: "heartbeat", cpuPct: s.cpuPct, memPct: s.memPct, instances });

      // Replica hidup tapi portnya tidak merespons (hang) → hidupkan ulang.
      // Proses yang mati total sudah ditangani handler exit di exec.ts.
      for (const m of instances) {
        if (!m.healthy) reviveHung(m.instanceId);
      }
    }, HEARTBEAT_MS);
  });

  ws.on("message", async (raw) => {
    const msg = decode<ServerMsg>(raw.toString());
    if (!msg) return;

    if (msg.t === "registered") {
      console.log(`[agent] terdaftar sebagai node "${msg.name}" (${msg.nodeId})`);
      return;
    }
    if (msg.t === "reject") {
      console.error(`[agent] ditolak control plane: ${msg.reason}`);
      ws?.close();
      process.exit(1);
    }

    // Trafik user yang ditembuskan control plane → aplikasi lokal.
    if (msg.t === "proxy-req") {
      handleProxyReq(msg, send);
      return;
    }
    if (msg.t === "proxy-req-chunk") {
      handleProxyReqChunk(msg.id, msg.data);
      return;
    }
    if (msg.t === "proxy-req-end") {
      handleProxyReqEnd(msg.id);
      return;
    }
    // Tunnel WebSocket app user.
    if (msg.t === "ws-open") {
      handleWsOpen(msg, send);
      return;
    }
    if (msg.t === "ws-send") {
      handleWsSend(msg.id, msg.data, msg.binary);
      return;
    }
    if (msg.t === "ws-close") {
      handleWsClose(msg.id, msg.code, msg.reason);
      return;
    }

    if (msg.t === "deploy") {
      const { job } = msg;
      const tag = job.replicaIndex > 0 ? `[replica ${job.replicaIndex}] ` : "";
      const log = (line: string, stream?: "build" | "runtime") =>
        send({ t: "log", deploymentId: job.deploymentId, line: tag + line, stream });
      console.log(
        `[agent] job deploy ${job.deploymentId} replica#${job.replicaIndex} (${job.source}/${job.runtime})`,
      );
      try {
        const r = await runJob(job, log);
        send({
          t: "result",
          deploymentId: job.deploymentId,
          instanceId: job.instanceId,
          ok: true,
          ...r,
        });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log(`❌ ${error}`);
        send({
          t: "result",
          deploymentId: job.deploymentId,
          instanceId: job.instanceId,
          ok: false,
          error,
        });
      }
      return;
    }

    if (msg.t === "action") {
      console.log(`[agent] aksi ${msg.action} untuk service ${msg.serviceId}`);
      try {
        if (msg.action === "stop") await stopService(msg.serviceId);
        else if (msg.action === "cleanup") await cleanupService(msg.serviceId);
        else if (msg.action === "restart") {
          // Restart = control plane akan mengirim job deploy baru.
          await stopService(msg.serviceId);
        }
        send({ t: "action-result", serviceId: msg.serviceId, action: msg.action, ok: true });
      } catch (e) {
        send({
          t: "action-result",
          serviceId: msg.serviceId,
          action: msg.action,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  });

  const retry = () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    ws = null;
    console.log(`[agent] koneksi putus, mencoba lagi dalam ${backoff / 1000}s…`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30_000); // exponential backoff
  };

  ws.on("close", retry);
  ws.on("error", (e) => console.error(`[agent] error: ${e.message}`));
}

console.log(`[agent] Ronaldo Cloud agent v${AGENT_VERSION}`);
connect();
