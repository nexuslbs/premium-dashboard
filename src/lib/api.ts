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
  last_status: string | null;
  skills: string[];
  script: string | null;
  no_agent: boolean;
}

export interface SearchResult {
  file_path: string;
  section_title: string;
  score: number;
  content_preview: string;
  url: string;
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
}

export interface FsListResponse {
  entries: FsEntry[];
  path: string;
  error?: string;
}

export interface FsReadResponse {
  path: string;
  content: string;
  size: number;
  error?: string;
}

export interface AgentSessionSummary {
  session_id: string;
  first_event: string;
  last_event: string;
  event_count: number;
  type_count: number;
  prompt_count: number;
  response_count: number;
  tool_count: number;
  reasoning_count: number;
  delegate_count: number;
  provider: string | null;
  model: string | null;
}

export interface AgentEvent {
  id: number;
  timestamp: string;
  session_id: string;
  parent_session_id: string | null;
  turn_index: number | null;
  parent_id: number | null;
  from_entity: string;
  to_entity: string | null;
  type: string;
  subtype: string | null;
  provider: string | null;
  model: string | null;
  usage: string | null;
  content: string;
  metadata: string | null;
}

export interface AgentSummary {
  total_sessions: number;
  total_events: number;
  type_count: number;
  oldest_event: string | null;
  newest_event: string | null;
}

// ── New Agent Event List Interfaces ──

export interface AgentEventItem {
  id: number;
  timestamp: string;
  session_id: string;
  agent_role: string;
  origin: string;
  type: string;
  subtype: string | null;
  from_entity: string;
  to_entity: string;
  provider: string | null;
  model: string | null;
  content: string;
  metadata: string | null;
}

export interface AgentEventsResponse {
  events: AgentEventItem[];
  total: number;
  offset: number;
  limit: number;
}

export interface FilterOption {
  role: string;
  session_id: string;
  count: number;
}

export interface AgentFilters {
  sessions: { session_id: string; count: number }[];
  types: string[];
  subtypes: string[];
  agents: FilterOption[];
  providers: string[];
  models: string[];
}

// ── Kanban Types ──

export interface KanbanTask {
  id: string;
  title: string;
  body: string | null;
  assignee: string | null;
  status: string;
  priority: number;
  created_by: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  session_id: string | null;
  current_run_id: number | null;
  last_failure_error: string | null;
  max_runtime_seconds: number | null;
  consecutive_failures: number;
  skills: string | null;
  model_override: string | null;
}

export interface KanbanColumn {
  id: string;
  title: string;
  tasks: KanbanTask[];
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  total: number;
}

export interface KanbanTaskDetail extends KanbanTask {
  comments: KanbanComment[];
  events: KanbanEvent[];
  runs: KanbanRun[];
  links: KanbanLink[];
}

export interface KanbanComment {
  id: number;
  task_id: string;
  author: string;
  body: string;
  created_at: number;
}

export interface KanbanEvent {
  id: number;
  task_id: string;
  run_id: number | null;
  kind: string;
  payload: string | null;
  created_at: number;
}

export interface KanbanRun {
  id: number;
  task_id: string;
  profile: string | null;
  status: string;
  started_at: number;
  ended_at: number | null;
  outcome: string | null;
  summary: string | null;
  error: string | null;
}

export interface KanbanLink {
  parent_id: string;
  child_id: string;
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
