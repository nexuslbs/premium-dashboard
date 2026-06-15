import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";

// The premium-dashboard container is accessible on hermes-net at 172.21.0.7
// Nginx serves on port 80, proxying /api/ to the Node server on 3001
const BASE = "http://172.18.0.8";
const DIST_DIR = resolve(__dirname, "..", "dist");

// Helper: fetch JSON and check status
async function apiFetch(path: string): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

// Helper: fetch asset with timing
async function assetFetch(path: string): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
  duration: number;
}> {
  const start = performance.now();
  const res = await fetch(`${BASE}${path}`);
  const duration = performance.now() - start;
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  const body = await res.text();
  return { status: res.status, headers, body, duration };
}

describe("Premium Dashboard — Regression Prevention Tests", () => {
  // ─────────── API ENDPOINT TESTS ───────────

  describe("GET /api/stats", () => {
    it("a) disk.percent is never 0 across 10 rapid calls", async () => {
      for (let i = 0; i < 10; i++) {
        const { data } = await apiFetch("/api/stats");
        expect(data).toHaveProperty("disk");
        expect(data.disk).toHaveProperty("percent");
        expect(data.disk.percent).toBeGreaterThan(0);
      }
    });

    it("k) stats endpoint returns sensible values for all fields", async () => {
      const { data } = await apiFetch("/api/stats");

      // cpu
      expect(data).toHaveProperty("cpu");
      expect(data.cpu).toHaveProperty("usage");
      expect(typeof data.cpu.usage).toBe("number");
      expect(data.cpu.usage).toBeGreaterThanOrEqual(0);
      expect(data.cpu.usage).toBeLessThanOrEqual(100);
      expect(data.cpu).toHaveProperty("cores");
      expect(data.cpu.cores).toBeGreaterThanOrEqual(1);

      // memory
      expect(data).toHaveProperty("memory");
      expect(data.memory).toHaveProperty("total");
      expect(data.memory.total).toBeGreaterThan(0);
      expect(data.memory).toHaveProperty("used");
      expect(data.memory.used).toBeGreaterThan(0);
      expect(data.memory).toHaveProperty("percent");
      expect(data.memory.percent).toBeGreaterThan(0);
      expect(data.memory.percent).toBeLessThanOrEqual(100);

      // disk
      expect(data).toHaveProperty("disk");
      expect(data.disk).toHaveProperty("total");
      expect(data.disk.total).toBeGreaterThan(0);
      expect(data.disk).toHaveProperty("used");
      expect(data.disk.used).toBeGreaterThan(0);
      expect(data.disk).toHaveProperty("percent");
      expect(data.disk.percent).toBeGreaterThan(0);

      // sessions_today
      expect(data).toHaveProperty("sessions_today");
      expect(typeof data.sessions_today).toBe("number");
      expect(data.sessions_today).toBeGreaterThanOrEqual(0);

      // containers_running
      expect(data).toHaveProperty("containers_running");
      expect(typeof data.containers_running).toBe("number");
      expect(data.containers_running).toBeGreaterThanOrEqual(0);
    });
  });

  describe("GET /api/sessions", () => {
    it("d) returns 200 and an array", async () => {
      const { status, data } = await apiFetch("/api/sessions");
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it("l) each session has required fields", async () => {
      const { data } = await apiFetch("/api/sessions");
      expect(Array.isArray(data)).toBe(true);
      for (const session of data) {
        expect(session).toHaveProperty("id");
        expect(typeof session.id).toBe("string");
        expect(session.id.length).toBeGreaterThan(0);

        expect(session).toHaveProperty("title");
        expect(typeof session.title).toBe("string");

        expect(session).toHaveProperty("model");
        expect(typeof session.model).toBe("string");

        expect(session).toHaveProperty("provider");
        expect(typeof session.provider).toBe("string");

        expect(session).toHaveProperty("created_at");
        expect(typeof session.created_at).toBe("string");

        expect(session).toHaveProperty("turn_count");
        expect(typeof session.turn_count).toBe("number");

        expect(session).toHaveProperty("status");
        expect(["active", "completed"]).toContain(session.status);
      }
    });
  });

  describe("GET /api/cron", () => {
    it("t) returns 200 and an array", async () => {
      const { status, data } = await apiFetch("/api/cron");
      expect(status).toBe(200);
      expect(Array.isArray(data)).toBe(true);
    });

    it("u) each cron job has required fields including new detail fields", async () => {
      const { data } = await apiFetch("/api/cron");
      expect(Array.isArray(data)).toBe(true);
      for (const job of data) {
        expect(job).toHaveProperty("id");
        expect(typeof job.id).toBe("string");
        expect(job).toHaveProperty("status");
        expect(["active", "paused"]).toContain(job.status);
        // New detail fields
        expect(job).toHaveProperty("last_status");
        expect(job).toHaveProperty("skills");
        expect(Array.isArray(job.skills)).toBe(true);
        expect(job).toHaveProperty("script");
        expect(job).toHaveProperty("no_agent");
        expect(typeof job.no_agent).toBe("boolean");
      }
    });
  });

  describe("GET /api/containers", () => {
    it("c) responds in under 500ms for all 5 rapid calls", async () => {
      for (let i = 0; i < 5; i++) {
        const start = performance.now();
        const res = await fetch(`${BASE}/api/containers`);
        const duration = performance.now() - start;
        expect(res.status).toBe(200);
        expect(duration).toBeLessThan(500);
      }
    });
  });

  describe("GET /api/containers/memory", () => {
    it("b) at least one container has real memory data (non '—')", async () => {
      const { data } = await apiFetch("/api/containers/memory");
      // data is an object mapping container names to memory strings
      expect(typeof data).toBe("object");
      const values = Object.values(data as Record<string, string>);
      const hasRealData = values.some(
        (v: string) => v !== "—" && v.length > 0
      );
      expect(hasRealData).toBe(true);
    });
  });

  // ─────────── STATIC ASSET TESTS ───────────

  describe("Built JS bundle", () => {
    // Find the hashed index.js file
    let bundlePath: string;
    let bundleContent: string;

    beforeAll(() => {
      const assetsDir = join(DIST_DIR, "assets");
      const files = readdirSync(assetsDir);
      const jsFile = files.find((f) => f.startsWith("index.") && f.endsWith(".js"));
      expect(jsFile).toBeDefined();
      bundlePath = join(assetsDir, jsFile!);
      bundleContent = readFileSync(bundlePath, "utf-8");
    });

    it("e) contains 'clickable-row' class string for clickable session rows", () => {
      expect(bundleContent).toContain("clickable-row");
    });

    it("i) does NOT contain 'loadQuickInfo' identifier (no duplicate /stats calls)", () => {
      expect(bundleContent).not.toContain("loadQuickInfo");
    });
  });

  describe("Built CSS", () => {
    let cssPath: string;
    let cssContent: string;

    beforeAll(() => {
      const assetsDir = join(DIST_DIR, "assets");
      const files = readdirSync(assetsDir);
      const cssFile = files.find((f) => f.startsWith("style.") && f.endsWith(".css"));
      expect(cssFile).toBeDefined();
      cssPath = join(assetsDir, cssFile!);
      cssContent = readFileSync(cssPath, "utf-8");
    });

    it("f) .mobile-nav has display: flex !important (always visible at bottom)", () => {
      // The .mobile-nav base rule should have display:flex!important (always visible)
      const displayFlexMatch = cssContent.match(/display:\s*flex\s*!important/g);
      expect(displayFlexMatch).not.toBeNull();
      expect(displayFlexMatch!.length).toBeGreaterThanOrEqual(1);
      // Verify it's within .mobile-nav context
      const hasMobileNavDisplayFlex =
        cssContent.includes(".mobile-nav") &&
        /\.mobile-nav[\s\S]*?display:\s*flex\s*!important/.test(cssContent);
      expect(hasMobileNavDisplayFlex).toBe(true);
    });

    it("f2) .mobile-nav has position: fixed (bottom-anchored nav bar)", () => {
      const hasMobileNavFixed =
        cssContent.includes(".mobile-nav") &&
        /\.mobile-nav[\s\S]*?position:\s*fixed/.test(cssContent);
      expect(hasMobileNavFixed).toBe(true);
    });

    it("g) .mobile-nav has flex-direction: row !important (horizontal layout)", () => {
      const flexRowMatch = cssContent.match(/flex-direction:\s*row\s*!important/g);
      expect(flexRowMatch).not.toBeNull();
      expect(flexRowMatch!.length).toBeGreaterThanOrEqual(1);
      // Verify it's within .mobile-nav context
      const hasMobileNavFlexRow =
        cssContent.includes(".mobile-nav") &&
        /\.mobile-nav[\s\S]*?flex-direction:\s*row\s*!important/.test(cssContent);
      expect(hasMobileNavFlexRow).toBe(true);
    });

    it("h) .msg-role-text has text-overflow: ellipsis (long role text truncated)", () => {
      expect(cssContent).toContain("text-overflow: ellipsis");
      const hasMsgRoleTextEllipsis =
        cssContent.includes(".msg-role-text") &&
        /\.msg-role-text[\s\S]*?text-overflow:\s*ellipsis/.test(cssContent);
      expect(hasMsgRoleTextEllipsis).toBe(true);
    });
  });

  // ─────────── CACHE HEADER TEST ───────────

  describe("Cache headers", () => {
    it("j) built JS asset has Cache-Control with no-cache or must-revalidate", async () => {
      // First load index.html from the container to find the actual deployed JS hash
      const indexRes = await fetch(`${BASE}/`);
      const indexHtml = await indexRes.text();
      const jsMatch = indexHtml.match(/\/assets\/(index\.[a-f0-9]+\.js)/);
      expect(jsMatch).not.toBeNull();
      const jsFile = jsMatch![1];

      const { headers } = await assetFetch(`/assets/${jsFile}`);
      const cc = (headers["cache-control"] || "").toLowerCase();
      const isValid = cc.includes("no-cache") || cc.includes("must-revalidate");
      expect(isValid).toBe(true);
    });
  });

  // ─────────── CONTENT-HASH FILENAME TEST ───────────

  describe("Content-hash filenames", () => {
    it("m) index.html references assets/ files with hash in filename", () => {
      const indexPath = join(DIST_DIR, "index.html");
      const html = readFileSync(indexPath, "utf-8");

      // Find all asset references in index.html
      const assetRefs = html.match(/assets\/[\w.-]+\.(js|css)/g);
      expect(assetRefs).not.toBeNull();

      // Each reference should have a hash (not just "index.js" or "style.css")
      for (const ref of assetRefs!) {
        // Valid hashed filename: e.g., index.cead0781.js or style.41b159ac.css
        const isValid = /\.(?:[0-9a-f]{8}|[0-9a-f]{16})\.(?:js|css)$/.test(ref);
        expect(isValid).toBe(true);
      }
    });
  });

  // ─────────── HTML CONTENT TESTS ───────────

  describe("Built index.html", () => {
    let html: string;

    beforeAll(() => {
      html = readFileSync(join(DIST_DIR, "index.html"), "utf-8");
    });

    it("n) includes highlight.js CDN stylesheet for syntax highlighting", () => {
      expect(html).toContain("highlight.js");
      expect(html).toContain("github-dark.min.css");
    });

    it("o) includes tailwind CSS CDN link", () => {
      expect(html).toContain("tailwindcss");
    });
  });

  // ─────────── JS BUNDLE CONTENT TESTS ───────────

  describe("JS bundle features", () => {
    let bundleContent: string;

    beforeAll(() => {
      const assetsDir = join(DIST_DIR, "assets");
      const files = readdirSync(assetsDir);
      const jsFile = files.find((f) => f.startsWith("index.") && f.endsWith(".js"));
      expect(jsFile).toBeDefined();
      bundleContent = readFileSync(join(assetsDir, jsFile!), "utf-8");
    });

    it("p) contains code-actions class for copy button + language label bar", () => {
      expect(bundleContent).toContain("code-actions");
    });

    it("q) contains highlightAuto from highlight.js (auto-detect code language)", () => {
      expect(bundleContent).toContain("highlightAuto");
    });

    it("r) contains code-copy-btn for copy-to-clipboard functionality", () => {
      expect(bundleContent).toContain("code-copy-btn");
    });

    it("s) contains cron-detail element ID for cron job detail view", () => {
      expect(bundleContent).toContain("cron-detail");
    });

    it("s2) contains back-to-cron element ID for cron back navigation", () => {
      expect(bundleContent).toContain("back-to-cron");
    });
  });
});
