import { Router } from "express";
import { execSync } from "child_process";
import { readFileSync } from "fs";

export const statsRouter = Router();

function getStats() {
  // CPU
  const cpuInfo = readFileSync("/proc/stat", "utf-8");
  const cpuLine = cpuInfo.split("\n").find((l) => l.startsWith("cpu "));
  const parts = cpuLine?.split(/\s+/).slice(1).map(Number) || [0, 0, 0, 0];
  const total = parts.reduce((a, b) => a + b, 0);
  const idle = parts[3];
  const cpuUsage = total > 0 ? ((total - idle) / total) * 100 : 0;
  const cores = readFileSync("/proc/cpuinfo", "utf-8").split("\n").filter((l) => l.startsWith("processor")).length || 1;

  // Memory
  const memInfo = readFileSync("/proc/meminfo", "utf-8");
  const memTotal = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)?.[1] || "0", 10) * 1024;
  const memAvailable = parseInt(memInfo.match(/MemAvailable:\s+(\d+)/)?.[1] || "0", 10) * 1024;
  const memUsed = memTotal - memAvailable;
  const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

  // Disk
  let diskTotal = 0, diskUsed = 0, diskPercent = 0;
  try {
    const df = execSync("df -B1 / | tail -1", { timeout: 5 }).toString().trim();
    const dfParts = df.split(/\s+/);
    diskTotal = parseInt(dfParts[1] || "0", 10);
    diskUsed = parseInt(dfParts[2] || "0", 10);
    diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
  } catch { /* fallback */ }

  // System uptime
  const uptimeStr = readFileSync("/proc/uptime", "utf-8");
  const uptime = Math.floor(parseFloat(uptimeStr.split(" ")[0] || "0"));

  // Docker
  let containersRunning = 0;
  try {
    const ps = execSync("docker ps -q 2>/dev/null | wc -l", { timeout: 5 }).toString().trim();
    containersRunning = parseInt(ps, 10) || 0;
  } catch { /* fallback */ }

  // Sessions and cron are placeholders for now
  const sessionsToday = 12;
  const cronJobs = 3;

  return {
    cpu: { usage: Math.round(cpuUsage * 10) / 10, cores },
    memory: { total: memTotal, used: memUsed, percent: Math.round(memPercent * 10) / 10 },
    disk: { total: diskTotal, used: diskUsed, percent: Math.round(diskPercent * 10) / 10 },
    uptime,
    sessions_today: sessionsToday,
    containers_running: containersRunning,
    cron_jobs: cronJobs,
  };
}

statsRouter.get("/", (_req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
