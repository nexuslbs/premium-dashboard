export const API_BASE = "/api";

export interface HealthCheck {
  status: string;
  version: string;
  uptime: number;
}

export interface SystemStats {
  cpu: { usage: number; cores: number };
  memory: { total: number; used: number; percent: number };
  disk: { total: number; used: number; percent: number };
  uptime: number;
  sessions_today: number;
  containers_running: number;
  cron_jobs: number;
}

export interface Session {
  id: number;
  title: string;
  model: string;
  provider: string;
  created_at: string;
  turn_count: number;
  status: string;
}

export interface SessionMessage {
  id: number;
  session_id: string;
  role: string;
  content: string | null;
  tool_name: string | null;
  timestamp: number;
  token_count: number | null;
  reasoning: string | null;
}

export interface ContainerInfo {
  name: string;
  image: string;
  status: string;
  state: string;
  uptime: string;
  memory: string;
  ports: string;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  last_run: string;
  next_run: string;
  status: string;
}

export interface SearchResult {
  file_path: string;
  section_title: string;
  score: number;
  content_preview: string;
  url: string;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}
