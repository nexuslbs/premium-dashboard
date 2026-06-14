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
  memory_stats: {
    usage: number;
    limit: number;
    stats: { cache?: number };
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
        timeout: 5000,
        headers: { Host: "localhost" },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(
              new Error(
                `Failed to parse Docker API response: ${data.slice(0, 200)}`,
              ),
            );
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Docker API timeout"));
    });
    req.end();
  });
}

function formatMemory(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

function parseContainer(c: DockerContainer, memory: string) {
  const name = (c.Names?.[0] || "").replace(/^\//, "");
  const state = c.State || "unknown";
  const status = c.Status || "";
  const ports = (c.Ports || [])
    .map((p) => `${p.PublicPort || p.PrivatePort}→${p.PrivatePort}/${p.Type}`)
    .join(", ");
  const uptimeMatch = status.match(/(\d+\s+\w+\s+\d+[\d:]*)/);
  const uptime = uptimeMatch ? uptimeMatch[1] : status.slice(0, 30);
  return {
    name,
    image: c.Image,
    status: c.Status,
    state,
    uptime,
    memory,
    ports,
    id: c.Id,
  };
}

// Main endpoint — returns all containers with no memory (fast)
containersRouter.get("/", async (_req, res) => {
  try {
    const containers = await dockerApi<DockerContainer[]>(
      "/containers/json?all=true",
    );
    const result = containers
      .map((c) => parseContainer(c, "—"))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(result);
  } catch (e: any) {
    console.error("Containers list error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// In-memory cache for container memory values (persists between requests)
const memCache = new Map<string, { value: string; expiresAt: number }>();
const MEM_CACHE_TTL = 15_000; // 15 seconds

// Memory lazy-load endpoint — returns { "container-name": "128 MiB / 1 GiB" }
// Each container has a per-container timeout; slow containers return "—"
// Results are cached for MEM_CACHE_TTL ms so the frontend can poll freely.
containersRouter.get("/memory", async (_req, res) => {
  try {
    const containers = await dockerApi<DockerContainer[]>(
      "/containers/json?all=true",
    );
    const runningContainers = containers.filter((c) => c.State === "running");
    const now = Date.now();

    // Build response from cache + mark container IDs we need fresh data for
    const memMap: Record<string, string> = {};
    const toFetch: DockerContainer[] = [];

    for (const c of runningContainers) {
      const name = (c.Names?.[0] || "").replace(/^\//, "");
      const cached = memCache.get(name);
      if (cached && cached.expiresAt > now) {
        memMap[name] = cached.value;
      } else {
        toFetch.push(c);
      }
    }

    // Fetch only uncached containers in parallel
    if (toFetch.length > 0) {
      const memResults = await Promise.allSettled(
        toFetch.map(async (c) => {
          const name = (c.Names?.[0] || "").replace(/^\//, "");
          try {
            const stats = await Promise.race<DockerStats>([
              dockerApi<DockerStats>(`/containers/${c.Id}/stats?stream=false`),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error("timeout")), 5000),
              ),
            ]);
            const memStats = stats.memory_stats;
            if (!memStats || !memStats.usage) return { name, memory: "—" };
            const cache = memStats.stats?.cache || 0;
            const used = memStats.usage - cache;
            return {
              name,
              memory: `${formatMemory(used)} / ${formatMemory(memStats.limit)}`,
            };
          } catch {
            return { name, memory: "—" };
          }
        }),
      );

      for (const result of memResults) {
        if (result.status === "fulfilled") {
          memCache.set(result.value.name, {
            value: result.value.memory,
            expiresAt: Date.now() + MEM_CACHE_TTL,
          });
          memMap[result.value.name] = result.value.memory;
        }
      }
    }

    res.json(memMap);
  } catch (e: any) {
    console.error("Containers memory endpoint error:", e?.message || e);
    // Return stale cache if available rather than empty
    if (memCache.size > 0) {
      const stale: Record<string, string> = {};
      for (const [name, entry] of memCache) {
        stale[name] = entry.value;
      }
      res.json(stale);
    } else {
      res.json({});
    }
  }
});
