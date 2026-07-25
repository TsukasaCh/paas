// Zustand store untuk state client dashboard: daftar project + aksi.
// Semua request ke backend menyertakan Authorization: Bearer <apiToken>.
import { create } from "zustand";

export type ServiceStatus =
  | "IDLE"
  | "DEPLOYING"
  | "RUNNING"
  | "FAILED"
  | "STOPPED";

export interface Service {
  id: string;
  name: string;
  type: "APP" | "DATABASE";
  status: ServiceStatus;
  repoFullName?: string;
  branch?: string;
  replicas?: number;
  posX?: number;
  posY?: number;
  deployments?: { id: string; status: string }[];
}

export interface Project {
  id: string;
  name: string;
  services: Service[];
}

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function authHeaders(token: string, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

interface ProjectState {
  projects: Project[];
  loading: boolean;
  fetchProjects: (token: string) => Promise<void>;
  createProject: (token: string, name: string) => Promise<void>;
  deployService: (token: string, serviceId: string) => Promise<string | null>;
  // Update status service secara optimistik (dipakai saat polling/SSE).
  setServiceStatus: (serviceId: string, status: ServiceStatus) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,

  async fetchProjects(token) {
    set({ loading: true });
    const res = await fetch(`${API}/projects`, { headers: authHeaders(token) });
    if (!res.ok) {
      set({ loading: false });
      return;
    }
    const projects = await res.json();
    set({ projects, loading: false });
  },

  async createProject(token, name) {
    await fetch(`${API}/projects`, {
      method: "POST",
      headers: authHeaders(token, true),
      body: JSON.stringify({ name }),
    });
    await get().fetchProjects(token);
  },

  async deployService(token, serviceId) {
    const res = await fetch(`${API}/projects/services/${serviceId}/deploy`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (!res.ok) {
      let msg = `Deploy gagal (${res.status})`;
      try {
        msg = (await res.json()).error ?? msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    get().setServiceStatus(serviceId, "DEPLOYING");
    const deployment = await res.json();
    return deployment.id as string;
  },

  setServiceStatus(serviceId, status) {
    set((state) => ({
      projects: state.projects.map((p) => ({
        ...p,
        services: p.services.map((s) =>
          s.id === serviceId ? { ...s, status } : s,
        ),
      })),
    }));
  },
}));
