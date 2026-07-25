// Muat .env dari root monorepo SEBELUM modul lain dievaluasi.
// Wajib di-import paling atas (lihat penjelasan di apps/api/src/load-env.ts).
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url)); // worker/src (atau dist)
config({ path: resolve(here, "../../.env") });
