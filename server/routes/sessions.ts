import { Router } from "express";

export const sessionsRouter = Router();

// Mock data — will connect to state.db in future versions
const MOCK_SESSIONS = [
  { id: 42, title: "Qdrant fastembed migration", model: "deepseek-v4-flash", provider: "opencode-go", created_at: new Date(Date.now() - 3600000).toISOString(), turn_count: 24, status: "completed" },
  { id: 41, title: "Anti-Patterns wiki update", model: "deepseek-v4-flash", provider: "opencode-go", created_at: new Date(Date.now() - 7200000).toISOString(), turn_count: 8, status: "completed" },
  { id: 40, title: "Dashboard research", model: "gemini-2.5-flash", provider: "google", created_at: new Date(Date.now() - 14400000).toISOString(), turn_count: 15, status: "completed" },
  { id: 39, title: "Hindsight disable", model: "deepseek-v4-flash", provider: "opencode-go", created_at: new Date(Date.now() - 21600000).toISOString(), turn_count: 6, status: "completed" },
  { id: 38, title: "Backup verification", model: "deepseek-v4-flash", provider: "opencode-go", created_at: new Date(Date.now() - 28800000).toISOString(), turn_count: 3, status: "completed" },
  { id: 37, title: "Wiki maintenance", model: "deepseek-v4-flash", provider: "opencode-go", created_at: new Date(Date.now() - 36000000).toISOString(), turn_count: 11, status: "completed" },
  { id: 36, title: "Container health check", model: "claude-sonnet-4", provider: "anthropic", created_at: new Date(Date.now() - 43200000).toISOString(), turn_count: 5, status: "completed" },
  { id: 35, title: "Login automation research", model: "gemini-2.5-flash", provider: "google", created_at: new Date(Date.now() - 86400000).toISOString(), turn_count: 42, status: "completed" },
  { id: 34, title: "Daily checkpoint", model: "deepseek-v4-flash", provider: "opencode-go", created_at: new Date(Date.now() - 90000000).toISOString(), turn_count: 7, status: "completed" },
  { id: 33, title: "Active session: exploring workspace", model: "deepseek-v4-flash", provider: "opencode-go", created_at: new Date(Date.now() - 95000000).toISOString(), turn_count: 18, status: "active" },
];

sessionsRouter.get("/", (_req, res) => {
  res.json(MOCK_SESSIONS);
});
