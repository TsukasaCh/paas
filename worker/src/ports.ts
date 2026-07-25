// Alokasi port host bebas dalam rentang yang dikonfigurasi (dipakai semua runtime).
import net from "node:net";

const PORT_START = Number(process.env.PORT_RANGE_START ?? 20000);
const PORT_END = Number(process.env.PORT_RANGE_END ?? 30000);

export async function allocateFreePort(): Promise<number> {
  for (let i = 0; i < 100; i++) {
    const candidate =
      PORT_START + Math.floor(Math.random() * (PORT_END - PORT_START));
    if (await isPortFree(candidate)) return candidate;
  }
  throw new Error("Tidak menemukan port bebas dalam rentang yang dikonfigurasi");
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "0.0.0.0");
  });
}
