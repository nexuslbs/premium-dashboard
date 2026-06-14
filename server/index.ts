import express from "express";
import { existsSync } from "fs";
import { createServer } from "http";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Routes
import { statsRouter } from "./routes/stats.js";
import { sessionsRouter } from "./routes/sessions.js";
import { containersRouter } from "./routes/containers.js";
import { cronRouter } from "./routes/cron.js";
import { searchRouter } from "./routes/search.js";
import { fsRouter } from "./routes/fs.js";
import { healthRouter } from "./routes/health.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());

  // API routes
  app.use("/api/health", healthRouter);
  app.use("/api/stats", statsRouter);
  app.use("/api/sessions", sessionsRouter);
  app.use("/api/containers", containersRouter);
  app.use("/api/cron", cronRouter);
  app.use("/api/wiki-search", searchRouter);
  app.use("/api/fs", fsRouter);

  // Serve static frontend
  const staticDir = join(__dirname, "..", "dist");
  if (existsSync(staticDir)) {
    app.use(express.static(staticDir));
    // SPA fallback
    app.get("*", (_req, res) => {
      res.sendFile(join(staticDir, "index.html"));
    });
  }

  return app;
}

const PORT = parseInt(process.env.PORT || "3001", 10);
const app = createApp();
const server = createServer(app);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Dashboard API listening on http://127.0.0.1:${PORT}`);
});
