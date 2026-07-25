// Muat .env dari root monorepo SEBELUM modul lain dievaluasi.
// Wajib di-import paling atas: import ESM di-hoist, jadi Prisma (@minipaas/db)
// yang membaca DATABASE_URL saat init harus melihat env yang sudah termuat.
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url)); // apps/api/src (atau dist)
config({ path: resolve(here, "../../../.env") });
