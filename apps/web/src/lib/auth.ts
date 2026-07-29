// NextAuth: email+password (utama), GitHub OAuth (opsional), admin terpisah.
import type { NextAuthOptions } from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@minipaas/db";
import { signApiToken, sealSecret } from "@minipaas/auth";

const ADMIN_USER = process.env.ADMIN_USERNAME ?? "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD ?? "admin123";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma as any),
  pages: { signIn: "/login" },
  providers: [
    // Login utama: username ATAU email + password.
    Credentials({
      id: "credentials",
      name: "Akun",
      credentials: {
        identifier: { label: "Username atau email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const id = creds?.identifier?.trim();
        if (!id || !creds?.password) return null;
        const user = await prisma.user.findFirst({
          where: { OR: [{ username: id }, { email: id.toLowerCase() }] },
        });
        if (!user?.passwordHash) return null;
        const ok = await bcrypt.compare(creds.password, user.passwordHash);
        if (!ok) return null;
        // Akun disuspend/banned tidak boleh masuk.
        if (user.status !== "ACTIVE") {
          throw new Error(
            user.status === "BANNED"
              ? "Akun Anda diblokir dari platform."
              : "Akun Anda sedang disuspend.",
          );
        }
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          plan: user.plan,
        } as any;
      },
    }),

    // Opsional: GitHub OAuth (dipakai juga untuk integrasi repo privat).
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      authorization: { params: { scope: "read:user user:email repo" } },
    }),

    // Operator (terpisah dari user).
    Credentials({
      id: "admin",
      name: "Operator",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (creds?.username !== ADMIN_USER || creds?.password !== ADMIN_PASS) {
          return null;
        }
        const a = await prisma.user.upsert({
          where: { email: "admin@ronaldocloud.id" },
          update: { role: "ADMIN" },
          create: { email: "admin@ronaldocloud.id", name: "Administrator", role: "ADMIN" },
        });
        return { id: a.id, name: a.name, email: a.email, role: "ADMIN" } as any;
      },
    }),
  ],
  callbacks: {
    // Blokir akun non-aktif untuk SEMUA provider (mis. GitHub OAuth), sebagai
    // jaring pengaman selain cek di authorize credentials.
    async signIn({ user }) {
      const uid = (user as any)?.id;
      if (!uid) return true;
      const u = await prisma.user.findUnique({
        where: { id: uid },
        select: { status: true },
      });
      if (u && u.status !== "ACTIVE") return "/login?error=blocked";
      return true;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.access_token) token.githubToken = account.access_token;
      if (profile) {
        token.githubId = (profile as any).id;
        token.githubLogin = (profile as any).login;
      }
      if (user) {
        token.role = (user as any).role ?? "USER";
        token.plan = (user as any).plan ?? "FREE";
      }
      if (account?.access_token && token.sub) {
        await prisma.user
          .update({
            where: { id: token.sub },
            data: {
              // Token GitHub = kredensial akses repo user → simpan terenkripsi.
              githubToken: sealSecret(account.access_token),
              githubId: (profile as any)?.id,
              githubLogin: (profile as any)?.login,
            },
          })
          .catch(() => {});
      }
      return token;
    },
    async session({ session, token }) {
      session.userId = token.sub!;
      session.role = (token.role as string) ?? "USER";
      session.plan = (token.plan as string) ?? "FREE";
      session.apiToken = await signApiToken({
        userId: token.sub!,
        login: token.githubLogin as string | undefined,
        role: (token.role as string) ?? "USER",
      });
      return session;
    },
  },
  // JWT disimpan di cookie persisten → tetap login walau tab/browser ditutup.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 hari

};
