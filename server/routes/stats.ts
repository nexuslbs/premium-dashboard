import { Router } from "express";
import { execSync } from "child_process";
import { readFileSync, statfsSync } from "fs";
import { request as httpRequest } from "http";
import { queryDb } from "../db.js";

// Previous CPU counters for delta calculation
let prevCpuTotal = 0;
let prevCpuIdle = 0;

export const statsRouter = Router();

const DOCKER_SOCKET = "/var/run/docker.sock";

interface DockerContainer {
  State: string;
}

function dockerApi<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        socketPath: DOCKER_SOCKET,
        path,
        method: "GET",
        timeout: 8000,
        headers: { "Host": "localhost" },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse Docker API response: ${data.slice(0, 200)}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Docker API timeout"));
    });
    req.end();
  });
}

async function getStats() {
  // CPU — momentary usage via delta between samples
  const cpuInfo = readFileSync("/proc/stat", "utf-8");
  const cpuLine = cpuInfo.split("\n").find((l) => l.startsWith("cpu "));
  const parts = cpuLine?.split(/\s+/).slice(1).map(Number) || [0, 0, 0, 0];
  const total = parts.reduce((a, b) => a + b, 0);
  const idle = parts[3];

  let cpuUsage = 0;
  if (prevCpuTotal > 0 && total > prevCpuTotal) {
    const deltaTotal = total - prevCpuTotal;
    const deltaIdle = idle - prevCpuIdle;
    cpuUsage = deltaTotal > 0 ? ((deltaTotal - deltaIdle) / deltaTotal) * 100 : 0;
  }
  prevCpuTotal = total;
  prevCpuIdle = idle;

  const cores = readFileSync("/proc/cpuinfo", "utf-8").split("\n").filter((l) => l.startsWith("processor")).length || 1;

  // Memory
  const memInfo = readFileSync("/proc/meminfo", "utf-8");
  const memTotal = parseInt(memInfo.match(/MemTotal:\s+(\d+)/)?.[1] || "0", 10) * 1024;
  const memAvailable = parseInt(memInfo.match(/MemAvailable:\s+(\d+)/)?.[1] || "0", 10) * 1024;
  const memUsed = memTotal - memAvailable;
  const memPercent = memTotal > 0 ? (memUsed / memTotal) * 100 : 0;

  // Disk — use statfsSync (no child process), fallback to df
  let diskTotal = 0, diskUsed = 0, diskPercent = 0;
  try {
    const stat = statfsSync("/");
    const blocks = Number(stat.blocks);
    const bfree = Number(stat.bfree);
    const bsize = Number(stat.bsize);
    if (isFinite(blocks) && isFinite(bsize) && blocks > 0 && bsize > 0) {
      diskTotal = blocks * bsize;
      if (isFinite(bfree)) {
        diskUsed = (blocks - bfree) * bsize;
      }
      diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
    }
  } catch (e: any) {
    console.error("Disk stats statfsSync failed:", e?.message || e);
    // Fallback: use df -P
    try {
      const df = execSync("df -P / | tail -1", { timeout: 5, encoding: "utf-8" }).toString().trim();
      const dfParts = df.split(/\s+/);
      diskTotal = parseInt(dfParts[1] || "0", 10) * 1024;
      diskUsed = parseInt(dfParts[2] || "0", 10) * 1024;
      if (isNaN(diskTotal) || diskTotal <= 0) diskTotal = 0;
      if (isNaN(diskUsed)) diskUsed = 0;
      diskPercent = diskTotal > 0 ? (diskUsed / diskTotal) * 100 : 0;
    } catch (e2: any) {
      console.error("Disk stats df fallback failed:", e2?.message || e2);
    }
  }

  // Guard: ensure disk values are valid numbers
  if (!isFinite(diskTotal) || diskTotal <= 0) { diskTotal = 0; diskPercent = 0; }
  if (!isFinite(diskUsed)) diskUsed = 0;

  // System uptime
  const uptimeStr = readFileSync("/proc/uptime", "utf-8");
  const uptime = Math.floor(parseFloat(uptimeStr.split(" ")[0] || "0"));

  // Docker containers
  let containersRunning = 0;
  try {
    const containers = await dockerApi<DockerContainer[]>("/containers/json?limit=999");
    containersRunning = containers.filter((c) => c.State === "running").length;
  } catch (e: any) {
    console.error("Docker containers count error:", e?.message || e);
  }

  // Sessions today
  let sessionsToday = 0;
  try {
    const rows = queryDb("SELECT COUNT(*) AS count FROM sessions WHERE datetime(started_at, 'unixepoch') >= date('now')");
    sessionsToday = (rows?.[0] as any)?.count || 0;
  } catch (e: any) {
    console.error("Sessions today count error:", e?.message || e);
  }

  // Cron job count
  let cronJobs = 0;
  try {
    const data = JSON.parse(readFileSync("/opt/data/cron/jobs.json", "utf-8"));
    cronJobs = (data.jobs || []).filter((j: any) => j.enabled).length;
  } catch (e: any) {
    console.error("Cron jobs count error:", e?.message || e);
  }

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

statsRouter.get("/", async (_req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (e: any) {
    console.error("Stats endpoint error:", e?.message || e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
