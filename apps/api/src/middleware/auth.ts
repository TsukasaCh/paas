// Middleware auth: verifikasi token internal (Bearer), set userId & role.
import { createMiddleware } from "hono/factory";
import { verifyApiToken } from "@minipaas/auth";
import type { AppEnv } from "../types.js";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return c.json({ error: "Unauthorized" }, 401);

  try {
    const payload = await verifyApiToken(token);
    c.set("userId", payload.userId);
    c.set("role", payload.role ?? "USER");
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  await next();
});

// Wajib role ADMIN (dipasang setelah requireAuth).
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get("role") !== "ADMIN") return c.json({ error: "Forbidden (admin only)" }, 403);
  await next();
});
