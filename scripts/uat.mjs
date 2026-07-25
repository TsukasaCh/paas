/**
 * UAT otomatis Ronaldo Cloud.
 *
 * Menguji jalur nyata lewat HTTP API + DB (bukan mock), lalu mencetak
 * tabel hasil. Dipakai sebelum rilis production.
 *
 * Kredensial diambil dari environment (JANGAN di-hardcode):
 *   admin  → ADMIN_USERNAME / ADMIN_PASSWORD (dibaca dari .env otomatis)
 *   user   → UAT_USER / UAT_PASS  (akun uji yang sudah ada)
 *
 *   UAT_USER=akunuji UAT_PASS=... node scripts/uat.mjs
 */
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// Muat .env dari root repo agar ADMIN_USERNAME/ADMIN_PASSWORD tersedia.
const envFile = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// Kredensial UAT — dari env, dengan default yang JELAS bukan rahasia.
const UAT_USER = process.env.UAT_USER ?? "";
const UAT_PASS = process.env.UAT_PASS ?? "";
const ADMIN_USER = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? "";

/**
 * Request ke reverse proxy dengan Host tertentu.
 * WAJIB pakai node:http — fetch() (undici) MELARANG penyetelan header `Host`,
 * sehingga proxy tak pernah melihat subdomain dan selalu menjawab 404.
 */
function proxyGet(urlBase, host, path = "/") {
  const u = new URL(urlBase);
  return new Promise((resolve) => {
    const req = http.request(
      { host: u.hostname, port: u.port || 80, path, method: "GET", headers: { Host: host } },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", () => resolve({ status: 0, body: "" }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ status: 0, body: "" });
    });
    req.end();
  });
}
const asJson = (r) => {
  try {
    return JSON.parse(r.body);
  } catch {
    return {};
  }
};

const API = process.env.API_URL ?? "http://localhost:4000";
const WEB = process.env.WEB_URL ?? "http://localhost:3000";
const PROXY = process.env.PROXY_URL ?? "http://localhost:8080";
const DB = process.env.DATABASE_URL ?? "file:C:/Users/user/Documents/PaaS/dev.db";
const REPO = process.env.UAT_REPO ?? "C:/Users/user/Documents/PaaS/examples/hello-app";

const prisma = new PrismaClient({ datasources: { db: { url: DB } } });

