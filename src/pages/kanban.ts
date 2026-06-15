import { apiGet, type KanbanBoard, type KanbanTask, type KanbanTaskDetail } from "../lib/api";
import { router } from "../lib/router";

export function renderKanban(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kanban</h1>
        <p class="page-subtitle">Task board</p>
      </div>
      <div class="kanban-summary" id="kanban-summary"></div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div class="loading">Loading board</div>
    </div>
  `;
  loadBoard();
}

async function loadBoard(): Promise<void> {
  const boardEl = document.getElementById("kanban-board")!;
  const summaryEl = document.getElementById("kanban-summary")!;
  try {
    const board = await apiGet<KanbanBoard>("/kanban/board");
    if (board.columns.length === 0 || board.total === 0) {
      boardEl.innerHTML = `<div class="empty-state">No tasks on the board</div>`;
      return;
    }

    summaryEl.innerHTML = `<span class="badge badge-info">${board.total} tasks</span>`;

    boardEl.innerHTML = `
      <div class="kanban-columns">
        ${board.columns.map((col) => renderColumn(col.id, col.title, col.tasks)).join("")}
      </div>
    `;

    // Wire up card click handlers for navigation
    document.querySelectorAll(".kanban-card").forEach((card) => {
      card.addEventListener("click", () => {
        const taskId = card.getAttribute("data-task-id");
        if (taskId) {
          history.pushState({}, "", `/kanban/${taskId}`);
          router.go(`kanban/${taskId}`);
        }
      });
    });
  } catch (e) {
    boardEl.innerHTML = `<div class="error-state">Failed to load board: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderColumn(id: string, title: string, tasks: KanbanTask[]): string {
  const colorClass =
    id === "todo" ? "kanban-col-purple" :
    id === "in_progress" ? "kanban-col-cyan" :
    id === "done" ? "kanban-col-emerald" :
    id === "blocked" ? "kanban-col-rose" : "kanban-col-neutral";

  return `
    <div class="kanban-column ${colorClass}">
      <div class="kanban-col-header">
        <span class="kanban-col-title">${title}</span>
        <span class="kanban-col-count">${tasks.length}</span>
      </div>
      <div class="kanban-col-body" data-column="${id}">
        ${tasks.length === 0 ? `<div class="kanban-empty">No tasks</div>` :
          tasks.map((t) => renderTaskCard(t)).join("")}
      </div>
    </div>
  `;
}

function renderTaskCard(task: KanbanTask): string {
  const priorityLabel =
    task.priority >= 3 ? "High" :
    task.priority >= 1 ? "Med" : "Low";

  const priorityClass =
    task.priority >= 3 ? "kanban-priority-high" :
    task.priority >= 1 ? "kanban-priority-med" : "kanban-priority-low";

  const timeAgo = formatRelativeTime(task.created_at);

  return `
    <div class="kanban-card" data-task-id="${task.id}">
      <div class="kanban-card-top">
        <span class="kanban-priority ${priorityClass}">${priorityLabel}</span>
        ${task.last_failure_error ? `<span class="kanban-error-dot" title="Has failures">⚠</span>` : ""}
      </div>
      <div class="kanban-card-title">${escapeHtml(task.title)}</div>
      ${task.body ? `<div class="kanban-card-body">${escapeHtml(task.body).slice(0, 120)}${task.body.length > 120 ? "..." : ""}</div>` : ""}
      <div class="kanban-card-footer">
        ${task.assignee ? `<span class="kanban-assignee">@${escapeHtml(task.assignee)}</span>` : ""}
        <span class="kanban-time">${timeAgo}</span>
      </div>
    </div>
  `;
}

// ── Task Detail View ──

export function renderKanbanDetail(container: HTMLElement, taskId: string): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Task Detail</h1>
        <p class="page-subtitle" id="task-detail-subtitle">Loading...</p>
      </div>
      <div>
        <a href="/kanban" class="back-link" id="back-to-kanban">← Back to Board</a>
      </div>
    </div>
    <div class="card" id="task-detail-card">
      <div class="card-body">
        <div class="loading">Loading task</div>
      </div>
    </div>
  `;

  const backLink = document.getElementById("back-to-kanban");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({}, "", "/kanban");
      router.go("kanban");
    });
  }

  loadTaskDetail(taskId);
}

async function loadTaskDetail(taskId: string): Promise<void> {
  const el = document.getElementById("task-detail-card")?.querySelector(".card-body");
  const subtitle = document.getElementById("task-detail-subtitle");
  if (!el) return;

  try {
    const task = await apiGet<KanbanTaskDetail>(`/kanban/tasks/${encodeURIComponent(taskId)}`);
    if (subtitle) subtitle.textContent = `Task: ${escapeHtml(task.title)}`;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div class="detail-label">Status</div>
          <div><span class="badge ${statusBadge(task.status)}">${task.status}</span></div>
        </div>
        <div>
          <div class="detail-label">Priority</div>
          <div><span class="badge ${task.priority >= 3 ? "badge-error" : task.priority >= 1 ? "badge-warning" : "badge-neutral"}">${task.priority}</span></div>
        </div>
        <div>
          <div class="detail-label">Assignee</div>
          <div>${task.assignee ? escapeHtml(task.assignee) : "<em>Unassigned</em>"}</div>
        </div>
        <div>
          <div class="detail-label">Created</div>
          <div>${new Date(task.created_at * 1000).toLocaleString()}</div>
        </div>
        ${task.started_at ? `<div><div class="detail-label">Started</div><div>${new Date(task.started_at * 1000).toLocaleString()}</div></div>` : ""}
        ${task.completed_at ? `<div><div class="detail-label">Completed</div><div>${new Date(task.completed_at * 1000).toLocaleString()}</div></div>` : ""}
        ${task.model_override ? `<div><div class="detail-label">Model</div><div>${escapeHtml(task.model_override)}</div></div>` : ""}
        ${task.session_id ? `<div style="grid-column:1/-1;"><div class="detail-label">Session</div><div style="font-family:monospace;font-size:0.8rem;">${escapeHtml(task.session_id)}</div></div>` : ""}
        ${task.skills ? `<div style="grid-column:1/-1;"><div class="detail-label">Skills</div><div>${escapeHtml(task.skills)}</div></div>` : ""}
      </div>

      ${task.body ? `
        <div style="margin-top:1.5rem;">
          <div class="detail-label">Description</div>
          <div class="detail-body">${escapeHtml(task.body)}</div>
        </div>
      ` : ""}

      ${task.last_failure_error ? `
        <div style="margin-top:1.5rem;">
          <div class="detail-label">Last Error</div>
          <div class="detail-body" style="color:var(--accent-rose);font-family:monospace;font-size:0.8rem;white-space:pre-wrap;">${escapeHtml(task.last_failure_error)}</div>
        </div>
      ` : ""}

      ${task.runs.length > 0 ? `
        <div style="margin-top:1.5rem;">
          <div class="detail-label">Runs (${task.runs.length})</div>
          <div class="table-container">
            <table>
              <thead><tr><th>Status</th><th>Profile</th><th>Outcome</th><th>Started</th><th>Summary</th></tr></thead>
              <tbody>
                ${task.runs.map((r) => `
                  <tr>
                    <td><span class="badge ${runStatusBadge(r.status)}">${r.status}</span></td>
                    <td style="font-family:monospace;font-size:0.75rem;">${r.profile ? escapeHtml(r.profile) : "-"}</td>
                    <td>${r.outcome ? escapeHtml(r.outcome) : "-"}</td>
                    <td>${new Date(r.started_at * 1000).toLocaleString()}</td>
                    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.summary ? escapeHtml(r.summary).slice(0, 80) : "-"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      ` : ""}

      ${task.comments.length > 0 ? `
        <div style="margin-top:1.5rem;">
          <div class="detail-label">Comments (${task.comments.length})</div>
          ${task.comments.map((c) => `
            <div class="kanban-comment">
              <div class="kanban-comment-header">
                <strong>${escapeHtml(c.author)}</strong>
                <span>${new Date(c.created_at * 1000).toLocaleString()}</span>
              </div>
              <div class="kanban-comment-body">${escapeHtml(c.body)}</div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      ${task.events.length > 0 ? `
        <div style="margin-top:1.5rem;">
          <div class="detail-label">Events (${task.events.length})</div>
          <div class="table-container">
            <table>
              <thead><tr><th>Kind</th><th>Time</th><th>Payload</th></tr></thead>
              <tbody>
                ${task.events.slice(0, 20).map((e) => `
                  <tr>
                    <td><span class="badge badge-info">${escapeHtml(e.kind)}</span></td>
                    <td>${new Date(e.created_at * 1000).toLocaleString()}</td>
                    <td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:monospace;font-size:0.75rem;">${e.payload ? escapeHtml(e.payload).slice(0, 100) : "-"}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        </div>
      ` : ""}

      ${task.links.length > 0 ? `
        <div style="margin-top:1.5rem;">
          <div class="detail-label">Linked Tasks (${task.links.length})</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem;">
            ${task.links.map((l) => {
              const linkedId = l.parent_id === taskId ? l.child_id : l.parent_id;
              return `<a href="/kanban/${linkedId}" class="kanban-link-chip" data-linked-id="${linkedId}">${linkedId}</a>`;
            }).join("")}
          </div>
        </div>
      ` : ""}
    `;

    // Wire up link chip clicks
    el.querySelectorAll(".kanban-link-chip").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.preventDefault();
        const href = (chip as HTMLAnchorElement).getAttribute("href");
        if (href) {
          const taskId = href.replace("/kanban/", "");
          history.pushState({}, "", href);
          router.go(`kanban/${taskId}`);
        }
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load task: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Helpers ──

function statusBadge(status: string): string {
  switch (status) {
    case "done": return "badge-success";
    case "in_progress": return "badge-warning";
    case "blocked": return "badge-error";
    default: return "badge-neutral";
  }
}

function runStatusBadge(status: string): string {
  switch (status) {
    case "done": return "badge-success";
    case "running": return "badge-warning";
    case "failed": case "crashed": case "timed_out": return "badge-error";
    default: return "badge-neutral";
  }
}

function formatRelativeTime(unix: number): string {
  const diff = Math.floor(Date.now() / 1000) - unix;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
