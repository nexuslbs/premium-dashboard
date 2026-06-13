import { Router } from "express";
import { request as httpRequest } from "http";

export const containersRouter = Router();

interface DockerContainer {
  Id: string;
  Names: string[];
  Image: string;
  State: string;
  Status: string;
  Ports: { PrivatePort: number; PublicPort: number; Type: string }[];
  Created: number;
}

interface DockerStats {
  name: string;
  memory_stats?: {
    usage?: number;
    limit?: number;
  };
}

const SOCKET_PATH = "/var/run/docker.sock";

function dockerApi<T>(path: string, method = "GET"): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        socketPath: SOCKET_PATH,
        path,
        method,
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

containersRouter.get("/", async (_req, res) => {
  try {
    const containers = await dockerApi<DockerContainer[]>("/containers/json?all=true");

    // Get stats for running containers
    let statsMap: Record<string, DockerStats> = {};
    try {
      const statsRaw = await dockerApi<any[]>("/containers/json?limit=999");
      const running = statsRaw.filter((c) => c.State === "running");
      for (const c of running) {
        try {
          const stat = await dockerApi<DockerStats>(`/containers/${c.Id}/stats?stream=false`);
          statsMap[c.Id] = stat;
        } catch { /* skip individual stat failures */ }
      }
    } catch { /* skip stats entirely */ }

    const result = containers.map((c) => {
      const name = (c.Names?.[0] || "").replace(/^\//, "");
      const state = c.State || "unknown";
      const status = c.Status || "";

      // Format ports
      const ports = (c.Ports || [])
        .map((p) => `${p.PublicPort || p.PrivatePort}→${p.PrivatePort}/${p.Type}`)
        .join(", ");

      // Extract uptime from status string
      const uptimeMatch = status.match(/(\d+\s+\w+\s+\d+[\d:]*)/);
      const uptime = uptimeMatch ? uptimeMatch[1] : status.slice(0, 30);

      // Parse memory from Docker stats
      const stat = statsMap[c.Id];
      let memory = "—";
      if (stat?.memory_stats?.usage && stat?.memory_stats?.limit) {
        const mb = (stat.memory_stats.usage / 1024 / 1024).toFixed(0);
        const total = (stat.memory_stats.limit / 1024 / 1024).toFixed(0);
        memory = `${mb}MB / ${total}MB`;
      }

      return { name, image: c.Image, status: c.Status, state, uptime, memory, ports };
    });

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
