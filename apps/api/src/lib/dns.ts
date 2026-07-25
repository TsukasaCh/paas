/**
 * Lapisan DNS platform.
 *
 * Domain aplikasi kini datang dari DB (diatur admin), bukan lagi env statis —
 * env hanya jadi fallback. Bila provider Cloudflare aktif, setiap service
 * otomatis mendapat record subdomain saat dibuat dan record itu dihapus saat
 * service dihapus.
 */
import { prisma } from "@minipaas/db";
import { decryptSecret } from "@minipaas/auth";
import { upsertRecord, deleteRecord } from "./cloudflare.js";

const ENV_DOMAIN = process.env.APP_DOMAIN ?? "localhost";
const CACHE_MS = 5000;

let cache: { dns: Awaited<ReturnType<typeof load>>; at: number } | null = null;

async function load() {
  return prisma.platformDns.findUnique({ where: { id: "default" } });
}

export async function getDnsConfig() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.dns;
  const dns = await load();
  cache = { dns, at: Date.now() };
  return dns;
}

export function invalidateDnsCache(): void {
  cache = null;
}

/** Domain aktif: dari config admin bila diisi, kalau tidak pakai env. */
export async function getAppDomain(): Promise<string> {
  const dns = await getDnsConfig();
  return dns?.domain?.trim() || ENV_DOMAIN;
}

/**
 * Domain platform (dashboard & API) — dari setelan admin, fallback ke env.
 * Dipakai menyusun perintah instalasi agent & tautan yang ditampilkan.
 */
export async function getPlatformDomains(): Promise<{
  dashboard: string;
  api: string;
  agentWs: string;
  apiUrl: string;
}> {
  const dns = await getDnsConfig();
  const scheme = process.env.APP_SCHEME ?? "http";
  const secure = scheme === "https";

  const dashboard =
    dns?.dashboardDomain?.trim() ||
    stripScheme(process.env.NEXTAUTH_URL) ||
    "localhost:3000";
  const api =
    dns?.apiDomain?.trim() ||
    stripScheme(process.env.API_PUBLIC_URL) ||
    "localhost:4000";

  return {
    dashboard,
    api,
    // Bila admin mengisi domain API, turunkan URL-nya dari situ supaya
    // perintah instalasi tidak pernah bertentangan dengan setelan admin.
    apiUrl: dns?.apiDomain?.trim()
      ? `${secure ? "https" : "http"}://${api}`
      : (process.env.API_PUBLIC_URL ?? `http://${api}`),
    agentWs: dns?.apiDomain?.trim()
      ? `${secure ? "wss" : "ws"}://${api}/agent`
      : (process.env.AGENT_PUBLIC_URL ?? `ws://${api}/agent`),
  };
}

function stripScheme(url?: string): string {
  return (url ?? "").replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

/** URL publik sebuah service. */
export async function publicUrlFor(slug: string): Promise<string> {
  const domain = await getAppDomain();
  const scheme = process.env.APP_SCHEME ?? "http";
  const port = process.env.PROXY_PORT ?? "8080";
  const suffix =
    scheme === "https" || port === "80" || port === "443" ? "" : `:${port}`;
  return `${scheme}://${slug}.${domain}${suffix}`;
}

/** Token Cloudflare terdekripsi, atau null bila belum dikonfigurasi. */
async function tokenOf(dns: NonNullable<Awaited<ReturnType<typeof load>>>) {
  if (!dns.apiTokenEnc) return null;
  try {
    return decryptSecret(dns.apiTokenEnc);
  } catch {
    return null;
  }
}

/**
 * Buat record subdomain untuk service (best-effort: kegagalan DNS tidak
 * membatalkan pembuatan service, hanya dicatat).
 */
export async function ensureServiceDns(serviceId: string, slug: string): Promise<void> {
  const dns = await getDnsConfig();
  if (!dns?.enabled || dns.provider !== "cloudflare") return;
  const token = await tokenOf(dns);
  if (!token || !dns.zoneId || !dns.target) return;

  try {
    const rec = await upsertRecord(
      token,
      dns.zoneId,
      `${slug}.${dns.domain}`,
      dns.target,
      dns.proxied,
    );
    await prisma.service.update({
      where: { id: serviceId },
      data: { dnsRecordId: rec.id },
    });
    console.log(`[dns] record dibuat: ${slug}.${dns.domain} → ${dns.target}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dns] gagal membuat record ${slug}: ${msg}`);
    await prisma.platformDns
      .update({ where: { id: "default" }, data: { lastOk: false, lastError: msg } })
      .catch(() => {});
    invalidateDnsCache();
  }
}

/** Hapus record subdomain saat service dihapus (best-effort). */
export async function removeServiceDns(recordId: string | null): Promise<void> {
  if (!recordId) return;
  const dns = await getDnsConfig();
  if (!dns?.enabled || !dns.zoneId) return;
  const token = await tokenOf(dns);
  if (!token) return;
  try {
    await deleteRecord(token, dns.zoneId, recordId);
    console.log(`[dns] record dihapus: ${recordId}`);
  } catch (e) {
    console.error(`[dns] gagal menghapus record: ${e instanceof Error ? e.message : e}`);
  }
}
