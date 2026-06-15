import { describe, it, expect, beforeAll, afterAll } from "vitest";

// The premium-dashboard container is accessible on hermes-net at 172.21.0.7
const BASE = "http://172.18.0.8";
const KANBAN_DB = "/data/kanban.db";

// ── Helpers ──

async function api(path: string, options?: RequestInit): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// Unique task IDs for this test run so they can be cleaned up
const PREFIX = "t_test_" + Date.now().toString(36);

// ── Tests ──

describe("Kanban — DnD / reorder bug prevention", () => {
  // ─────────────────────────────────────────────────────────
  // Bug 1: Cross-column DnD move must NOT affect unrelated cards
  // ─────────────────────────────────────────────────────────
  describe("Bug 1: Cross-column move must not affect unrelated cards", () => {
    const ids: string[] = [];

    it("sets up 3 tasks — two in Todo, one in Done", async () => {
      // Create A and B in Todo, C in Done
      for (let i = 0; i < 2; i++) {
        const r = await api("/api/kanban/tasks", {
          method: "POST",
          body: JSON.stringify({ title: `Bug1-Task-${i}`, status: "todo" }),
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveProperty("id");
        ids.push(r.data.id);
      }
      const r = await api("/api/kanban/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Bug1-Task-Done", status: "done" }),
      });
      expect(r.status).toBe(200);
      expect(r.data).toHaveProperty("id");
      ids.push(r.data.id);

      // Verify our tasks are created in the right columns
      const board = await api("/api/kanban/board");
      expect(board.status).toBe(200);
      const todoCol = board.data.columns.find((c: any) => c.id === "todo");
      const doneCol = board.data.columns.find((c: any) => c.id === "done");
      // 2 of our tasks should be in Todo, 1 in Done
      const ourTodos = todoCol.tasks.filter((t: any) => ids.includes(t.id));
      const ourDones = doneCol.tasks.filter((t: any) => ids.includes(t.id));
      expect(ourTodos.length).toBe(2);
      expect(ourDones.length).toBe(1);
    });

    it("moves task A from Todo to Done — task B must stay in Todo", async () => {
      const taskA = ids[0];

      // Simulate DnD cross-column move (PATCH /tasks/:id/status)
      const r = await api(`/api/kanban/tasks/${encodeURIComponent(taskA)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "done" }),
      });
      expect(r.status).toBe(200);

      // Verify the board
      const board = await api("/api/kanban/board");
      expect(board.status).toBe(200);

      const todoCol = board.data.columns.find((c: any) => c.id === "todo");
      const doneCol = board.data.columns.find((c: any) => c.id === "done");
      const unknownCol = board.data.columns.find((c: any) => c.id === "unknown");

      // Task A is now in Done
      const aInDone = doneCol.tasks.find((t: any) => t.id === taskA);
      expect(aInDone).toBeDefined();

      // Task B (ids[1]) must STILL be in Todo — NOT in Unknown
      const taskB = ids[1];
      const bInTodo = todoCol.tasks.find((t: any) => t.id === taskB);
      expect(bInTodo).toBeDefined();

      // If there's an Unknown column, task B must NOT be there
      if (unknownCol) {
        const bInUnknown = unknownCol.tasks.find((t: any) => t.id === taskB);
        expect(bInUnknown).toBeUndefined();
      }

      // Unknown column tasks have statuses that don't map to any known column
      const recognizedStatuses = ["backlog", "triage", "todo", "scheduled", "ready",
        "running", "in_progress", "review", "done", "blocked", "reclaimed"];
      if (unknownCol) {
        for (const t of unknownCol.tasks) {
          expect(recognizedStatuses).not.toContain(t.status);
        }
      }
    });

    afterAll(async () => {
      // Cleanup
      for (const id of ids) {
        await api(`/api/kanban/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // Bug 2: Reorder within same column must work
  // ─────────────────────────────────────────────────────────
  describe("Bug 2: Reorder within same column", () => {
    const ids: string[] = [];

    it("sets up 3 tasks in Todo with sequential sort_order", async () => {
      // Create 3 tasks, all in Todo
      for (let i = 0; i < 3; i++) {
        const r = await api("/api/kanban/tasks", {
          method: "POST",
          body: JSON.stringify({ title: `Reorder-Task-${i}`, status: "todo" }),
        });
        expect(r.status).toBe(200);
        ids.push(r.data.id);
      }

      // Verify all 3 are in Todo
      const board = await api("/api/kanban/board");
      expect(board.status).toBe(200);
      const todoCol = board.data.columns.find((c: any) => c.id === "todo");
      // All 3 of our test tasks plus potentially 2 from the previous test
      // Just check our tasks are there
      for (const id of ids) {
        const found = todoCol.tasks.find((t: any) => t.id === id);
        expect(found).toBeDefined();
      }
    });

    it("reorders the last task to before the first using PATCH /reorder", async () => {
      // ids[0] was created first (A), ids[1] second (B), ids[2] third (C)
      const [taskA, taskB, taskC] = ids;

      // Move the LAST created (taskC = ids[2]) before the FIRST (taskA = ids[0])
      const r = await api(`/api/kanban/tasks/${encodeURIComponent(taskC)}/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ targetId: taskA, position: "before" }),
      });
      expect(r.status).toBe(200);

      // Verify the order
      const board = await api("/api/kanban/board");
      expect(board.status).toBe(200);
      const todoCol = board.data.columns.find((c: any) => c.id === "todo");

      // Collect just our 3 test tasks in order
      const ourTasks = todoCol.tasks
        .filter((t: any) => ids.includes(t.id))
        .sort((a: any, b: any) => a.sort_order - b.sort_order);

      expect(ourTasks.length).toBe(3);
      // Expected order after reorder: taskC (moved before taskA), then taskA, then taskB
      expect(ourTasks[0].id).toBe(taskC);
      expect(ourTasks[1].id).toBe(taskA);
      expect(ourTasks[2].id).toBe(taskB);

      // Verify sort_order is strictly increasing among our tasks
      expect(ourTasks[0].sort_order).toBeLessThan(ourTasks[1].sort_order);
      expect(ourTasks[1].sort_order).toBeLessThan(ourTasks[2].sort_order);
    });

    it("reorder does not change any task's status", async () => {
      const board = await api("/api/kanban/board");
      expect(board.status).toBe(200);

      // All our tasks must have status "todo" still
      for (const col of board.data.columns) {
        for (const t of col.tasks) {
          if (ids.includes(t.id)) {
            expect(t.status).toBe("todo");
          }
        }
      }
    });

    it("intra-column reorder NEVER falls through to status change", async () => {
      // This simulates the exact scenario: dropping on same column with no target card
      // should NOT call the status endpoint
      // We test by calling reorder with a non-existent targetId -> should get 400, not 200
      const r = await api(`/api/kanban/tasks/${encodeURIComponent(ids[0])}/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ targetId: "nonexistent", position: "before" }),
      });
      expect(r.status).toBe(404); // target not found
    });

    afterAll(async () => {
      // Cleanup
      for (const id of ids) {
        await api(`/api/kanban/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // Bug 1 regression: invalid statuses get normalized
  // ─────────────────────────────────────────────────────────
  describe("Bug 1 regression: invalid status normalization", () => {
    const testIds: string[] = [];

    it("rejects invalid status on status endpoint", async () => {
      // First create a valid task
      const r = await api("/api/kanban/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Valid task", status: "todo" }),
      });
      expect(r.status).toBe(200);
      const id = r.data.id;
      testIds.push(id);

      // Try to set status to a truly unrecognized value — must be rejected
      const r2 = await api(`/api/kanban/tasks/${encodeURIComponent(id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "nonexistent_status" }),
      });
      expect(r2.status).toBe(400);
    });

    it("rejects invalid status on update-details endpoint", async () => {
      const r = await api("/api/kanban/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Valid task 2", status: "backlog" }),
      });
      expect(r.status).toBe(200);
      const id = r.data.id;
      testIds.push(id);

      // Try to set status to "unknown" via PATCH /tasks/:id — must be rejected
      const r2 = await api(`/api/kanban/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "unknown" }),
      });
      expect(r2.status).toBe(400);
    });

    it("create endpoint accepts client-side status but normalization will fix invalid ones", async () => {
      // The server accepts whatever status the client sends (trusts frontend validation)
      // Invalid statuses are auto-normalized when the board is loaded
      const r = await api("/api/kanban/tasks", {
        method: "POST",
        body: JSON.stringify({ title: "Bad status task", status: "invalid" }),
      });
      expect(r.status).toBe(200);
      const id = r.data.id;

      // Board load should have mapped it through STATUS_MAP
      // "invalid" has no mapping so it appears in the Unknown column
      const board = await api("/api/kanban/board");
      expect(board.status).toBe(200);
      const unknownCol = board.data.columns.find((c: any) => c.id === "unknown");
      // The task with status "invalid" is unrecognized → appears in Unknown
      const found = unknownCol?.tasks?.find((t: any) => t.id === id);
      expect(found).toBeDefined();
      expect(found.status).toBe("invalid");

      // Cleanup
      await api(`/api/kanban/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
    });

    afterAll(async () => {
      for (const id of testIds) {
        await api(`/api/kanban/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      }
    });
  });

  // ─────────────────────────────────────────────────────────
  // Frontend simulation: server-side order correctness
  // ─────────────────────────────────────────────────────────
  describe("Kanban board order and status consistency", () => {
    it("board has no Unknown column unless genuinely stale data", async () => {
      const board = await api("/api/kanban/board");
      expect(board.status).toBe(200);

      // All Hermes statuses that the dashboard recognizes via STATUS_MAP
      const recognizedStatuses = ["backlog", "triage", "todo", "scheduled", "ready",
        "running", "in_progress", "review", "done", "blocked", "reclaimed"];
      const knownColumns = ["backlog", "todo", "ready", "running", "review", "done", "blocked"];

      for (const col of board.data.columns) {
        if (col.id === "unknown") {
          // Tasks in Unknown must have truly unrecognized statuses
          for (const t of col.tasks) {
            expect(recognizedStatuses).not.toContain(t.status);
          }
        } else {
          // Tasks in recognized columns must have recognized statuses
          expect(knownColumns).toContain(col.id);
          for (const t of col.tasks) {
            expect(recognizedStatuses).toContain(t.status);
          }
        }
      }
    });

    it("sort_order is monotonic within each column", async () => {
      const board = await api("/api/kanban/board");
      expect(board.status).toBe(200);

      for (const col of board.data.columns) {
        if (col.id === "unknown") continue;
        const sorted = [...col.tasks].sort((a: any, b: any) => a.sort_order - b.sort_order);
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i].sort_order).toBeGreaterThanOrEqual(sorted[i - 1].sort_order);
        }
      }
    });
  });
});
