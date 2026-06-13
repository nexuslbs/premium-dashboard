import { execSync } from "child_process";

const DB_PATH = "/opt/data/state.db";

/**
 * Execute a SQL query against state.db using sqlite3 CLI with retry logic.
 * Returns parsed JSON rows, or empty array on persistent failure.
 *
 * Uses the direct approach: sqlite3 -cmd ".timeout 30000" -json <path> "<sql>"
 * This avoids pipe issues and the database is already in WAL mode.
 */
export function queryDb(sql: string, timeoutSec: number = 15): any[] {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const cmd = [
        `sqlite3`,
        `-cmd ".timeout 30000"`,
        `-json`,
        shellQuote(DB_PATH),
        shellQuote(sql),
      ].join(" ");

      const output = execSync(cmd, {
        timeout: timeoutSec * 1000,
        encoding: "utf-8",
        maxBuffer: 16 * 1024 * 1024,
        shell: "/bin/sh",
      });

      const text = (output || "").toString().trim();
      return text ? JSON.parse(text) : [];
    } catch (e: any) {
      const isLast = attempt === maxAttempts;
      console.error(`queryDb attempt ${attempt}/${maxAttempts}: ${e?.message || e}`);
      if (isLast) {
        console.error(`queryDb: all ${maxAttempts} attempts failed for SQL: ${sql.slice(0, 120)}`);
        return [];
      }
      execSync(`sleep ${attempt}`, { timeout: 5 });
    }
  }
  return [];
}

/**
 * Shell-quote a string for /bin/sh.
 * Wraps in double quotes, escaping only ", $, \, and `.
 */
function shellQuote(s: string): string {
  const escaped = s.replace(/["$\\`]/g, "\\$&");
  return `"${escaped}"`;
}
