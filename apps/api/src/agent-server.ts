/**
 * Control plane untuk Agent: WebSocket server di /agent.
 *
 * Agent dial-out ke sini, register pakai join token, lalu:
 *  - heartbeat → lastSeenAt (status online DITURUNKAN dari sini, bukan manual)
 *  - log       → diteruskan ke bus → SSE → browser
 *  - result    → update Deployment & Service
 * Control plane mengirim job deploy / aksi lifecycle ke agent terpilih.
 */
import crypto from "node:crypto";
import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  decode,
  encode,
  type AgentMsg,
  type ServerMsg,
  type DeployJobSpec,
  type ProxyReq,
  type WsOpen,
  type InstanceMetric,
} from "@minipaas/agent-proto";
import { prisma } from "@minipaas/db";
import { publishLog } from "@minipaas/worker/logs";
import { openSecret } from "@minipaas/auth";
import { invalidateRoute } from "./proxy-server.js";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/** Agent yang sedang terhubung: nodeId → socket. */
const connections = new Map<string, WebSocket>();
/** Buffer log per deployment untuk disimpan saat selesai. */
const logBuffers = new Map<string, string[]>();

/** Request proxy yang sedang berjalan: requestId → callback response. */
export interface ProxyHandlers {
  onRes: (status: number, headers: Record<string, string | string[]>) => void;
  onChunk: (buf: Buffer) => void;
  onEnd: () => void;
  onErr: (error: string) => void;
}
interface PendingEntry {
  h: ProxyHandlers;
  timer: ReturnType<typeof setTimeout>;
}
const pending = new Map<string, PendingEntry>();

/** Tembuskan satu request HTTP ke agent. Mengembalikan false bila agent putus. */
export function sendProxyReq(
  nodeId: string,
  req: ProxyReq,
  handlers: ProxyHandlers,
): boolean {
  const ws = connections.get(nodeId);
  if (ws?.readyState !== WebSocket.OPEN) return false;
  // Jaring pengaman HANYA sampai response mulai. Dibersihkan saat proxy-res tiba,
  // supaya response berumur panjang (SSE, download besar) tidak diputus di 35s.
  const timer = setTimeout(() => {
    if (pending.delete(req.id)) handlers.onErr("Timeout menunggu agent");
  }, 35_000);
  pending.set(req.id, { h: handlers, timer });
  ws.send(encode(req));
  return true;
}

/** Kirim potongan body request yang di-stream ke agent. */
export function sendProxyReqChunk(nodeId: string, id: string, dataB64: string): boolean {
  return sendTo(nodeId, { t: "proxy-req-chunk", id, data: dataB64 });
}
/** Tandai body request streaming selesai. */
export function sendProxyReqEnd(nodeId: string, id: string): boolean {
  return sendTo(nodeId, { t: "proxy-req-end", id });
}

// ── Tunnel WebSocket app user ──────────────────────────────────
export interface WsHandlers {
  onOpen: (protocol?: string) => void;
  onRecv: (buf: Buffer, binary: boolean) => void;
  onClosed: (code?: number, reason?: string) => void;
  onErr: (error: string) => void;
}
const wsPending = new Map<string, WsHandlers>();
/** id tunnel WS per node, agar bisa dibersihkan saat agent putus. */
const nodeWsIds = new Map<string, Set<string>>();

/** Minta agent membuka WS ke app lokal. false bila node putus. */
export function openWsTunnel(nodeId: string, msg: WsOpen, handlers: WsHandlers): boolean {
  const ws = connections.get(nodeId);
  if (ws?.readyState !== WebSocket.OPEN) return false;
  wsPending.set(msg.id, handlers);
  let set = nodeWsIds.get(nodeId);
  if (!set) nodeWsIds.set(nodeId, (set = new Set()));
  set.add(msg.id);
  ws.send(encode(msg));
  return true;
}
export function sendWsData(nodeId: string, id: string, dataB64: string, binary: boolean): boolean {
  return sendTo(nodeId, { t: "ws-send", id, data: dataB64, binary });
}
export function sendWsClose(nodeId: string, id: string, code?: number, reason?: string): boolean {
  const ok = sendTo(nodeId, { t: "ws-close", id, code, reason });
  dropWsTunnel(nodeId, id);
  return ok;
}
function dropWsTunnel(nodeId: string, id: string): void {
  wsPending.delete(id);
  nodeWsIds.get(nodeId)?.delete(id);
}

