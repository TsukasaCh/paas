// Katalog template siap-deploy (mirip Railway) — dikurasi di sini.
// GitHub/Node: jalan di runtime "node" (app WAJIB baca process.env.PORT).
// Image (needsDocker): butuh node yang punya Docker aktif.
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
  /** true = perlu node ber-Docker (sumber image); false = jalan di runtime node. */
  needsDocker?: boolean;
}

export const TEMPLATES: Template[] = [
  {
    id: "node-express",
    name: "Node · Express",
    desc: "API starter — langsung jalan di runtime node.",
    category: "App",
    source: "GITHUB",
    repoUrl: "https://github.com/heroku/node-js-getting-started",
    branch: "main",
    containerPort: 5000,
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    desc: "Database relasional.",
    category: "Database",
    source: "IMAGE",
    image: "postgres:16-alpine",
    containerPort: 5432,
    env: [{ key: "POSTGRES_PASSWORD", value: "secret" }],
    needsDocker: true,
  },
  {
    id: "redis",
    name: "Redis",
    desc: "In-memory cache & queue.",
    category: "Database",
    source: "IMAGE",
    image: "redis:7-alpine",
    containerPort: 6379,
    needsDocker: true,
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
    needsDocker: true,
  },
  {
    id: "n8n",
    name: "n8n",
    desc: "Otomasi workflow low-code.",
    category: "Tool",
    source: "IMAGE",
    image: "n8nio/n8n",
    containerPort: 5678,
    needsDocker: true,
  },
  {
    id: "wordpress",
    name: "WordPress",
    desc: "CMS & blog.",
    category: "Tool",
    source: "IMAGE",
    image: "wordpress:latest",
    containerPort: 80,
    needsDocker: true,
  },
];
