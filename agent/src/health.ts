/**
 * Health check per replica — dijalankan agent.
 *
 * Proses hidup ≠ aplikasi sehat: bisa saja hang dan tidak menerima koneksi.
 * Karena itu kita benar-benar mencoba TCP connect ke port aplikasi.
 *
 * Satu kegagalan tidak langsung dianggap mati (bisa GC pause / restart singkat);
 * baru setelah beberapa kali gagal beruntun ditandai tidak sehat, agar status
 * tidak flapping.
 */
import net from "node:net";

const FAIL_THRESHOLD = 3;
const CONNECT_TIMEOUT_MS = 2000;
/** Beri jeda setelah start sebelum mulai menilai (app perlu waktu boot). */
const GRACE_MS = 10_000;

const failures = new Map<string, number>();

export function forgetInstance(instanceId: string): void {
  failures.delete(instanceId);
}

function tcpOk(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = new net.Socket();
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.setTimeout(CONNECT_TIMEOUT_MS);
    s.once("connect", () => done(true));
    s.once("timeout", () => done(false));
    s.once("error", () => done(false));
    s.connect(port, "127.0.0.1");
  });
}

/** true = sehat. Menghitung kegagalan beruntun sebelum memvonis. */
export async function checkHealthy(
  instanceId: string,
  port: number,
  startedAt: number,
): Promise<boolean> {
  if (Date.now() - startedAt < GRACE_MS) return true; // masih masa boot

  if (await tcpOk(port)) {
    failures.delete(instanceId);
    return true;
  }
  const n = (failures.get(instanceId) ?? 0) + 1;
  failures.set(instanceId, n);
  return n < FAIL_THRESHOLD;
}
