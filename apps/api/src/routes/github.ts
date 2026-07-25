// Proxy ke GitHub API memakai access token user (disimpan saat OAuth).
// Dipakai frontend untuk memilih repo & branch yang akan di-deploy.
import { Hono } from "hono";
import { prisma } from "@minipaas/db";
import { openSecret } from "@minipaas/auth";
import { requireAuth } from "../middleware/auth.js";
import type { AppEnv } from "../types.js";

export const github = new Hono<AppEnv>();

// Semua route GitHub butuh sesi user.
github.use("*", requireAuth);

async function githubToken(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.githubToken) throw new Error("GitHub token tidak tersedia");
  // Tersimpan terenkripsi at-rest → buka saat hendak dipakai.
  const token = openSecret(user.githubToken);
  if (!token) throw new Error("GitHub token tidak dapat dibuka — hubungkan ulang akun GitHub");
  return token;
}

async function gh(token: string, pathname: string) {
  const res = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "RonaldoCloud",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  return res.json();
}

// GET /github/repos — daftar repo milik user.
github.get("/repos", async (c) => {
  const userId = c.get("userId");
  const token = await githubToken(userId);
  const repos = await gh(token, "/user/repos?per_page=100&sort=updated");
  return c.json(
    (repos as any[]).map((r) => ({
      id: r.id,
      fullName: r.full_name,
      cloneUrl: r.clone_url,
      defaultBranch: r.default_branch,
      private: r.private,
    })),
  );
});

// GET /github/repos/:owner/:repo/branches — daftar branch.
github.get("/repos/:owner/:repo/branches", async (c) => {
  const userId = c.get("userId");
  const token = await githubToken(userId);
  const { owner, repo } = c.req.param();
  const branches = await gh(token, `/repos/${owner}/${repo}/branches?per_page=100`);
  return c.json((branches as any[]).map((b) => ({ name: b.name })));
});

export default github;
