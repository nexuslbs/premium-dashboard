import { Router } from "express";
import { execSync } from "child_process";

export const sessionsRouter = Router();

sessionsRouter.get("/", (_req, res) => {
  try {
    const output = execSync(
      `sqlite3 -json /opt/data/state.db "SELECT id, COALESCE(title, 'Untitled') AS title, model, source AS provider, started_at, message_count AS turn_count, ended_at FROM sessions ORDER BY started_at DESC LIMIT 50"`,
      { timeout: 10, encoding: "utf-8" }
    );
    const rows = JSON.parse(output);
    const mapped = rows.map((row: any) => ({
      id: row.id,
      title: row.title || "Untitled",
      model: row.model,
      provider: row.provider,
      started_at: new Date(row.started_at * 1000).toISOString(),
      turn_count: row.turn_count,
      status: row.ended_at ? "completed" : "active",
    }));
    res.json(mapped);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
