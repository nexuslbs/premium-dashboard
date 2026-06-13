import { Router } from "express";

export const cronRouter = Router();

// Mock data — will connect to the Hermes cron in future versions
const MOCK_JOBS = [
  { id: "job-1", name: "memory-updater", schedule: "0 4 * * *", last_run: "2026-06-13 04:00", next_run: "2026-06-14 04:00", status: "active" },
  { id: "job-2", name: "weekly-checkpoint", schedule: "0 3 * * 0", last_run: "2026-06-07 03:00", next_run: "2026-06-14 03:00", status: "active" },
  { id: "job-3", name: "system-health", schedule: "*/30 * * * *", last_run: "2026-06-13 04:30", next_run: "2026-06-13 05:00", status: "active" },
];

cronRouter.get("/", (_req, res) => {
  res.json(MOCK_JOBS);
});
