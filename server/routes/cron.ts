import { Router } from "express";
import { readFileSync } from "fs";

export const cronRouter = Router();

cronRouter.get("/", (_req, res) => {
  try {
    const data = JSON.parse(readFileSync("/opt/data/cron/jobs.json", "utf-8"));
    const jobs = (data.jobs || []).map((job: any) => ({
      id: job.id,
      name: job.name,
      schedule: job.schedule_display || job.schedule?.display || "",
      last_run_at: job.last_run_at || null,
      next_run_at: job.next_run_at || null,
      status: job.enabled ? "active" : "paused",
      last_status: job.last_status || null,
      skills: job.skills || [],
      script: job.script || null,
      no_agent: job.no_agent || false,
    }));
    res.json(jobs);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
