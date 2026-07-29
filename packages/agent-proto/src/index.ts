/**
 * Protokol WebSocket antara Agent (di VPS) dan Control Plane.
 *
 * Agent selalu yang dial-out → tembus NAT/firewall, tidak ada port dibuka
 * di VPS, dan control plane tidak perlu menyimpan kredensial SSH.
 */

export const AGENT_PROTOCOL_VERSION = 1;

// ── Info yang dilaporkan agent saat register ───────────────────
export interface AgentSysInfo {
  hostname: string;
  os: string;
  arch: string;
  cpuCores: number;
  memoryMb: number;
  dockerAvailable: boolean;
  agentVersion: string;
}

// ── Spesifikasi job deploy (self-contained; agent tak akses DB) ─
export interface DeployJobSpec {
  deploymentId: string;
  serviceId: string;
  /** Satu job = satu replica. */
  instanceId: string;
  replicaIndex: number;
  source: "GITHUB" | "IMAGE";
  repoUrl?: string;
  branch?: string;
  image?: string;
  containerPort: number;
  env: Record<string, string>;
  runtime: "node" | "docker";
}

// ── Tunnel HTTP lewat WebSocket agent ──────────────────────────
// Trafik user masuk ke reverse proxy di control plane, lalu ditembuskan ke
// aplikasi di VPS lewat koneksi agent yang sudah ada. Dengan begitu VPS tidak
// perlu membuka port apa pun dan tetap bisa di balik NAT.
export interface ProxyReq {
  t: "proxy-req";
  id: string; // korelasi request↔response
  port: number; // port lokal aplikasi di VPS
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string; // base64, kosong bila tak ada body
  /**
   * true = body TIDAK di-inline; menyusul lewat proxy-req-chunk/proxy-req-end.
   * Dipakai untuk upload besar agar tidak menumpuk di memori control plane.
   */
  streamed?: boolean;
}

// ── Tunnel WebSocket lewat koneksi agent ───────────────────────
// App user yang memakai WebSocket (chat, live update) ditembuskan sama seperti
// HTTP: browser upgrade ke reverse proxy → control plane minta agent membuka WS
// ke app lokal → frame dipompa dua arah. VPS tetap tanpa port terbuka.
export interface WsOpen {
  t: "ws-open";
  id: string;
  port: number;
  url: string;
  headers: Record<string, string>;
  /** Daftar subprotokol yang diminta browser (Sec-WebSocket-Protocol), koma-pisah. */
  protocols?: string;
}

/**
 * Telemetry + kesehatan satu replica, diukur agent di mesinnya sendiri.
 *
 * Heartbeat memuat SELURUH replica yang benar-benar hidup di node itu, sehingga
 * control plane bisa merekonsiliasi: replica yang ada di DB tapi tidak dilaporkan
 * = sudah mati.
 */
export interface InstanceMetric {
  instanceId: string;
  cpuPct: number;
  memMb: number;
  uptimeSec: number;
  /** false = proses hidup tapi portnya tidak menerima koneksi (hang). */
  healthy: boolean;
}

// ── Agent → Control Plane ──────────────────────────────────────
export type AgentMsg =
  | { t: "register"; token: string; info: AgentSysInfo }
  | {
      t: "heartbeat";
      cpuPct: number;
      memPct: number;
      /** Metrics per replica yang sedang berjalan di node ini. */
      instances?: InstanceMetric[];
    }
  | { t: "log"; deploymentId: string; line: string; stream?: "build" | "runtime" }
  | {
      /** Agent menghidupkan ulang replica yang mati/hang (auto-heal). */
      t: "instance-event";
      instanceId: string;
      deploymentId: string;
      kind: "restarting" | "restarted" | "crash-loop";
      attempt: number;
      reason: string;
      hostPort?: number;
      handle?: string;
    }
  | { t: "proxy-res"; id: string; status: number; headers: Record<string, string | string[]> }
  | { t: "proxy-chunk"; id: string; data: string } // base64
  | { t: "proxy-end"; id: string }
  | { t: "proxy-err"; id: string; error: string }
  // ── Balasan tunnel WebSocket (agent → control plane) ──
  | { t: "ws-open-ok"; id: string; protocol?: string } // app menerima; subprotokol terpilih
  | { t: "ws-open-err"; id: string; error: string } // app menolak/mati sebelum handshake
  | { t: "ws-recv"; id: string; data: string; binary: boolean } // frame dari app (base64)
  | { t: "ws-closed"; id: string; code?: number; reason?: string }
  | {
      t: "result";
      deploymentId: string;
      instanceId: string;
      ok: boolean;
      handle?: string;
      hostPort?: number;
      error?: string;
    }
  | { t: "action-result"; serviceId: string; action: string; ok: boolean; error?: string };

// ── Control Plane → Agent ──────────────────────────────────────
export type ServerMsg =
  | { t: "registered"; nodeId: string; name: string }
  | { t: "reject"; reason: string }
  | { t: "deploy"; job: DeployJobSpec }
  | { t: "action"; action: "stop" | "restart" | "cleanup"; serviceId: string }
  | ProxyReq
  // ── Body request streaming (control plane → agent) ──
  | { t: "proxy-req-chunk"; id: string; data: string } // base64
  | { t: "proxy-req-end"; id: string }
  // ── Tunnel WebSocket (control plane → agent) ──
  | WsOpen
  | { t: "ws-send"; id: string; data: string; binary: boolean } // frame dari browser (base64)
  | { t: "ws-close"; id: string; code?: number; reason?: string };

export function encode(m: AgentMsg | ServerMsg): string {
  return JSON.stringify(m);
}

export function decode<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
