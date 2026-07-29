// Katalog template siap-deploy (mirip Railway) — dikurasi di sini.
// Semua node punya Docker aktif → app user terisolasi dalam container.
// Sebagian besar memakai IMAGE resmi yang jalan standalone (jalur sama seperti
// WordPress yang sudah terbukti). Yang GITHUB dibangun otomatis oleh Nixpacks.
export interface Template {
  id: string;
  name: string;
  desc: string;
  category: "App" | "Database" | "Tool";
  source: "GITHUB" | "IMAGE";
  repoUrl?: string;
  branch?: string;
  image?: string;
  containerPort: number;
  env?: { key: string; value: string }[];
}

export const TEMPLATES: Template[] = [
  // ── App / Web ──────────────────────────────────────────────
  {
    id: "node-express",
    name: "Node · Express",
    desc: "API starter — dibangun otomatis oleh Nixpacks.",
    category: "App",
    source: "GITHUB",
    repoUrl: "https://github.com/heroku/node-js-getting-started",
    branch: "main",
    containerPort: 5000,
  },
  {
    id: "laravel",
    name: "Laravel",
    desc: "Framework PHP. Isi APP_KEY di Variables setelah deploy.",
    category: "App",
    source: "GITHUB",
    repoUrl: "https://github.com/laravel/laravel",
    branch: "master",
    containerPort: 8000,
    env: [{ key: "APP_ENV", value: "production" }],
  },
  {
    id: "nginx",
    name: "Nginx",
    desc: "Web server & reverse proxy.",
    category: "App",
    source: "IMAGE",
    image: "nginx:alpine",
    containerPort: 80,
  },
  {
    id: "ghost",
    name: "Ghost",
    desc: "Platform publikasi & blog modern.",
    category: "App",
    source: "IMAGE",
    image: "ghost:5",
    containerPort: 2368,
  },
  {
    id: "wordpress",
    name: "WordPress",
    desc: "CMS & blog paling populer.",
    category: "App",
    source: "IMAGE",
    image: "wordpress:latest",
    containerPort: 80,
  },
  {
    id: "nextcloud",
    name: "Nextcloud",
    desc: "Cloud storage & kolaborasi pribadi.",
    category: "App",
    source: "IMAGE",
    image: "nextcloud:latest",
    containerPort: 80,
  },

  // ── Database ───────────────────────────────────────────────
  {
    id: "postgres",
    name: "PostgreSQL",
    desc: "Database relasional.",
    category: "Database",
    source: "IMAGE",
    image: "postgres:16-alpine",
    containerPort: 5432,
    env: [{ key: "POSTGRES_PASSWORD", value: "secret" }],
  },
  {
    id: "mysql",
    name: "MySQL",
    desc: "Database relasional.",
    category: "Database",
    source: "IMAGE",
    image: "mysql:8",
    containerPort: 3306,
    env: [{ key: "MYSQL_ROOT_PASSWORD", value: "secret" }],
  },
  {
    id: "mariadb",
    name: "MariaDB",
    desc: "Database relasional (fork MySQL).",
    category: "Database",
    source: "IMAGE",
    image: "mariadb:11",
    containerPort: 3306,
    env: [{ key: "MARIADB_ROOT_PASSWORD", value: "secret" }],
  },
  {
    id: "mongodb",
    name: "MongoDB",
    desc: "Database dokumen NoSQL.",
    category: "Database",
    source: "IMAGE",
    image: "mongo:7",
    containerPort: 27017,
  },
  {
    id: "redis",
    name: "Redis",
    desc: "In-memory cache & queue.",
    category: "Database",
    source: "IMAGE",
    image: "redis:7-alpine",
    containerPort: 6379,
  },

  // ── Tool / Ops ─────────────────────────────────────────────
  {
    id: "grafana",
    name: "Grafana",
    desc: "Dashboard & observability. Login awal admin/admin.",
    category: "Tool",
    source: "IMAGE",
    image: "grafana/grafana:latest",
    containerPort: 3000,
  },
  {
    id: "prometheus",
    name: "Prometheus",
    desc: "Metrics & monitoring time-series.",
    category: "Tool",
    source: "IMAGE",
    image: "prom/prometheus:latest",
    containerPort: 9090,
  },
  {
    id: "metabase",
    name: "Metabase",
    desc: "BI & analitik tanpa nulis SQL.",
    category: "Tool",
    source: "IMAGE",
    image: "metabase/metabase:latest",
    containerPort: 3000,
  },
  {
    id: "uptime-kuma",
    name: "Uptime Kuma",
    desc: "Monitoring uptime & status page.",
    category: "Tool",
    source: "IMAGE",
    image: "louislam/uptime-kuma:1",
    containerPort: 3001,
  },
  {
    id: "n8n",
    name: "n8n",
    desc: "Otomasi workflow low-code.",
    category: "Tool",
    source: "IMAGE",
    image: "n8nio/n8n",
    containerPort: 5678,
  },
  {
    id: "adminer",
    name: "Adminer",
    desc: "UI ringan untuk kelola database.",
    category: "Tool",
    source: "IMAGE",
    image: "adminer:latest",
    containerPort: 8080,
  },
  {
    id: "gitea",
    name: "Gitea",
    desc: "Git self-hosted yang ringan.",
    category: "Tool",
    source: "IMAGE",
    image: "gitea/gitea:latest",
    containerPort: 3000,
  },
  {
    id: "vaultwarden",
    name: "Vaultwarden",
    desc: "Password manager (kompatibel Bitwarden).",
    category: "Tool",
    source: "IMAGE",
    image: "vaultwarden/server:latest",
    containerPort: 80,
  },
  {
    id: "code-server",
    name: "code-server",
    desc: "VS Code di browser. Password: changeme.",
    category: "Tool",
    source: "IMAGE",
    image: "codercom/code-server:latest",
    containerPort: 8080,
    env: [{ key: "PASSWORD", value: "changeme" }],
  },
];
