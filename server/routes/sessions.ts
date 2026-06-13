import { Router } from "express";
import { execSync } from "child_process";

export const sessionsRouter = Router();

sessionsRouter.get("/", (_req, res) => {
  try {
    const output = execSync(
      `printf ".timeout 3000\\nSELECT id, COALESCE(title, 'Untitled') AS title, model, source AS provider, started_at, message_count AS turn_count, ended_at FROM sessions ORDER BY started_at DESC LIMIT 50;\\n" | sqlite3 -json /opt/data/state.db`,
      { timeout: 15, encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 }
    );
    const rows = JSON.parse(output.trim());
    const mapped = rows.map((row: any) => ({
      id: row.id,
      title: row.title || "Untitled",
      model: row.model,
      provider: row.provider,
      created_at: new Date(row.started_at * 1000).toISOString(),
      turn_count: row.turn_count,
      status: row.ended_at ? "completed" : "active",
    }));
    res.json(mapped);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// GET /api/sessions/:id/messages - fetch messages for a specific session
sessionsRouter.get("/:id/messages", (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Session ID is required" });
      return;
    }
    // Sanitize: only allow alphanumeric, underscores, hyphens
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safeId !== id) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }
    const output = execSync(
      `sqlite3 -cmd ".timeout 3000" -json /opt/data/state.db "SELECT id, session_id, role, content, tool_name, timestamp, token_count, reasoning FROM messages WHERE session_id = '${safeId}' ORDER BY timestamp ASC;"`,
      { timeout: 15, encoding: "utf-8", maxBuffer: 16 * 1024 * 1024 }
    );
    const rows = JSON.parse(output.trim());
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
