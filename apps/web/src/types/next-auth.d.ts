// Augmentasi tipe NextAuth: session.userId / role / apiToken + JWT role.
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    userId: string;
    role: string;
    plan: string;
    apiToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    githubToken?: string;
    githubId?: number;
    githubLogin?: string;
    role?: string;
    plan?: string;
  }
}
