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

// Known container names that should be shown (exact matches)
const KNOWN_CONTAINERS = new Set(["premium-dashboard", "hermes"]);

function shouldShowContainer(name: string): boolean {
  // Always show containers with known names
  if (KNOWN_CONTAINERS.has(name)) return true;
  // Show containers with hyphens (multi-word compose names like hermes-loki, services-*, etc.)
  if (name.includes("-")) return true;
  // Exclude everything else (random single-word names like jolly_burnell)
  return false;
}

containersRouter.get("/", async (_req, res) => {
  try {
    const containers = await dockerApi<DockerContainer[]>("/containers/json?all=true");

    const result = containers
      .map((c) => {
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

        return { name, image: c.Image, status: c.Status, state, uptime, memory: "—", ports };
      })
      .filter((c) => shouldShowContainer(c.name));

    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
