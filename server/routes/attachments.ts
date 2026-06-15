import { Router } from "express";
import { execSync } from "child_process";
import { copyFileSync, unlinkSync, mkdirSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join, extname, resolve } from "path";
import { randomUUID } from "crypto";
import multer from "multer";

const KANBAN_DB = "/data/kanban.db";
const UPLOADS_DIR = process.env.KANBAN_UPLOADS_DIR || "/data/uploads/kanban";

// ── Unsafe file extensions ──
// Files that could be potentially dangerous — if detected, the task is moved to Blocked
const UNSAFE_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".com", ".msi", ".scr",
  ".ps1", ".psm1", ".psd1", ".vbs", ".vbe",
  ".js", ".jse", ".jar", ".dll", ".app",
  ".sh", ".bash", ".bin", ".elf", ".wasm",
  ".py", ".rb", ".pl", ".php", ".php3", ".php4", ".php5", ".phtml",
  ".swf", ".hta", ".msc", ".reg", ".scf",
  ".lnk", ".inf", ".docm", ".xlsm", ".pptm",
]);

function isUnsafeFile(originalName: string): boolean {
  const ext = extname(originalName).toLowerCase();
  return UNSAFE_EXTENSIONS.has(ext);
}

// ── DB helpers (matching kanban.ts pattern) ──

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

// ── Schema migration ──

function ensureAttachmentsSchema(): void {
  const exists = queryKanban(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='task_attachments'"
  );
  if (exists.length === 0) {
    execKanbanRaw(`
      CREATE TABLE task_attachments (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id       TEXT NOT NULL,
        original_name TEXT NOT NULL,
        stored_name   TEXT NOT NULL,
        filepath      TEXT NOT NULL,
        size          INTEGER NOT NULL,
        mime_type     TEXT NOT NULL DEFAULT 'application/octet-stream',
        is_unsafe     INTEGER NOT NULL DEFAULT 0,
        uploaded_by   TEXT NOT NULL DEFAULT 'dashboard',
        uploaded_at   INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `);
    execKanbanRaw(
      "CREATE INDEX idx_attachments_task ON task_attachments(task_id)"
    );
    console.log("[attachments] Created task_attachments table");
  }
}

// Run schema migration on load
ensureAttachmentsSchema();

// Ensure uploads directory exists
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── Multer setup ──

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase();
    const safeName = `${randomUUID()}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5,                    // max 5 files per request
  },
});

// ── Router ──

export const attachmentsRouter = Router();

// POST /api/tasks/:taskId/attachments — Upload files
attachmentsRouter.post(
  "/tasks/:taskId/attachments",
  (req, res, next) => {
    upload.array("files", 5)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        res.status(400).json({ error: err.code, message: err.message });
        return;
      } else if (err) {
        res.status(400).json({ error: "UPLOAD_ERROR", message: err.message });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    try {
      const { taskId } = req.params;
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }

      // Verify task exists
      const task = queryKanban(
        `SELECT id, status FROM tasks WHERE id = ${sqlQuote(taskId)}`
      );
      if (task.length === 0) {
        res.status(404).json({ error: "Task not found" });
        return;
      }

      let hasUnsafe = false;
      const inserted: any[] = [];

      for (const file of files) {
        const unsafe = isUnsafeFile(file.originalname) ? 1 : 0;
        if (unsafe) hasUnsafe = true;

        const filepath = resolve(file.path);

        const sql = `
          INSERT INTO task_attachments (task_id, original_name, stored_name, filepath, size, mime_type, is_unsafe, uploaded_by)
          VALUES (${sqlQuote(taskId)}, ${sqlQuote(file.originalname)}, ${sqlQuote(file.filename)}, ${sqlQuote(filepath)}, ${file.size}, ${sqlQuote(file.mimetype)}, ${unsafe}, ${sqlQuote("dashboard")})
        `;
        execKanban(sql);

        // Get the inserted attachment id
        const rows = queryKanban(
          `SELECT id FROM task_attachments ORDER BY id DESC LIMIT 1`
        );

        inserted.push({
          id: rows.length > 0 ? rows[0].id : null,
          original_name: file.originalname,
          stored_name: file.filename,
          size: file.size,
          mime_type: file.mimetype,
          is_unsafe: !!unsafe,
        });
      }

      // If any file is unsafe, move the task to "blocked" status
      if (hasUnsafe) {
        const currentStatus = task[0].status;
        if (currentStatus !== "blocked") {
          const now = Math.floor(Date.now() / 1000);
          execKanbanRaw(
            `UPDATE tasks SET status = ${sqlQuote("blocked")} WHERE id = ${sqlQuote(taskId)}`
          );

          // Add a comment/event about the blocked status
          const eventPayload = JSON.stringify({
            reason: "unsafe_attachment",
            message: "Task blocked due to potentially unsafe file upload. Review and approve before use.",
            files: files.map((f) => f.originalname),
          });
          execKanbanRaw(`
            INSERT INTO task_events (task_id, kind, payload, created_at)
            VALUES (${sqlQuote(taskId)}, 'status_blocked', ${sqlQuote(eventPayload)}, ${now})
          `);
        }
      }

      res.status(201).json({
        attachments: inserted,
        blocked: hasUnsafe,
        message: hasUnsafe
          ? "Potentially unsafe files detected. Task has been moved to Blocked status."
          : undefined,
      });
    } catch (err: any) {
      console.error("[attachments] Upload error:", err?.message || err);
      res.status(500).json({ error: err.message || "Unknown error" });
    }
  }
);

// GET /api/tasks/:taskId/attachments — List attachments for a task
attachmentsRouter.get("/tasks/:taskId/attachments", (req, res) => {
  try {
    const { taskId } = req.params;
    const rows = queryKanban(`
      SELECT id, original_name, size, mime_type, is_unsafe, uploaded_by, uploaded_at
      FROM task_attachments
      WHERE task_id = ${sqlQuote(taskId)}
      ORDER BY uploaded_at DESC
    `);
    res.json(rows);
  } catch (err: any) {
    console.error("[attachments] List error:", err?.message || err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});

// GET /api/attachments/:id/download — Download a file
attachmentsRouter.get("/attachments/:id/download", (req, res) => {
  try {
    const rows = queryKanban(
      `SELECT * FROM task_attachments WHERE id = ${Number(req.params.id)}`
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const att = rows[0] as any;
    const resolvedPath = resolve(att.filepath);
    const basePath = resolve(UPLOADS_DIR);

    // Path traversal prevention
    if (!resolvedPath.startsWith(basePath)) {
      res.status(403).json({ error: "Invalid file path" });
      return;
    }

    if (!existsSync(resolvedPath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }

    const content = readFileSync(resolvedPath);
    res.setHeader("Content-Type", att.mime_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${att.original_name}"`
    );
    res.send(content);
  } catch (err: any) {
    console.error("[attachments] Download error:", err?.message || err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});

