import { Router } from "express";
import { queryDb } from "../db.js";

export const sessionsRouter = Router();

sessionsRouter.get("/", (_req, res) => {
  try {
    const rows = queryDb(
      `SELECT id, COALESCE(title, 'Untitled') AS title, model, source AS provider, started_at, message_count AS turn_count, ended_at FROM sessions ORDER BY started_at DESC LIMIT 50`
    );
    const mapped = (rows || []).map((row: any) => ({
      id: row.id,
      title: row.title || "Untitled",
      model: row.model,
      provider: row.provider,
      created_at: new Date((row.started_at || 0) * 1000).toISOString(),
      turn_count: row.turn_count,
      status: row.ended_at ? "completed" : "active",
    }));
    res.json(mapped);
  } catch (e: any) {
    console.error("Sessions list error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// GET /api/sessions/:id/messages — fetch messages for a specific session
sessionsRouter.get("/:id/messages", (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ error: "Session ID is required" });
      return;
    }
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safeId !== id) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }
    const rows = queryDb(
      `SELECT id, session_id, role, content, tool_name, timestamp, token_count, reasoning FROM messages WHERE session_id = '${safeId.replace(/'/g, "''")}' ORDER BY timestamp ASC`
    );
    res.json(rows || []);
  } catch (e: any) {
    console.error("Session messages error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