const results = [];
let failed = 0;
function ok(name, detail = "") {
  results.push({ st: "PASS", name, detail });
  console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
}
function bad(name, detail) {
  results.push({ st: "FAIL", name, detail });
  failed++;
  console.log(`  ❌ ${name} — ${detail}`);
}
function skip(name, detail) {
  results.push({ st: "SKIP", name, detail });
  console.log(`  ⏭️  ${name} — ${detail}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 60_000, everyMs = 2000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (await fn()) return true;
    await sleep(everyMs);
  }
  return false;
}

// ── Auth helpers ───────────────────────────────────────────────
async function loginToken(identifier, password) {
  // Ambil CSRF + cookie dari NextAuth, lalu login credentials.
  const csrfRes = await fetch(`${WEB}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookie1 = csrfRes.headers.getSetCookie?.().join("; ") ?? "";

  const res = await fetch(`${WEB}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie1 },
    body: new URLSearchParams({ identifier, password, csrfToken, json: "true" }),
    redirect: "manual",
  });
  const cookie2 = [cookie1, ...(res.headers.getSetCookie?.() ?? [])].join("; ");

  const sess = await fetch(`${WEB}/api/auth/session`, { headers: { cookie: cookie2 } });
  const body = await sess.json();
  return body?.apiToken ?? null;
}

async function adminToken(username, password) {
  const csrfRes = await fetch(`${WEB}/api/auth/csrf`);
  const { csrfToken } = await csrfRes.json();
  const cookie1 = csrfRes.headers.getSetCookie?.().join("; ") ?? "";
  const res = await fetch(`${WEB}/api/auth/callback/admin`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie1 },
    body: new URLSearchParams({ username, password, csrfToken, json: "true" }),
    redirect: "manual",
  });
  const cookie2 = [cookie1, ...(res.headers.getSetCookie?.() ?? [])].join("; ");
  const sess = await fetch(`${WEB}/api/auth/session`, { headers: { cookie: cookie2 } });
  const b = await sess.json();
  return b?.role === "ADMIN" ? b.apiToken : null;
}

const auth = (t, json = false) => ({
  Authorization: `Bearer ${t}`,
  ...(json ? { "content-type": "application/json" } : {}),
});

// ── Test suite ─────────────────────────────────────────────────
async function main() {
  console.log("\n╔══ UAT Ronaldo Cloud ══╗\n");

  // 1. Kesehatan layanan
  console.log("▸ Infrastruktur");
  const h = await fetch(`${API}/health`).then((r) => r.status).catch(() => 0);
  h === 200 ? ok("API sehat") : bad("API sehat", `HTTP ${h}`);
  const w = await fetch(`${WEB}/login`).then((r) => r.status).catch(() => 0);
  w === 200 ? ok("Web sehat") : bad("Web sehat", `HTTP ${w}`);
  const ag = await fetch(`${API}/agent.js`).then((r) => r.status).catch(() => 0);
  ag === 200 ? ok("Bundle agent tersaji") : bad("Bundle agent tersaji", `HTTP ${ag}`);

  // 2. Auth
  console.log("\n▸ Autentikasi");
  const uname = `uat${crypto.randomBytes(3).toString("hex")}`;
  const reg = await fetch(`${WEB}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: uname, email: `${uname}@uat.local`, password: "UatPass123!" }),
  });
  reg.status === 201 ? ok("Registrasi user baru") : bad("Registrasi user baru", `HTTP ${reg.status}`);

  const dup = await fetch(`${WEB}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: uname, email: `${uname}@uat.local`, password: "UatPass123!" }),
  });
  dup.status === 409 ? ok("Tolak username/email duplikat") : bad("Tolak duplikat", `HTTP ${dup.status}`);

  const weak = await fetch(`${WEB}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "uatweak", email: "weak@uat.local", password: "123" }),
  });
  weak.status === 400 ? ok("Tolak password lemah") : bad("Tolak password lemah", `HTTP ${weak.status}`);

  const hashed = await prisma.user.findUnique({ where: { username: uname } });
  hashed?.passwordHash?.startsWith("$2")
    ? ok("Password disimpan bcrypt", "tanpa plaintext")
    : bad("Password bcrypt", "hash tidak ditemukan");

  if (!UAT_USER || !UAT_PASS) {
    console.log("\n⛔ Set UAT_USER dan UAT_PASS (akun uji) sebelum menjalankan UAT.");
    return finish();
  }
  const token = await loginToken(UAT_USER, UAT_PASS);
  token ? ok("Login user (username)") : bad("Login user", "tidak dapat token");
  // Email diambil dari DB (bukan di-hardcode) agar tetap menguji login-via-email.
  const uatUser = await prisma.user.findFirst({ where: { username: UAT_USER } });
  if (uatUser?.email) {
    const tokenEmail = await loginToken(uatUser.email, UAT_PASS);
    tokenEmail ? ok("Login user (email)") : bad("Login user via email", "gagal");
  } else {
    bad("Login user via email", "email akun uji tak ditemukan di DB");
  }
  const wrong = await loginToken(UAT_USER, UAT_PASS + "-salah");
  !wrong ? ok("Tolak password salah") : bad("Tolak password salah", "malah berhasil login");

  const admTok = await adminToken(ADMIN_USER, ADMIN_PASS);
  admTok ? ok("Login admin") : bad("Login admin", "tidak dapat token admin");
  const admWrong = await adminToken(ADMIN_USER, ADMIN_PASS + "-salah");
  !admWrong ? ok("Tolak admin password salah") : bad("Tolak admin salah", "malah berhasil");

  if (!token) {
    console.log("\n⛔ Tidak bisa lanjut tanpa token user.");
    return finish();
  }

  // 3. Otorisasi
  console.log("\n▸ Otorisasi");
  const noAuth = await fetch(`${API}/projects`).then((r) => r.status);
  noAuth === 401 ? ok("Tolak akses tanpa token") : bad("Tolak tanpa token", `HTTP ${noAuth}`);
  const userOnAdmin = await fetch(`${API}/admin/nodes`, { headers: auth(token) }).then((r) => r.status);
  userOnAdmin === 403 ? ok("User biasa ditolak di API admin") : bad("Proteksi admin", `HTTP ${userOnAdmin}`);
  if (admTok) {
    const admOk = await fetch(`${API}/admin/nodes`, { headers: auth(admTok) }).then((r) => r.status);
    admOk === 200 ? ok("Admin boleh akses API admin") : bad("Admin akses", `HTTP ${admOk}`);
  }

  // 4. Node & agent
  console.log("\n▸ Node & Agent");
  const nodes = admTok
    ? await fetch(`${API}/admin/nodes`, { headers: auth(admTok) }).then((r) => r.json())
    : [];
  const online = nodes.filter((n) => n.online);
  online.length ? ok("Ada node online", `${online.length} node`) : bad("Node online", "tidak ada");
  const n0 = online[0];
  n0?.cpuCores > 0 && n0?.memoryMb > 0
    ? ok("Agent melaporkan spesifikasi", `${n0.hostname} · ${n0.cpuCores} vCPU · ${n0.memoryMb} MB`)
    : bad("Spesifikasi agent", "tidak dilaporkan");

  // 5. Project & service
  console.log("\n▸ Project & Service");
  const proj = await fetch(`${API}/projects`, {
    method: "POST",
    headers: auth(token, true),
    body: JSON.stringify({ name: `UAT ${new Date().toISOString().slice(11, 19)}` }),
  }).then((r) => r.json());
  proj?.id ? ok("Buat project") : bad("Buat project", JSON.stringify(proj));

  const svc = await fetch(`${API}/projects/${proj.id}/services`, {
    method: "POST",
    headers: auth(token, true),
    body: JSON.stringify({
      name: "uat-app",
      type: "APP",
      source: "GITHUB",
      repoUrl: REPO,
      branch: "main",
      containerPort: 3000,
      envVars: [{ key: "GREETING", value: "UAT OK" }],
    }),
  }).then((r) => r.json());
  svc?.id ? ok("Buat service dari repo") : bad("Buat service", JSON.stringify(svc));
  svc?.slug ? ok("Slug subdomain dibuat otomatis", svc.slug) : bad("Slug", "kosong");

  // Isolasi antar-user: user lain tak boleh akses service ini
  const other = await loginToken(uname, "UatPass123!");
  if (other) {
    const forb = await fetch(`${API}/projects/services/${svc.id}`, { headers: auth(other) }).then((r) => r.status);
    forb === 403 ? ok("Isolasi antar-user (403)") : bad("Isolasi antar-user", `HTTP ${forb}`);
  } else skip("Isolasi antar-user", "gagal login user uji");

  // 6. Deploy
  console.log("\n▸ Deployment");
  await fetch(`${API}/projects/services/${svc.id}`, {
    method: "PATCH",
    headers: auth(token, true),
    body: JSON.stringify({ replicas: 2 }),
  });
  const dep = await fetch(`${API}/projects/services/${svc.id}/deploy`, {
    method: "POST",
    headers: auth(token),
  });
  dep.status === 202 ? ok("Deploy diterima (202)") : bad("Deploy", `HTTP ${dep.status}`);

  const up = await waitFor(async () => {
    const s = await prisma.service.findUnique({ where: { id: svc.id } });
    return s?.status === "RUNNING";
  }, 90_000);
  up ? ok("Service jadi RUNNING") : bad("Service RUNNING", "timeout 90s");

  const insts = await prisma.instance.findMany({
    where: { deployment: { serviceId: svc.id }, status: "RUNNING" },
    orderBy: { replicaIndex: "asc" },
  });
  insts.length === 2
    ? ok("2 replica berjalan", insts.map((i) => `#${i.replicaIndex}:${i.hostPort}`).join(" "))
    : bad("Replica", `hanya ${insts.length} berjalan`);

  // 7. Routing & load balancing
  console.log("\n▸ Domain & Load Balancing");
  const dns = await prisma.platformDns.findUnique({ where: { id: "default" } });
  const domain = dns?.domain || "localhost";
  const host = `${svc.slug}.${domain}`;
  const hits = {};
  const codes = new Set();
  for (let i = 0; i < 10; i++) {
    const r = await proxyGet(PROXY, host);
    codes.add(r.status);
    const b = asJson(r);
    if (b.port) hits[b.port] = (hits[b.port] ?? 0) + 1;
  }
  [...codes].every((c) => c === 200)
    ? ok("Akses via subdomain", host)
    : bad("Akses via subdomain", `status: ${[...codes].join(",")}`);
  Object.keys(hits).length === 2
    ? ok("Load balancing antar replica", JSON.stringify(hits))
    : bad("Load balancing", `distribusi: ${JSON.stringify(hits)}`);

  const envOk = asJson(await proxyGet(PROXY, host))?.env?.GREETING === "UAT OK";
  envOk ? ok("Environment variable ter-inject") : bad("Env var", "nilai tidak sesuai");

  const badHost = (await proxyGet(PROXY, `tidak-ada.${domain}`)).status;
  badHost === 404 ? ok("Domain tak dikenal → 404") : bad("Domain tak dikenal", `HTTP ${badHost}`);

  // 8. Metrics
  console.log("\n▸ Metrics");
  // Metrics pertama baru terkumpul setelah agent mengirim heartbeat (tiap 5s),
  // jadi TUNGGU KONDISI — bukan sleep tetap yang rapuh terhadap timing.
  await waitFor(async () => {
    const m = await fetch(`${API}/projects/services/${svc.id}/metrics`, {
      headers: auth(token),
    }).then((r) => r.json());
    return (m.replicas ?? []).filter((r) => !r.stale && r.status === "RUNNING").length === 2;
  }, 45_000, 3000);
  const met = await fetch(`${API}/projects/services/${svc.id}/metrics`, { headers: auth(token) }).then((r) => r.json());
  met?.running ? ok("Metrics tersedia") : bad("Metrics", "running=false");
  const fresh = (met.replicas ?? []).filter((r) => !r.stale && r.status === "RUNNING");
  fresh.length === 2
    ? ok("Metrics per replica dari agent", fresh.map((r) => `#${r.replicaIndex} ${r.cpu}% ${r.memoryMb}MB`).join(" · "))
    : bad("Metrics per replica", `${fresh.length}/2 segar`);

  // 9. Health check + auto-restart
  console.log("\n▸ Health Check & Auto-Heal");
  const victim = insts[1];
  try {
    execSync(
      `powershell -Command "$c=Get-NetTCPConnection -LocalPort ${victim.hostPort} -State Listen -EA SilentlyContinue; if($c){Stop-Process -Id $c.OwningProcess -Force}"`,
      { stdio: "ignore" },
    );
    ok("Replica dibunuh paksa", `#${victim.replicaIndex} :${victim.hostPort}`);
  } catch {
    bad("Membunuh replica", "gagal");
  }

  // Trafik tidak boleh error selama pemulihan
  await sleep(3000);
  let errs = 0;
  for (let i = 0; i < 10; i++) {
    const r = await proxyGet(PROXY, host);
    if (r.status !== 200) errs++;
  }
  errs === 0 ? ok("Trafik tetap 200 saat replica mati") : bad("Trafik saat replica mati", `${errs}/10 gagal`);

  const healed = await waitFor(async () => {
    const c = await prisma.instance.count({
      where: { deployment: { serviceId: svc.id }, status: "RUNNING" },
    });
    return c === 2;
  }, 60_000);
  const after = await prisma.instance.findMany({
    where: { deployment: { serviceId: svc.id } },
    orderBy: { replicaIndex: "asc" },
  });
  const restarted = after.find((i) => i.restarts > 0);
  healed
    ? ok("Auto-restart memulihkan replica", restarted ? `restarts=${restarted.restarts}` : "")
    : bad("Auto-restart", `hanya ${after.filter((i) => i.status === "RUNNING").length}/2 pulih`);

  // 10. Lifecycle
  console.log("\n▸ Lifecycle");
  const stopRes = await fetch(`${API}/projects/services/${svc.id}/stop`, { method: "POST", headers: auth(token) });
  stopRes.status === 202 ? ok("Stop diterima") : bad("Stop", `HTTP ${stopRes.status}`);
  const stopped = await waitFor(async () => {
    const s = await prisma.service.findUnique({ where: { id: svc.id } });
    return s?.status === "STOPPED";
  }, 30_000);
  stopped ? ok("Service jadi STOPPED") : bad("Service STOPPED", "timeout");

  const gone = (await proxyGet(PROXY, host)).status;
  gone === 503 ? ok("Service mati → 503 di proxy") : bad("Proxy setelah stop", `HTTP ${gone}`);

  const delRes = await fetch(`${API}/projects/services/${svc.id}`, { method: "DELETE", headers: auth(token) });
  delRes.status === 200 ? ok("Hapus service") : bad("Hapus service", `HTTP ${delRes.status}`);
  const stillThere = await prisma.service.findUnique({ where: { id: svc.id } });
  !stillThere ? ok("Service benar-benar terhapus") : bad("Hapus service", "masih ada di DB");

  // Bersihkan project & user uji
  await prisma.project.delete({ where: { id: proj.id } }).catch(() => {});
  await prisma.user.delete({ where: { username: uname } }).catch(() => {});

  finish();
}

function finish() {
  const pass = results.filter((r) => r.st === "PASS").length;
  const skipn = results.filter((r) => r.st === "SKIP").length;
  console.log("\n╔══════════════════════════════════╗");
  console.log(`  PASS ${pass} · FAIL ${failed} · SKIP ${skipn}`);
  console.log("╚══════════════════════════════════╝");
  if (failed) {
    console.log("\nYang gagal:");
    results.filter((r) => r.st === "FAIL").forEach((r) => console.log(`  • ${r.name}: ${r.detail}`));
  }
  return prisma.$disconnect().then(() => process.exit(failed ? 1 : 0));
}

main().catch(async (e) => {
  console.error("\n⛔ UAT error:", e);
  await prisma.$disconnect();
  process.exit(1);
});
