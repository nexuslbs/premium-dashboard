import { Router } from "express";
import multer from "multer";
import { existsSync, mkdirSync, readdirSync } from "fs";

const UPLOADS_DIR = "/tmp/data/user/uploads";

// Ensure uploads directory exists on module init
if (!existsSync(UPLOADS_DIR)) {
  mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ── Multer setup ──

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Keep original filenames — overwrite if same name exists
    cb(null, file.originalname);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB per file
    files: 20,                   // max 20 files per request
  },
});

// ── Router ──

export const uploadsRouter = Router();

// POST /api/uploads/check — Check which filenames already exist
uploadsRouter.post("/uploads/check", (req, res) => {
  try {
    const { files } = req.body as { files?: string[] };

    if (!Array.isArray(files)) {
      res.status(400).json({ error: "Request body must include a 'files' array" });
      return;
    }

    let existingFiles: string[] = [];
    try {
      existingFiles = readdirSync(UPLOADS_DIR);
    } catch {
      // Directory might not exist yet — treat as empty
    }

    const existingSet = new Set(existingFiles);
    const existing = files.filter((f) => existingSet.has(f));

    res.json({ existing, all: files });
  } catch (err: any) {
    console.error("[uploads] Check error:", err?.message || err);
    res.status(500).json({ error: err.message || "Unknown error" });
  }
});

// POST /api/uploads — Upload files
uploadsRouter.post(
  "/uploads",
  (req, res, next) => {
    upload.array("files", 20)(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          res.status(400).json({ error: "FILE_TOO_LARGE", message: "File exceeds 50 MB limit" });
          return;
        }
        if (err.code === "LIMIT_FILE_COUNT") {
          res.status(400).json({ error: "TOO_MANY_FILES", message: "Maximum 20 files per request" });
          return;
        }
        res.status(400).json({ error: err.code, message: err.message });
        return;
      } else if (err) {
        res.status(400).json({ error: "UPLOAD_ERROR", message: err.message });
        return;
      }
      next();
    });
  },
  (req, res) => {
    try {
      const files = req.files as Express.Multer.File[];

      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files uploaded" });
        return;
      }

      const uploaded = files.map((file) => ({
        original_name: file.originalname,
        size: file.size,
        mime_type: file.mimetype,
        path: file.path,
      }));

      res.status(201).json({ files: uploaded });
    } catch (err: any) {
      console.error("[uploads] Upload error:", err?.message || err);
      res.status(500).json({ error: err.message || "Unknown error" });
    }
  }
);