// DELETE /api/attachments/:id — Delete an attachment
attachmentsRouter.delete("/attachments/:id", (req, res) => {
  try {
    const rows = queryKanban(
      `SELECT * FROM task_attachments WHERE id = ${Number(req.params.id)}`
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const att = rows[0] as any;

    // Delete file from disk
    try {
      if (existsSync(att.filepath)) {
        unlinkSync(att.filepath);
      }
    } catch {
      // File already missing — still OK to remove DB record
    }

    execKanbanRaw(
      `DELETE FROM task_attachments WHERE id = ${Number(req.params.id)}`
    );
    res.json({ deleted: true });
  } catch (err: any) {
    console.error("[attachments] Delete error:", err?.message || err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});

// PATCH /api/attachments/:id/safety — Override safety flag
attachmentsRouter.patch("/attachments/:id/safety", (req, res) => {
  try {
    const rows = queryKanban(
      `SELECT * FROM task_attachments WHERE id = ${Number(req.params.id)}`
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    const att = rows[0] as any;

    // Mark as safe
    execKanbanRaw(
      `UPDATE task_attachments SET is_unsafe = 0 WHERE id = ${Number(req.params.id)}`
    );

    // Optionally restore the task to a previous status
    if (req.body && req.body.restore_status) {
      const restoreStatus: string = req.body.restore_status;
      const now = Math.floor(Date.now() / 1000);
      execKanbanRaw(
        `UPDATE tasks SET status = ${sqlQuote(restoreStatus)} WHERE id = ${sqlQuote(att.task_id)}`
      );
      const eventPayload = JSON.stringify({
        reason: "safety_override",
        message: `Safety override applied. Attachment "${att.original_name}" marked safe. Task restored to "${restoreStatus}".`,
        attachment_id: att.id,
      });
      execKanbanRaw(`
        INSERT INTO task_events (task_id, kind, payload, created_at)
        VALUES (${sqlQuote(att.task_id)}, 'safety_override', ${sqlQuote(eventPayload)}, ${now})
      `);
      res.json({
        overridden: true,
        attachment_id: att.id,
        original_name: att.original_name,
        restored_to: restoreStatus,
      });
      return;
    }

    res.json({
      overridden: true,
      attachment_id: att.id,
      original_name: att.original_name,
      restored_to: null,
    });
  } catch (err: any) {
    console.error("[attachments] Safety override error:", err?.message || err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});