export function connectedNodeIds(): string[] {
  return [...connections.keys()];
}

export function isConnected(nodeId: string): boolean {
  return connections.get(nodeId)?.readyState === WebSocket.OPEN;
}

function sendTo(nodeId: string, msg: ServerMsg): boolean {
  const ws = connections.get(nodeId);
  if (ws?.readyState !== WebSocket.OPEN) return false;
  ws.send(encode(msg));
  return true;
}

async function log(deploymentId: string, line: string) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  const buf = logBuffers.get(deploymentId) ?? [];
  buf.push(stamped);
  logBuffers.set(deploymentId, buf);
  await publishLog(deploymentId, stamped);
}

/** Kirim job deploy — satu job per replica, ke node masing-masing. */
export async function dispatchDeployment(deploymentId: string): Promise<void> {
  const dep = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: {
      service: { include: { envVars: true } },
      instances: { orderBy: { replicaIndex: "asc" } },
    },
  });
  if (!dep) throw new Error("Deployment tidak ditemukan");
  if (!dep.instances.length) throw new Error("Deployment tanpa instance");

  const svc = dep.service;
  const base = {
    deploymentId: dep.id,
    serviceId: svc.id,
    source: (svc.source as "GITHUB" | "IMAGE") ?? "GITHUB",
    repoUrl: svc.repoUrl ?? undefined,
    branch: svc.branch ?? "main",
    image: svc.image ?? undefined,
    containerPort: svc.containerPort ?? 3000,
    // Env var tersimpan terenkripsi → dibuka tepat sebelum dikirim ke agent.
    env: Object.fromEntries(svc.envVars.map((e) => [e.key, openSecret(e.value) ?? ""])),
    runtime: (svc.source === "IMAGE" || svc.type === "DATABASE"
      ? "docker"
      : (process.env.DEPLOY_RUNTIME ?? "node")) as "node" | "docker",
  };

  await prisma.deployment.update({
    where: { id: dep.id },
    data: { status: "BUILDING", startedAt: new Date() },
  });
  await prisma.service.update({ where: { id: svc.id }, data: { status: "DEPLOYING" } });
  await log(
    dep.id,
    dep.instances.length > 1
      ? `Menugaskan ${dep.instances.length} replica ke agent…`
      : "Menugaskan ke agent…",
  );

  for (const inst of dep.instances) {
    const job: DeployJobSpec = {
      ...base,
      instanceId: inst.id,
      replicaIndex: inst.replicaIndex,
    };
    if (!inst.nodeId || !sendTo(inst.nodeId, { t: "deploy", job })) {
      await log(dep.id, `❌ Agent untuk replica #${inst.replicaIndex} tidak terhubung.`);
      await prisma.instance.update({
        where: { id: inst.id },
        data: { status: "FAILED", errorMessage: "Agent tidak terhubung" },
      });
    }
  }
  await settleDeployment(dep.id);
}

/**
 * Tentukan status akhir deployment dari status seluruh replica:
 * masih ada PENDING → biarkan; ada ≥1 RUNNING → RUNNING; selain itu FAILED.
 */
