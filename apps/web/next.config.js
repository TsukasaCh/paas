// Muat .env dari root monorepo agar web (Next server) melihat env yang sama
// dengan api & worker (DATABASE_URL, AUTH_DEV, NEXTAUTH_*, dsb.).
require("dotenv").config({
  path: require("node:path").resolve(__dirname, "../../.env"),
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Paket workspace berbasis TypeScript.
  transpilePackages: ["@minipaas/db", "@minipaas/auth"],
  // Ekspos konfigurasi domain app ke sisi client.
  env: {
    NEXT_PUBLIC_APP_DOMAIN: process.env.APP_DOMAIN ?? "localhost",
    NEXT_PUBLIC_APP_SCHEME: process.env.APP_SCHEME ?? "http",
    NEXT_PUBLIC_PROXY_PORT: process.env.PROXY_PORT ?? "8080",
  },
};
module.exports = nextConfig;
