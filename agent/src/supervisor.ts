/**
 * Auto-restart replica (auto-heal) — dijalankan agent.
 *
 * Kenapa di agent, bukan control plane: agent yang tahu persis kapan proses
 * mati, punya kode yang sudah ter-clone, dan bisa menghidupkan ulang dalam
 * hitungan detik tanpa menunggu perintah dari jaringan.
 *
 * Proteksi crash-loop: aplikasi yang selalu gagal start TIDAK boleh di-restart
 * tanpa henti — itu menghabiskan CPU node dan membanjiri log. Setelah beberapa
 * percobaan beruntun dalam satu jendela waktu, agent menyerah dan melapor
 * "crash-loop" agar user memperbaiki aplikasinya.
 */
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 5; // dalam satu jendela
const WINDOW_MS = 10 * 60_000; // reset hitungan setelah stabil selama ini

interface State {
  attempts: number;
  firstAt: number;
  timer?: NodeJS.Timeout;
  gaveUp: boolean;
}

const states = new Map<string, State>();

/** Lupakan riwayat restart (dipanggil saat instance dihentikan/dihapus). */
export function forgetRestarts(instanceId: string): void {
  const s = states.get(instanceId);
  if (s?.timer) clearTimeout(s.timer);
  states.delete(instanceId);
}

/** Tandai instance sudah berjalan stabil — reset hitungan bila jendela lewat. */
export function noteHealthy(instanceId: string): void {
  const s = states.get(instanceId);
  if (s && !s.gaveUp && Date.now() - s.firstAt > WINDOW_MS) states.delete(instanceId);
}

export function hasGivenUp(instanceId: string): boolean {
  return states.get(instanceId)?.gaveUp === true;
}

/** Nomor percobaan restart yang sedang berjalan (0 bila belum pernah). */
export function currentAttempt(instanceId: string): number {
  return states.get(instanceId)?.attempts ?? 0;
}

/**
 * Jadwalkan restart. Mengembalikan info percobaan, atau null bila agent
 * memutuskan menyerah (crash-loop) / sudah ada restart terjadwal.
 */
export function scheduleRestart(
  instanceId: string,
  run: () => Promise<void>,
  onGiveUp: (attempt: number) => void,
): { attempt: number; delayMs: number } | null {
  const now = Date.now();
  let s = states.get(instanceId);
  if (!s || now - s.firstAt > WINDOW_MS) {
    s = { attempts: 0, firstAt: now, gaveUp: false };
    states.set(instanceId, s);
  }
  if (s.gaveUp || s.timer) return null;

  s.attempts++;
  if (s.attempts > MAX_ATTEMPTS) {
    s.gaveUp = true;
    onGiveUp(s.attempts - 1);
    return null;
  }

  // Backoff eksponensial: 1s, 2s, 4s, 8s, 16s (maks 30s).
  const delayMs = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (s.attempts - 1));
  s.timer = setTimeout(() => {
    const cur = states.get(instanceId);
    if (cur) cur.timer = undefined;
    void run();
  }, delayMs);

  return { attempt: s.attempts, delayMs };
}