async function settleDeployment(deploymentId: string): Promise<void> {
  const dep = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { instances: true },
  });
  if (!dep) return;
  if (dep.instances.some((i) => i.status === "PENDING")) return;

  const running = dep.instances.filter((i) => i.status === "RUNNING");
  const logs = (logBuffers.get(deploymentId) ?? []).join("\n");

  if (running.length) {
    const first = running[0];
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "RUNNING",
        containerId: first.handle,
        hostPort: first.hostPort,
        nodeId: first.nodeId,
        finishedAt: new Date(),
        logs,
      },
    });
    const svc = await prisma.service.update({
      where: { id: dep.serviceId },
      data: { status: "RUNNING", activeDeploymentId: deploymentId },
    });
    invalidateRoute(svc.slug); // route lama menunjuk replica yang sudah mati

    // Rilis baru menggantikan yang lama: tandai deployment & instance lama
    // sebagai berhenti. Tanpa ini instance mati tetap dihitung RUNNING →
    // kapasitas node bocor dan metrics menampilkan replica hantu.
    const olds = await prisma.deployment.findMany({
      where: { serviceId: dep.serviceId, id: { not: deploymentId } },
      select: { id: true },
    });
    if (olds.length) {
      const ids = olds.map((o) => o.id);
      await prisma.instance.updateMany({
        where: { deploymentId: { in: ids }, status: "RUNNING" },
        data: { status: "STOPPED" },
      });
      await prisma.deployment.updateMany({
        where: { id: { in: ids }, status: "RUNNING" },
        data: { status: "STOPPED" },
      });
    }
    await log(
      deploymentId,
      `✅ Deploy sukses — ${running.length}/${dep.instances.length} replica berjalan.`,
    );
  } else {
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: "FAILED",
        errorMessage: dep.instances[0]?.errorMessage ?? "Semua replica gagal",
        finishedAt: new Date(),
        logs,
      },
    });
    await prisma.service.update({
      where: { id: dep.serviceId },
      data: { status: "FAILED" },
    });
  }
  logBuffers.delete(deploymentId);
}

/**
 * Rekonsiliasi kondisi node dari heartbeat.
 *
 * Heartbeat memuat SELURUH replica yang benar-benar hidup di node itu, jadi:
 *  - dilaporkan & sehat        → RUNNING
 *  - dilaporkan & tidak sehat  → UNHEALTHY (port tidak menerima koneksi)
 *  - TIDAK dilaporkan          → FAILED (proses sudah mati)
 *
 * Proxy hanya me-rute ke instance RUNNING, jadi replica bermasalah otomatis
 * keluar dari rotasi — tanpa ini user kena 502 acak.
 */
async function reconcileNode(nodeId: string, reported: InstanceMetric[]): Promise<void> {
  const now = new Date();
  const seen = new Set<string>();

  for (const m of reported) {
    seen.add(m.instanceId);
    await prisma.instance
      .update({
        where: { id: m.instanceId },
        data: {
          cpuPct: m.cpuPct,
          memMb: m.memMb,
          uptimeSec: m.uptimeSec,
          metricsAt: now,
          status: m.healthy ? "RUNNING" : "UNHEALTHY",
          errorMessage: m.healthy ? null : "Port aplikasi tidak merespons",
        },
      })
      .catch(() => {});
  }

  // Replica yang DB-nya masih hidup tapi agent tidak melaporkannya = mati.
  // (PENDING sengaja dilewati: baru dikirim, belum sempat jalan.)
  const dead = await prisma.instance.findMany({
    where: {
      nodeId,
      status: { in: ["RUNNING", "UNHEALTHY"] },
      id: { notIn: [...seen] },
    },
    select: { id: true, deploymentId: true },
  });
  if (dead.length) {
    await prisma.instance.updateMany({
      where: { id: { in: dead.map((d) => d.id) } },
      data: { status: "FAILED", errorMessage: "Proses tidak lagi berjalan di node" },
    });
  }

  // Perbarui status service untuk deployment yang terdampak.
  const touched = new Set<string>([
    ...dead.map((d) => d.deploymentId),
    ...(await prisma.instance
      .findMany({ where: { id: { in: [...seen] } }, select: { deploymentId: true } })
      .then((r) => r.map((x) => x.deploymentId))
      .catch(() => [])),
  ]);
  for (const depId of touched) await refreshServiceHealth(depId);
}

/** Status service mengikuti jumlah replica yang benar-benar sehat. */
async function refreshServiceHealth(deploymentId: string): Promise<void> {
  const dep = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { instances: true, service: { select: { id: true, slug: true, status: true, activeDeploymentId: true } } },
  });
  // Hanya rilis yang sedang aktif yang menentukan status service.
  if (!dep || dep.service.activeDeploymentId !== deploymentId) return;
  // Service yang SENGAJA dihentikan jangan diubah jadi FAILED oleh health check.
  if (dep.service.status === "STOPPED") return;

  const healthy = dep.instances.filter((i) => i.status === "RUNNING").length;
  const next = healthy > 0 ? "RUNNING" : "FAILED";
  if (dep.service.status !== next) {
    await prisma.service.update({ where: { id: dep.service.id }, data: { status: next } });
    console.log(
      `[health] service ${dep.service.slug}: ${dep.service.status} → ${next} (${healthy}/${dep.instances.length} replica sehat)`,
    );
  }
  invalidateRoute(dep.service.slug); // rotasi proxy harus ikut berubah
}

