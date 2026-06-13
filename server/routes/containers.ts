import { Router } from "express";
import { execSync } from "child_process";

export const containersRouter = Router();

interface ContainerRow {
  name: string;
  image: string;
  status: string;
  state: string;
  uptime: string;
  memory: string;
  ports: string;
}

function getContainers(): ContainerRow[] {
  try {
    const output = execSync(
      'docker ps -a --format "{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}" --no-trunc 2>/dev/null || echo ""',
      { timeout: 10 }
    ).toString().trim();

    if (!output) return [];

    return output.split("\n").map((line) => {
      const [name = "", image = "", status = "", ports = ""] = line.split("\t");
      const state = status.toLowerCase().includes("up") ? "running" :
                    status.toLowerCase().includes("exited") ? "exited" :
                    status.toLowerCase().includes("paused") ? "paused" : "unknown";

      // Extract uptime
      const uptimeMatch = status.match(/(\d+\s+\w+\s+\d+[:\d]*)/);
      const uptime = uptimeMatch ? uptimeMatch[1] : status.slice(0, 30);

      // Memory is approximated from docker stats
      let memory = "—";
      try {
        const stats = execSync(
          `docker stats --no-stream --format "{{.Name}}\t{{.MemUsage}}" 2>/dev/null | grep "^${name}\t" || true`,
          { timeout: 5 }
        ).toString().trim();
        if (stats) {
          memory = stats.split("\t")[1] || "—";
        }
      } catch { /* fallback */ }

      return { name, image, status, state, uptime, memory, ports };
    });
  } catch {
    return [];
  }
}

containersRouter.get("/", (_req, res) => {
  try {
    const containers = getContainers();
    res.json(containers);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
