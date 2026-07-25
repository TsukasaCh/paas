// Aplikasi contoh: HTTP server minimal (tanpa dependency) untuk uji deploy.
const http = require("http");

const PORT = process.env.PORT || 3000;
const GREETING = process.env.GREETING || "Halo dari Ronaldo Cloud 👋";

const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(
    JSON.stringify({
      message: GREETING,
      hostname: require("os").hostname(),
      // Port unik per replica — dipakai membuktikan load balancing.
      port: PORT,
      time: new Date().toISOString(),
      // Buktikan env var ter-inject:
      env: { GREETING: process.env.GREETING ?? null },
    }),
  );
});

server.listen(PORT, () => {
  console.log(`[hello-app] listening on :${PORT}`);
});