/** Kirim aksi lifecycle ke agent yang menjalankan service tsb. */
export async function dispatchAction(
  serviceId: string,
  action: "stop" | "restart" | "cleanup",
): Promise<void> {
  const dep = await prisma.deployment.findFirst({
    where: { serviceId, nodeId: { not: null } },
    orderBy: { createdAt: "desc" },
  });
  if (dep?.nodeId) sendTo(dep.nodeId, { t: "action", action, serviceId });

  if (action === "stop" || action === "cleanup") {
    // Tandai instance STOPPED SEKARANG juga. Kalau tidak, heartbeat berikutnya
    // melihat instance "hilang" lalu memvonisnya FAILED — service yang sengaja
    // dihentikan jadi tampak gagal, dan proxy sempat mengirim trafik ke sana.
    await prisma.instance
      .updateMany({
        where: { deployment: { serviceId }, status: { in: ["RUNNING", "UNHEALTHY", "PENDING"] } },
        data: { status: "STOPPED", errorMessage: null },
      })
      .catch(() => {});
  }

  if (action === "stop") {
    const svc = await prisma.service
      .update({ where: { id: serviceId }, data: { status: "STOPPED" } })
      .catch(() => null);
    if (svc) invalidateRoute(svc.slug); // hentikan rotasi trafik seketika
  }
}

