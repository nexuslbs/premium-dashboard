import { Router } from "express";
import { execSync } from "child_process";
import { copyFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const KANBAN_DB = "/opt/data/kanban.db";

function shellQuote(s: string): string {
  const escaped = s.replace(/["$\\`]/g, "\\$&");
  return `"${escaped}"`;
}

function queryKanban(sql: string, timeoutSec: number = 10): any[] {
  let tmpPath = "";
  try {
    // Copy to temp to bypass read-only mount issue with WAL mode
    tmpPath = join(tmpdir(), `kanban-${Date.now()}.db`);
    copyFileSync(KANBAN_DB, tmpPath);

    const cmd = [
      `sqlite3`,
      `-cmd ".timeout ${timeoutSec}000"`,
      `-json`,
      shellQuote(tmpPath),
      shellQuote(sql),
    ].join(" ");
    const output = execSync(cmd, {
      timeout: (timeoutSec + 2) * 1000,
      encoding: "utf-8",
      maxBuffer: 16 * 1024 * 1024,
      shell: "/bin/sh",
    });
    const text = (output || "").toString().trim();
    return text ? JSON.parse(text) : [];
  } catch {
    return [];
  } finally {
    try { if (tmpPath) unlinkSync(tmpPath); } catch {}
  }
}

export const kanbanRouter = Router();

// ── GET /api/kanban/board — Tasks grouped by status ──
kanbanRouter.get("/board", (_req, res) => {
  try {
    const tasks = queryKanban(`
      SELECT id, title, body, assignee, status, priority, created_by,
             created_at, started_at, completed_at, session_id,
             current_run_id, last_failure_error, max_runtime_seconds,
             consecutive_failures, skills, model_override
      FROM tasks
      ORDER BY priority DESC, created_at DESC
    `);

    // Group into columns
    const statusOrder = ["todo", "in_progress", "done", "blocked"];
    const columns = statusOrder.map((s) => ({
      id: s,
      title: s === "todo" ? "Todo" : s === "in_progress" ? "In Progress" : s === "done" ? "Done" : "Blocked",
      tasks: tasks.filter((t: any) => t.status === s),
    }));

    // Catch any tasks with unknown status
    const known = new Set(statusOrder);
    const ungrouped = tasks.filter((t: any) => !known.has(t.status));
    if (ungrouped.length > 0) {
      columns.unshift({
        id: "backlog",
        title: "Backlog",
        tasks: ungrouped,
      });
    }

    res.json({ columns, total: tasks.length });
  } catch (e: any) {
    console.error("Kanban board error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/kanban/tasks/:id — Full task detail ──
kanbanRouter.get("/tasks/:id", (req, res) => {
  try {
    const taskId = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const tasks = queryKanban(`
      SELECT id, title, body, assignee, status, priority, created_by,
             created_at, started_at, completed_at, session_id,
             current_run_id, last_failure_error, max_runtime_seconds,
             consecutive_failures, skills, model_override
      FROM tasks WHERE id = ${shellQuote(taskId)}
    `);

    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const comments = queryKanban(`
      SELECT id, task_id, author, body, created_at
      FROM task_comments WHERE task_id = ${shellQuote(taskId)}
      ORDER BY created_at ASC
    `);

    const events = queryKanban(`
      SELECT id, task_id, run_id, kind, payload, created_at
      FROM task_events WHERE task_id = ${shellQuote(taskId)}
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const runs = queryKanban(`
      SELECT id, task_id, profile, status, started_at, ended_at,
             outcome, summary, error
      FROM task_runs WHERE task_id = ${shellQuote(taskId)}
      ORDER BY started_at DESC
    `);

    const links = queryKanban(`
      SELECT parent_id, child_id FROM task_links
      WHERE parent_id = ${shellQuote(taskId)} OR child_id = ${shellQuote(taskId)}
    `);

    res.json({ ...tasks[0], comments, events, runs, links });
  } catch (e: any) {
    console.error("Kanban task detail error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
