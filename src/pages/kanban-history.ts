import { apiGet } from "../lib/api";
import { router } from "../lib/router";

interface KanbanHistoryRow {
  id: number;
  kanban_task_id: string;
  action: string;
  initial_board: string | null;
  final_board: string | null;
  previous_values: Record<string, string> | null;
  created_at: string;
}

interface KanbanHistoryResponse {
  success: boolean;
  data: KanbanHistoryRow[];
  error?: string;
}

const ACTION_LABELS: Record<string, string> = {
  created: "Created",
  moved: "Moved",
  edited: "Edited",
  archived: "Archived",
  unarchived: "Unarchived",
  deleted: "Deleted",
};

const ACTION_COLORS: Record<string, string> = {
  created: "var(--accent-emerald)",
  moved: "var(--accent-cyan)",
  edited: "var(--accent-purple)",
  archived: "var(--accent-rose)",
  unarchived: "var(--accent-orange)",
  deleted: "var(--accent-red)",
};

export function renderKanbanHistory(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kanban History</h1>
        <p class="page-subtitle">Task activity log</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <a href="/kanban" class="back-link" id="back-to-kanban-history">← Back to Board</a>
      </div>
    </div>
    <div class="card">
      <div style="padding:0.75rem;display:flex;gap:0.5rem;flex-wrap:wrap;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <input type="text" id="history-task-filter" placeholder="Filter by Task ID" style="padding:0.375rem 0.625rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.8rem;flex:1;min-width:150px;" />
        <select id="history-action-filter" style="padding:0.375rem 0.625rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.8rem;">
          <option value="">All actions</option>
          <option value="created">Created</option>
          <option value="moved">Moved</option>
          <option value="edited">Edited</option>
          <option value="archived">Archived</option>
          <option value="unarchived">Unarchived</option>
          <option value="deleted">Deleted</option>
        </select>
        <button id="history-refresh" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">Refresh</button>
      </div>
      <div class="card-body">
        <div id="kanban-history-table">
          <div class="loading">Loading history</div>
        </div>
      </div>
    </div>
  `;

  // Wire up back button
  document.getElementById("back-to-kanban-history")?.addEventListener("click", (e) => {
    e.preventDefault();
    history.pushState({}, "", "/kanban");
    router.go("kanban");
  });

  // Wire up filter debounce
  let filterTimer: number | undefined;
  document.getElementById("history-task-filter")?.addEventListener("input", () => {
    clearTimeout(filterTimer);
    filterTimer = window.setTimeout(loadHistory, 300);
  });
  document.getElementById("history-action-filter")?.addEventListener("change", loadHistory);
  document.getElementById("history-refresh")?.addEventListener("click", loadHistory);

  // Load initial data
  loadHistory();
}

async function loadHistory(): Promise<void> {
  const tableEl = document.getElementById("kanban-history-table");
  if (!tableEl) return;

  tableEl.innerHTML = '<div class="loading">Loading history</div>';

  const taskFilter = (document.getElementById("history-task-filter") as HTMLInputElement)?.value.trim() || "";
  const actionFilter = (document.getElementById("history-action-filter") as HTMLSelectElement)?.value || "";

  try {
    // Build query params
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (taskFilter) params.set("task_id", taskFilter);
    if (actionFilter) params.set("action", actionFilter);

    const res = await fetch(`/api/kanban/history?${params.toString()}`);
    if (!res.ok) {
      tableEl.innerHTML = `<div class="error-state">HTTP ${res.status}: ${res.statusText}</div>`;
      return;
    }

    const json: KanbanHistoryResponse = await res.json();
    if (!json.success) {
      tableEl.innerHTML = `<div class="error-state">${escapeHtml(json.error || "Unknown error")}</div>`;
      return;
    }

    const rows = json.data;
    if (!rows || rows.length === 0) {
      tableEl.innerHTML = '<div class="empty-state" style="text-align:center;padding:2rem;color:var(--text-muted);">No history entries found</div>';
      return;
    }

    tableEl.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="data-table" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="text-align:left;padding:0.5rem 0.75rem;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));white-space:nowrap;">Time</th>
              <th style="text-align:left;padding:0.5rem 0.75rem;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));white-space:nowrap;">Task</th>
              <th style="text-align:left;padding:0.5rem 0.75rem;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));white-space:nowrap;">Action</th>
              <th style="text-align:left;padding:0.5rem 0.75rem;font-size:0.75rem;color:var(--text-muted);border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.08));white-space:nowrap;">Details</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r) => renderHistoryRow(r)).join("")}
          </tbody>
        </table>
      </div>
      <div style="padding:0.5rem 0.75rem;font-size:0.75rem;color:var(--text-muted);text-align:center;border-top:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        Showing ${rows.length} entries
      </div>
    `;

    // Wire up task ID clicks for navigation (only for non-deleted tasks)
    tableEl.querySelectorAll(".history-task-link").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const taskId = (e.currentTarget as HTMLElement).getAttribute("data-task-id");
        if (taskId) {
          history.pushState({}, "", `/kanban/${encodeURIComponent(taskId)}`);
          router.go(`kanban/${taskId}`);
        }
      });
    });
  } catch (e) {
    tableEl.innerHTML = `<div class="error-state">Failed to load history: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderHistoryRow(row: KanbanHistoryRow): string {
  const actionLabel = ACTION_LABELS[row.action] || row.action;
  const actionColor = ACTION_COLORS[row.action] || "var(--text-secondary)";
  const timeAgo = formatRelativeTime(new Date(row.created_at));

  let details = "";
  if (row.action === "moved" && row.initial_board && row.final_board) {
    details = `From <strong>${escapeHtml(row.initial_board)}</strong> → <strong>${escapeHtml(row.final_board)}</strong>`;
  } else if (row.previous_values) {
    const changed = Object.keys(row.previous_values);
    details = `Changed: ${changed.map((k) => `<strong>${escapeHtml(k)}</strong>`).join(", ")}`;
  }

  return `
    <tr>
      <td style="padding:0.5rem 0.75rem;font-size:0.8rem;color:var(--text-secondary);white-space:nowrap;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.04));">${escapeHtml(timeAgo)}</td>
      <td style="padding:0.5rem 0.75rem;font-size:0.8rem;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.04));">
        ${row.action === "deleted"
          ? `<span style="color:var(--text-muted);">${escapeHtml(row.kanban_task_id)}</span>`
          : `<a href="#" class="history-task-link" data-task-id="${escapeHtml(row.kanban_task_id)}" style="color:var(--accent-cyan);text-decoration:none;cursor:pointer;">${escapeHtml(row.kanban_task_id)}</a>`
        }
      </td>
      <td style="padding:0.5rem 0.75rem;font-size:0.8rem;border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.04));">
        <span style="color:${actionColor};font-weight:500;">${escapeHtml(actionLabel)}</span>
      </td>
      <td style="padding:0.5rem 0.75rem;font-size:0.8rem;color:var(--text-secondary);border-bottom:1px solid var(--glass-border,rgba(255,255,255,0.04));">
        ${details || '<em style="color:var(--text-muted);">—</em>'}
      </td>
    </tr>
  `;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}