/** Pasang WS server ke HTTP server yang sudah ada. */
export function attachAgentServer(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url?.startsWith("/agent")) return;
    wss.handleUpgrade(req, socket as any, head, (ws) => wss.emit("connection", ws, req));
  });

  wss.on("connection", (ws) => {
    let nodeId: string | null = null;

    ws.on("message", async (raw) => {
      const msg = decode<AgentMsg>(raw.toString());
      if (!msg) return;

      // ── register: verifikasi token, simpan sysinfo ──
      if (msg.t === "register") {
        const node = await prisma.node.findUnique({
          where: { tokenHash: hashToken(msg.token) },
        });
        if (!node) {
          ws.send(encode({ t: "reject", reason: "Token tidak valid" }));
          ws.close();
          return;
        }
        nodeId = node.id;
        // Token yang sama dipakai dua mesin → keduanya saling menendang
        // (flapping) dan heartbeat/metrics jadi kacau. Tolak yang baru,
        // pertahankan koneksi yang sudah mapan, dan beri pesan jelas.
        const existing = connections.get(node.id);
        if (existing?.readyState === WebSocket.OPEN) {
          const since = node.lastSeenAt ? Date.now() - node.lastSeenAt.getTime() : Infinity;
          if (since < 30_000) {
            console.warn(
              `[agent-server] TOLAK: token node "${node.name}" dipakai agent lain (${msg.info.hostname}). Satu token hanya untuk satu mesin.`,
            );
            ws.send(
              encode({
                t: "reject",
                reason: `Token ini sudah dipakai agent lain yang aktif. Buat node baru untuk mesin ini, jangan pakai ulang token.`,
              }),
            );
            ws.close();
            return;
          }
          existing.close(); // koneksi lama sudah basi → gantikan
        }
        connections.set(nodeId, ws);

        await prisma.node.update({
          where: { id: node.id },
          data: {
            hostname: msg.info.hostname,
            os: msg.info.os,
            arch: msg.info.arch,
            cpuCores: msg.info.cpuCores,
            memoryMb: msg.info.memoryMb,
            dockerAvailable: msg.info.dockerAvailable,
            agentVersion: msg.info.agentVersion,
            lastSeenAt: new Date(),
          },
        });
        ws.send(encode({ t: "registered", nodeId: node.id, name: node.name }));
        console.log(`[agent-server] node "${node.name}" terhubung (${msg.info.hostname})`);
        return;
      }

      if (!nodeId) return; // pesan lain wajib sudah register

      // ── Frame tunnel HTTP dari agent ──
      if (msg.t === "proxy-res") {
        const e = pending.get(msg.id);
        if (e) {
          clearTimeout(e.timer); // response mulai → matikan jaring timeout
          e.h.onRes(msg.status, msg.headers);
        }
        return;
      }
      if (msg.t === "proxy-chunk") {
        pending.get(msg.id)?.h.onChunk(Buffer.from(msg.data, "base64"));
        return;
      }
      if (msg.t === "proxy-end") {
        const e = pending.get(msg.id);
        if (e) {
          clearTimeout(e.timer);
          e.h.onEnd();
          pending.delete(msg.id);
        }
        return;
      }
      if (msg.t === "proxy-err") {
        const e = pending.get(msg.id);
        if (e) {
          clearTimeout(e.timer);
          e.h.onErr(msg.error);
          pending.delete(msg.id);
        }
        return;
      }

      // ── Balasan tunnel WebSocket dari agent ──
      if (msg.t === "ws-open-ok") {
        wsPending.get(msg.id)?.onOpen(msg.protocol);
        return;
      }
      if (msg.t === "ws-open-err") {
        wsPending.get(msg.id)?.onErr(msg.error);
        dropWsTunnel(nodeId, msg.id);
        return;
      }
      if (msg.t === "ws-recv") {
        wsPending.get(msg.id)?.onRecv(Buffer.from(msg.data, "base64"), msg.binary);
        return;
      }
      if (msg.t === "ws-closed") {
        wsPending.get(msg.id)?.onClosed(msg.code, msg.reason);
        dropWsTunnel(nodeId, msg.id);
        return;
      }

      if (msg.t === "heartbeat") {
        await prisma.node
          .update({
            where: { id: nodeId },
            data: { lastSeenAt: new Date(), cpuPct: msg.cpuPct, memPct: msg.memPct },
          })
          .catch(() => {});

        await reconcileNode(nodeId, msg.instances ?? []);
        return;
      }

      if (msg.t === "log") {
        await log(msg.deploymentId, msg.line);
        return;
      }

      // Auto-heal: agent menghidupkan ulang replica yang mati/hang.
      if (msg.t === "instance-event") {
        if (msg.kind === "restarted") {
          await prisma.instance
            .update({
              where: { id: msg.instanceId },
              data: {
                status: "RUNNING",
                hostPort: msg.hostPort,
                handle: msg.handle,
                errorMessage: null,
                restarts: { increment: 1 },
                metricsAt: new Date(),
              },
            })
            .catch(() => {});
          console.log(`[heal] instance ${msg.instanceId} hidup lagi (percobaan ${msg.attempt})`);
        } else if (msg.kind === "crash-loop") {
          await prisma.instance
            .update({
              where: { id: msg.instanceId },
              data: {
                status: "FAILED",
                errorMessage: `Crash-loop: gagal ${msg.attempt}× berturut-turut (${msg.reason})`,
              },
            })
            .catch(() => {});
          console.log(`[heal] instance ${msg.instanceId} crash-loop — menyerah`);
        }
        // "restarting" cukup tampil di log deployment (sudah dikirim agent).
        await refreshServiceHealth(msg.deploymentId);
        return;
      }

      // Hasil per REPLICA — status deployment ditentukan setelah semua replica lapor.
      if (msg.t === "result") {
        await prisma.instance
          .update({
            where: { id: msg.instanceId },
            data: msg.ok
              ? { status: "RUNNING", handle: msg.handle, hostPort: msg.hostPort }
              : { status: "FAILED", errorMessage: msg.error },
          })
          .catch(() => {});
        await settleDeployment(msg.deploymentId);
        return;
      }
    });

    ws.on("close", () => {
      if (nodeId && connections.get(nodeId) === ws) {
        connections.delete(nodeId);
        // Node putus → semua tunnel WS-nya mati. Beri tahu sisi browser.
        const ids = nodeWsIds.get(nodeId);
        if (ids) {
          for (const id of ids) {
            wsPending.get(id)?.onClosed(1011, "Node terputus");
            wsPending.delete(id);
          }
          nodeWsIds.delete(nodeId);
        }
        console.log(`[agent-server] node ${nodeId} terputus`);
      }
    });
  });

  console.log("[agent-server] siap menerima agent di /agent");
}
