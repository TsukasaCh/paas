/**
 * Klien Cloudflare DNS API (v4) — dipakai membuat/menghapus subdomain service.
 *
 * Catatan desain: kita membuat SATU record per service (bukan wildcard) karena
 * Cloudflare hanya mengizinkan wildcard proxied di plan Enterprise. Dengan
 * record per subdomain, tiap app tetap bisa proxied di plan gratis.
 */
const API = "https://api.cloudflare.com/client/v4";

interface CfResult<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

async function cf<T>(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => null)) as CfResult<T> | null;
  if (!body) throw new Error(`Cloudflare: respons tidak valid (HTTP ${res.status})`);
  if (!body.success) {
    const msg = body.errors?.map((e) => `${e.code}: ${e.message}`).join("; ");
    throw new Error(msg || `Cloudflare: HTTP ${res.status}`);
  }
  return body.result;
}

/** Cek token valid & aktif. */
export async function verifyToken(token: string): Promise<void> {
  const r = await cf<{ status: string }>(token, "/user/tokens/verify");
  if (r.status !== "active") throw new Error(`Token tidak aktif (status: ${r.status})`);
}

/** Ambil nama zone; sekaligus memastikan token punya akses ke zone itu. */
export async function getZone(
  token: string,
  zoneId: string,
): Promise<{ name: string }> {
  return cf<{ name: string }>(token, `/zones/${zoneId}`);
}

export interface DnsRecord {
  id: string;
  name: string;
  type: string;
  content: string;
  proxied: boolean;
}

/** Cari record berdasarkan FQDN. */
export async function findRecord(
  token: string,
  zoneId: string,
  fqdn: string,
): Promise<DnsRecord | null> {
  const r = await cf<DnsRecord[]>(
    token,
    `/zones/${zoneId}/dns_records?name=${encodeURIComponent(fqdn)}`,
  );
  return r[0] ?? null;
}

/**
 * Buat/perbarui record untuk sebuah subdomain.
 * Tipe ditentukan otomatis: IP → A, selain itu → CNAME.
 */
export async function upsertRecord(
  token: string,
  zoneId: string,
  fqdn: string,
  target: string,
  proxied: boolean,
): Promise<DnsRecord> {
  const type = /^\d{1,3}(\.\d{1,3}){3}$/.test(target) ? "A" : "CNAME";
  const payload = JSON.stringify({ type, name: fqdn, content: target, proxied, ttl: 1 });

  const existing = await findRecord(token, zoneId, fqdn);
  if (existing) {
    return cf<DnsRecord>(token, `/zones/${zoneId}/dns_records/${existing.id}`, {
      method: "PUT",
      body: payload,
    });
  }
  return cf<DnsRecord>(token, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: payload,
  });
}

export async function deleteRecord(
  token: string,
  zoneId: string,
  recordId: string,
): Promise<void> {
  await cf(token, `/zones/${zoneId}/dns_records/${recordId}`, { method: "DELETE" });
}
