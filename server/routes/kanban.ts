import { Router } from "express";
import { execSync } from "child_process";
import { copyFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const KANBAN_DB = "/data/kanban.db";

function shellQuote(s: string): string {
  const escaped = s.replace(/["\\$\\`]/g, "\\$&");
  return `"${escaped}"`;
}

function sqlQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
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

function execKanban(sql: string, timeoutSec: number = 10): void {
  const cmd = [
    `sqlite3`,
    `-cmd ".timeout ${timeoutSec}000"`,
    shellQuote(KANBAN_DB),
    shellQuote(sql),
  ].join(" ");
  execSync(cmd, {
    timeout: (timeoutSec + 2) * 1000,
    encoding: "utf-8",
    shell: "/bin/sh",
  });
}

function execKanbanRaw(sql: string): void {
  const cmd = [
    `sqlite3`,
    shellQuote(KANBAN_DB),
    shellQuote(sql),
  ].join(" ");
  execSync(cmd, { encoding: "utf-8", shell: "/bin/sh", timeout: 5000 });
}

export const kanbanRouter = Router();

// Run schema migration: add sort_order column if missing
try {
  execKanbanRaw("ALTER TABLE tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;");
} catch {} // Ignore if column already exists

// ── All statuses the dashboard can display, mapped to column IDs ──
// Hermes uses: triage, back log, todo, scheduled, ready, running, review, reclaimed, done, blocked
const STATUS_MAP: Record<string, { column: string; title: string; order: number }> = {
  "backlog":     { column: "backlog",     title: "Backlog",     order: 0 },
  "triage":      { column: "backlog",     title: "Backlog",     order: 0 },
  "todo":        { column: "todo",        title: "Todo",        order: 1 },
  "scheduled":   { column: "todo",        title: "Todo",        order: 1 },
  "ready":       { column: "ready",       title: "Ready",       order: 2 },
  "running":     { column: "running",     title: "In Progress", order: 3 },
  "in_progress": { column: "running",     title: "In Progress", order: 3 },
  "review":      { column: "review",      title: "Review",      order: 4 },
  "done":        { column: "done",        title: "Done",        order: 5 },
  "blocked":     { column: "blocked",     title: "Blocked",     order: 6 },
  "reclaimed":   { column: "unknown",     title: "Unknown",     order: 7 },
};

function lookupStatus(rawStatus: string): { column: string; title: string } {
  const entry = STATUS_MAP[rawStatus];
  if (entry) return { column: entry.column, title: entry.title };
  return { column: "unknown", title: "Unknown" };
}

// ── Column display order (used when rendering columns) ──
const COLUMN_ORDER = [
  { id: "backlog", title: "Backlog" },
  { id: "todo",    title: "Todo" },
  { id: "ready",   title: "Ready" },
  { id: "running", title: "In Progress" },
  { id: "review",  title: "Review" },
  { id: "done",    title: "Done" },
  { id: "blocked", title: "Blocked" },
  { id: "unknown", title: "Unknown" },
];

// ── Statuses users can move tasks to via the Move dropdown ──
const MOVEABLE_STATUSES = ["backlog", "todo", "ready", "running", "review", "done", "blocked"];
const MOVEABLE_STATUS_SET = new Set(MOVEABLE_STATUSES);

// ── GET /api/kanban/board — Tasks grouped by status ──
kanbanRouter.get("/board", (_req, res) => {
  try {
    const tasks = queryKanban(`
      SELECT id, title, body, assignee, status, priority, created_by,
             created_at, started_at, completed_at, session_id,
             current_run_id, last_failure_error, max_runtime_seconds,
             consecutive_failures, skills, model_override,
             sort_order
      FROM tasks
      WHERE status != 'archived'
      ORDER BY sort_order ASC, priority DESC, created_at DESC
    `);

    // Group tasks by their display column using the STATUS_MAP
    const columns = COLUMN_ORDER.map((col) => ({
      id: col.id,
      title: col.title,
      tasks: tasks.filter((t: any) => lookupStatus(t.status).column === col.id),
    }));

    // Remove Unknown column if empty, keep all others (even empty) for stable layout
    const filtered = columns.filter((c) => c.id !== "unknown" || c.tasks.length > 0);

    res.json({ columns: filtered, total: tasks.length });
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
             consecutive_failures, skills, model_override,
             sort_order
      FROM tasks WHERE id = ${sqlQuote(taskId)}
    `);

    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const comments = queryKanban(`
      SELECT id, task_id, author, body, created_at
      FROM task_comments WHERE task_id = ${sqlQuote(taskId)}
      ORDER BY created_at ASC
    `);

    const events = queryKanban(`
      SELECT id, task_id, run_id, kind, payload, created_at
      FROM task_events WHERE task_id = ${sqlQuote(taskId)}
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const runs = queryKanban(`
      SELECT id, task_id, profile, status, started_at, ended_at,
             outcome, summary, error
      FROM task_runs WHERE task_id = ${sqlQuote(taskId)}
      ORDER BY started_at DESC
    `);

    const links = queryKanban(`
      SELECT parent_id, child_id FROM task_links
      WHERE parent_id = ${sqlQuote(taskId)} OR child_id = ${sqlQuote(taskId)}
    `);

    res.json({ ...tasks[0], comments, events, runs, links });
  } catch (e: any) {
    console.error("Kanban task detail error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── POST /api/kanban/tasks — Create task ──
kanbanRouter.post("/tasks", (req, res) => {
  try {
    const { title, body, assignee, priority, skills, model_override, status } = req.body;
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const id = "t_" + randomBytes(4).toString("hex");
    const now = Math.floor(Date.now() / 1000);
    const taskStatus = status || "backlog";
    const taskPriority = priority != null ? priority : 0;

    // Get next sort_order for this status
    const maxTasks = queryKanban(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE status = ${sqlQuote(taskStatus)}`);
    const sortOrder = maxTasks.length > 0 ? maxTasks[0].next_order : 0;

    const sql = `
      INSERT INTO tasks (id, title, body, assignee, status, priority, created_by, created_at, skills, model_override, sort_order)
      VALUES (
        ${sqlQuote(id)},
        ${sqlQuote(title.trim())},
        ${body != null ? sqlQuote(body) : "NULL"},
        ${assignee != null ? sqlQuote(assignee) : "NULL"},
        ${sqlQuote(taskStatus)},
        ${taskPriority},
        ${sqlQuote("dashboard")},
        ${now},
        ${skills != null ? sqlQuote(JSON.stringify(skills)) : "NULL"},
        ${model_override != null ? sqlQuote(model_override) : "NULL"},
        ${sortOrder}
      )
    `;

    execKanban(sql);
    res.json({ success: true, id });
  } catch (e: any) {
    console.error("Kanban create task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/kanban/tasks/:id/status — Move task between columns ──
kanbanRouter.patch("/tasks/:id/status", (req, res) => {
  try {
    const rawId = req.params.id;
    if (!/^[a-zA-Z0-9_-]+$/.test(rawId)) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }
    const taskId = rawId;

    const { status } = req.body;
    if (!MOVEABLE_STATUS_SET.has(status)) {
      res.status(400).json({ error: `Status must be one of: ${MOVEABLE_STATUSES.join(", ")}` });
      return;
    }

    // Get current task to check old status
    const tasks = queryKanban(`SELECT status FROM tasks WHERE id = ${sqlQuote(taskId)}`);
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const oldStatus = tasks[0].status;
    const now = Math.floor(Date.now() / 1000);

    // Get next sort_order in the new column (goes to the end)
    const maxNew = queryKanban(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM tasks WHERE status = ${sqlQuote(status)}`);
    const newOrder = maxNew.length > 0 ? maxNew[0].next_order : 0;

    // Build SET clause
    const setClauses = [`status = ${sqlQuote(status)}`, `sort_order = ${newOrder}`];

    // If moving to "done" and wasn't done before, set completed_at
    if (status === "done" && oldStatus !== "done") {
      setClauses.push(`completed_at = ${now}`);
    }

    // If moving to "in_progress" and wasn't in_progress before, set started_at
    if (status === "in_progress" && oldStatus !== "in_progress") {
      setClauses.push(`started_at = ${now}`);
    }

    const sql = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ${sqlQuote(taskId)}`;
    execKanban(sql);
    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban update status error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/kanban/tasks/:id/reorder — Reorder task within a column ──
kanbanRouter.patch("/tasks/:id/reorder", (req, res) => {
  try {
    const rawId = req.params.id;
    if (!/^[a-zA-Z0-9_-]+$/.test(rawId)) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }
    const { targetId, position } = req.body; // targetId: string, position: "before" | "after"
    if (!targetId || !position) {
      res.status(400).json({ error: "targetId and position required" });
      return;
    }

    // Get current sort_order of the dragged task
    const dragTask = queryKanban(`SELECT status, sort_order FROM tasks WHERE id = ${sqlQuote(rawId)}`);
    if (dragTask.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const targetTask = queryKanban(`SELECT sort_order FROM tasks WHERE id = ${sqlQuote(targetId)}`);
    if (targetTask.length === 0) {
      res.status(404).json({ error: "Target task not found" });
      return;
    }

    const targetOrder = targetTask[0].sort_order;
    const newOrder = position === "before" ? targetOrder : targetOrder + 1;

    // Shift other tasks in the same column to make room
    execKanbanRaw(`UPDATE tasks SET sort_order = sort_order + 1 WHERE status = ${sqlQuote(dragTask[0].status)} AND sort_order >= ${newOrder} AND id != ${sqlQuote(rawId)}`);

    // Update the dragged task
    execKanbanRaw(`UPDATE tasks SET sort_order = ${newOrder} WHERE id = ${sqlQuote(rawId)}`);

    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban reorder error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/kanban/tasks/:id — Update task details ──
kanbanRouter.patch("/tasks/:id", (req, res) => {
  try {
    const taskId = req.params.id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    // Check task exists
    const tasks = queryKanban(`SELECT id FROM tasks WHERE id = ${sqlQuote(taskId)}`);
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const { title, body, assignee, priority, skills, model_override, status } = req.body;
    const setClauses: string[] = [];

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        res.status(400).json({ error: "Title cannot be empty" });
        return;
      }
      setClauses.push(`title = ${sqlQuote(title.trim())}`);
    }
    if (body !== undefined) {
      setClauses.push(`body = ${sqlQuote(body)}`);
    }
    if (assignee !== undefined) {
      setClauses.push(`assignee = ${sqlQuote(assignee)}`);
    }
    if (priority !== undefined) {
      setClauses.push(`priority = ${priority}`);
    }
    if (skills !== undefined) {
      setClauses.push(`skills = ${sqlQuote(JSON.stringify(skills))}`);
    }
    if (model_override !== undefined) {
      setClauses.push(`model_override = ${sqlQuote(model_override)}`);
    }
    if (status !== undefined) {
      if (!MOVEABLE_STATUS_SET.has(status)) {
        res.status(400).json({ error: `Status must be one of: ${MOVEABLE_STATUSES.join(", ")}` });
        return;
      }
      setClauses.push(`status = ${sqlQuote(status)}`);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const sql = `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ${sqlQuote(taskId)}`;
    execKanban(sql);
    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban update task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── DELETE /api/kanban/tasks/:id — Delete task and related records ──
kanbanRouter.delete("/tasks/:id", (req, res) => {
  try {
    const rawId = req.params.id;
    if (!/^[a-zA-Z0-9_-]+$/.test(rawId)) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }
    const taskId = rawId;

    // Check task exists
    const tasks = queryKanban(`SELECT id FROM tasks WHERE id = ${sqlQuote(taskId)}`);
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const quotedId = sqlQuote(taskId);
    const sql = `
      DELETE FROM task_links WHERE parent_id = ${quotedId} OR child_id = ${quotedId};
      DELETE FROM task_events WHERE task_id = ${quotedId};
      DELETE FROM task_runs WHERE task_id = ${quotedId};
      DELETE FROM task_comments WHERE task_id = ${quotedId};
      DELETE FROM tasks WHERE id = ${quotedId}
    `;

    execKanban(sql);
    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban delete task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
