import { apiGet, apiPost, type KanbanBoard, type KanbanTask, type KanbanTaskDetail } from "../lib/api";
import { router } from "../lib/router";

export function renderKanban(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Kanban</h1>
        <p class="page-subtitle">Task board</p>
      </div>
      <div style="display:flex;align-items:center;gap:0.75rem;">
        <span class="kanban-summary" id="kanban-summary"></span>
        <button id="create-task-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;white-space:nowrap;">+ Create Task</button>
      </div>
    </div>
    <div class="kanban-board" id="kanban-board">
      <div class="loading">Loading board</div>
    </div>
    <!-- Create Task Modal -->
    <div id="create-task-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;align-items:flex-start;justify-content:center;padding-top:10vh;">
      <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:500px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <h2 style="margin:0 0 1rem 0;font-size:1.1rem;">Create Task</h2>
        <div style="display:grid;gap:0.75rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Title *</label>
            <input type="text" id="task-create-title" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Body</label>
            <textarea id="task-create-body" rows="3" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;resize:vertical;box-sizing:border-box;"></textarea>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Priority</label>
            <select id="task-create-priority" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="0">Low</option>
              <option value="1">Med</option>
              <option value="3">High</option>
              <option value="5">Critical</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Assignee</label>
            <input type="text" id="task-create-assignee" placeholder="Optional" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Skills</label>
            <input type="text" id="task-create-skills" placeholder="Optional" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Model Override</label>
            <input type="text" id="task-create-model" placeholder="Optional" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
          <button id="task-create-cancel" style="background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="task-create-submit" style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Create</button>
        </div>
      </div>
    </div>
  `;

  // Wire up Create Task button
  document.getElementById("create-task-btn")?.addEventListener("click", () => {
    const modal = document.getElementById("create-task-modal");
    if (modal) modal.style.display = "flex";
  });

  document.getElementById("task-create-cancel")?.addEventListener("click", () => {
    closeCreateModal();
  });

  document.getElementById("task-create-submit")?.addEventListener("click", async () => {
    const titleInput = document.getElementById("task-create-title") as HTMLInputElement;
    if (!titleInput) return;
    const title = titleInput.value.trim();
    if (!title) return;

    const body = (document.getElementById("task-create-body") as HTMLTextAreaElement)?.value.trim() || undefined;
    const priority = parseInt((document.getElementById("task-create-priority") as HTMLSelectElement)?.value || "0");
    const assignee = (document.getElementById("task-create-assignee") as HTMLInputElement)?.value.trim() || undefined;
    const skills = (document.getElementById("task-create-skills") as HTMLInputElement)?.value.trim() || undefined;
    const model_override = (document.getElementById("task-create-model") as HTMLInputElement)?.value.trim() || undefined;

    try {
      await apiPost("/kanban/tasks", { title, body, priority, assignee, skills, model_override });
      closeCreateModal();
      loadBoard();
    } catch (e) {
      alert("Failed to create task: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  });

  loadBoard();
}

function closeCreateModal(): void {
  const modal = document.getElementById("create-task-modal");
  if (modal) modal.style.display = "none";
  const title = document.getElementById("task-create-title") as HTMLInputElement;
  if (title) title.value = "";
  const body = document.getElementById("task-create-body") as HTMLTextAreaElement;
  if (body) body.value = "";
  const priority = document.getElementById("task-create-priority") as HTMLSelectElement;
  if (priority) priority.value = "0";
  const assignee = document.getElementById("task-create-assignee") as HTMLInputElement;
  if (assignee) assignee.value = "";
  const skills = document.getElementById("task-create-skills") as HTMLInputElement;
  if (skills) skills.value = "";
  const model = document.getElementById("task-create-model") as HTMLInputElement;
  if (model) model.value = "";
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

    // Wire up move dropdown toggle
    document.querySelectorAll(".kanban-move-toggle").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const taskId = (e.currentTarget as HTMLElement).getAttribute("data-task-id");
        if (!taskId) return;
        // Close all other dropdowns
        document.querySelectorAll(".kanban-move-dropdown").forEach((d) => {
          if (d.getAttribute("data-task-id") !== taskId) {
            (d as HTMLElement).style.display = "none";
          }
        });
        // Toggle this dropdown
        const dropdown = document.querySelector(`.kanban-move-dropdown[data-task-id="${taskId}"]`) as HTMLElement;
        if (dropdown) {
          dropdown.style.display = dropdown.style.display === "block" ? "none" : "block";
        }
      });
    });
    // Wire up dropdown move buttons
    document.querySelectorAll(".kanban-move-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const dropdown = (e.target as HTMLElement).closest(".kanban-move-dropdown") as HTMLElement;
        const taskId = dropdown?.getAttribute("data-task-id");
        const moveTo = (e.target as HTMLElement).getAttribute("data-move-to");
        if (taskId && moveTo) {
          if (dropdown) dropdown.style.display = "none";
          moveTask(taskId, moveTo);
        }
      });
    });
    // Close dropdowns on outside click
    document.addEventListener("click", () => {
      document.querySelectorAll(".kanban-move-dropdown").forEach((d) => {
        (d as HTMLElement).style.display = "none";
      });
    }, { once: false });

    // Wire up drag and drop handlers (programmatic, not inline — ES modules scope)
    document.querySelectorAll(".kanban-card").forEach((card) => {
      card.addEventListener("dragstart", (e) => {
        const taskId = (e.currentTarget as HTMLElement).getAttribute("data-task-id");
        if (taskId && (e as DragEvent).dataTransfer) {
          (e as DragEvent).dataTransfer!.setData("text/plain", taskId);
          (e as DragEvent).dataTransfer!.setData("source-col", (e.currentTarget as HTMLElement).closest(".kanban-col-body")?.getAttribute("data-column") || "");
          (e as DragEvent).dataTransfer!.effectAllowed = "move";
        }
      });
    });
    document.querySelectorAll(".kanban-col-body").forEach((col) => {
      col.addEventListener("dragover", (e) => {
        e.preventDefault();
        if ((e as DragEvent).dataTransfer) {
          (e as DragEvent).dataTransfer!.dropEffect = "move";
        }
      });
      col.addEventListener("drop", async (e) => {
        e.preventDefault();
        const taskId = (e as DragEvent).dataTransfer?.getData("text/plain");
        if (!taskId) return;
        const colBody = (e.currentTarget as HTMLElement).closest(".kanban-col-body");
        const newStatus = colBody?.getAttribute("data-column");
        if (!newStatus) return;

        const sourceCol = (e as DragEvent).dataTransfer?.getData("source-col");

        // Intra-column reorder: drop on another card in same column
        if (sourceCol === newStatus) {
          const targetCard = (e.target as HTMLElement).closest(".kanban-card");
          if (targetCard) {
            const targetId = targetCard.getAttribute("data-task-id");
            if (targetId && targetId !== taskId) {
              try {
                await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId) + "/reorder", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ targetId, position: "before" }),
                });
                loadBoard();
                return;
              } catch (err) {
                console.error("Reorder failed:", err);
              }
            }
          }
        }

        // Cross-column move (existing logic)
        try {
          await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId) + "/status", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
          });
          loadBoard();
        } catch (err) {
          console.error("Drop move failed:", err);
        }
      });
    });
  } catch (e) {
    boardEl.innerHTML = `<div class="error-state">Failed to load board: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

async function moveTask(taskId: string, status: string): Promise<void> {
  try {
    await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    loadBoard();
  } catch (e) {
    alert("Failed to move task: " + (e instanceof Error ? e.message : "Unknown error"));
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

  const status = task.status || "todo";

  return `
    <div class="kanban-card" data-task-id="${task.id}" draggable="true">
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
      <div class="kanban-card-actions" style="display:flex;flex-wrap:wrap;gap:0.25rem;padding:0.375rem 0.5rem;border-top:1px solid var(--glass-border,rgba(255,255,255,0.06));margin-top:0.25rem;">
        <div style="position:relative;">
          <button class="kanban-move-toggle" data-task-id="${task.id}" style="background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:4px;padding:0.15rem 0.4rem;cursor:pointer;font-size:0.65rem;white-space:nowrap;">↳ Move</button>
          <div class="kanban-move-dropdown" data-task-id="${task.id}" style="display:none;position:absolute;top:100%;left:0;z-index:10;background:#1a1a2e;border:1px solid var(--glass-border);border-radius:6px;padding:0.25rem;min-width:110px;box-shadow:0 4px 12px rgba(0,0,0,0.4);">
            ${["todo","in_progress","done","blocked"].filter(s => s !== status).map(s =>
              `<button class="kanban-move-btn" data-move-to="${s}" style="display:block;width:100%;text-align:left;background:none;border:none;color:var(--text-primary);padding:0.3rem 0.5rem;cursor:pointer;font-size:0.7rem;border-radius:4px;">→ ${s === "in_progress" ? "In Progress" : s.charAt(0).toUpperCase() + s.slice(1)}</button>`
            ).join("")}
          </div>
        </div>
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
      <div style="display:flex;align-items:center;gap:0.5rem;">
        <button id="task-edit-btn" style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.75rem;font-weight:500;">Edit</button>
        <button id="task-delete-btn" style="background:rgba(244,63,94,0.15);border:1px solid rgba(244,63,94,0.3);color:var(--accent-rose);border-radius:6px;padding:0.375rem 0.625rem;cursor:pointer;font-size:0.75rem;font-weight:500;">Delete</button>
        <a href="/kanban" class="back-link" id="back-to-kanban">← Back to Board</a>
      </div>
    </div>
    <div class="card" id="task-detail-card">
      <div class="card-body">
        <div class="loading">Loading task</div>
      </div>
    </div>
    <!-- Edit Task Modal -->
    <div id="edit-task-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:1000;align-items:flex-start;justify-content:center;padding-top:10vh;">
      <div style="background:#1a1a2e;border-radius:8px;padding:1.5rem;max-width:500px;width:90%;border:1px solid var(--glass-border,rgba(255,255,255,0.08));">
        <h2 style="margin:0 0 1rem 0;font-size:1.1rem;">Edit Task</h2>
        <div style="display:grid;gap:0.75rem;">
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Title *</label>
            <input type="text" id="task-edit-title" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Body</label>
            <textarea id="task-edit-body" rows="3" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;resize:vertical;box-sizing:border-box;"></textarea>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Priority</label>
            <select id="task-edit-priority" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="0">Low</option>
              <option value="1">Med</option>
              <option value="3">High</option>
              <option value="5">Critical</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Status</label>
            <select id="task-edit-status" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;">
              <option value="todo">Todo</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
              <option value="blocked">Blocked</option>
            </select>
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Assignee</label>
            <input type="text" id="task-edit-assignee" placeholder="Optional" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Skills</label>
            <input type="text" id="task-edit-skills" placeholder="Optional" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
          <div>
            <label style="display:block;font-size:0.8rem;color:var(--text-muted);margin-bottom:0.25rem;">Model Override</label>
            <input type="text" id="task-edit-model" placeholder="Optional" style="width:100%;padding:0.5rem;border-radius:6px;border:1px solid var(--glass-border);background:rgba(255,255,255,0.04);color:inherit;font-size:0.85rem;box-sizing:border-box;" />
          </div>
        </div>
        <div style="display:flex;gap:0.5rem;justify-content:flex-end;margin-top:1rem;">
          <button id="task-edit-cancel" style="background:rgba(255,255,255,0.06);border:1px solid var(--glass-border);color:var(--text-secondary);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;">Cancel</button>
          <button id="task-edit-submit" style="background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.4);color:var(--accent-purple);border-radius:6px;padding:0.375rem 0.75rem;cursor:pointer;font-size:0.8rem;font-weight:500;">Save</button>
        </div>
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

  // Wire up delete button
  const deleteBtn = document.getElementById("task-delete-btn");
  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (confirm("Delete this task?")) {
        try {
          await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId), { method: "DELETE" });
          history.pushState({}, "", "/kanban");
          router.go("kanban");
        } catch (e) {
          alert("Failed to delete task: " + (e instanceof Error ? e.message : "Unknown error"));
        }
      }
    });
  }

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

    // Wire up Edit button
    const editBtn = document.getElementById("task-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        // Pre-fill edit modal with current values
        (document.getElementById("task-edit-title") as HTMLInputElement).value = task.title;
        (document.getElementById("task-edit-body") as HTMLTextAreaElement).value = task.body || "";
        (document.getElementById("task-edit-priority") as HTMLSelectElement).value = String(task.priority);
        (document.getElementById("task-edit-status") as HTMLSelectElement).value = task.status;
        (document.getElementById("task-edit-assignee") as HTMLInputElement).value = task.assignee || "";
        (document.getElementById("task-edit-skills") as HTMLInputElement).value = task.skills || "";
        (document.getElementById("task-edit-model") as HTMLInputElement).value = task.model_override || "";

        // Show modal
        const modal = document.getElementById("edit-task-modal");
        if (modal) modal.style.display = "flex";
      });
    }

    // Wire up edit modal cancel
    document.getElementById("task-edit-cancel")?.addEventListener("click", () => {
      const modal = document.getElementById("edit-task-modal");
      if (modal) modal.style.display = "none";
    });

    // Wire up edit modal submit
    document.getElementById("task-edit-submit")?.addEventListener("click", async () => {
      const title = (document.getElementById("task-edit-title") as HTMLInputElement)?.value.trim();
      if (!title) return;
      const body = (document.getElementById("task-edit-body") as HTMLTextAreaElement)?.value.trim() || undefined;
      const priority = parseInt((document.getElementById("task-edit-priority") as HTMLSelectElement)?.value || "0");
      const status = (document.getElementById("task-edit-status") as HTMLSelectElement)?.value || "todo";
      const assignee = (document.getElementById("task-edit-assignee") as HTMLInputElement)?.value.trim() || undefined;
      const skills = (document.getElementById("task-edit-skills") as HTMLInputElement)?.value.trim() || undefined;
      const model_override = (document.getElementById("task-edit-model") as HTMLInputElement)?.value.trim() || undefined;

      try {
        await fetch("/api/kanban/tasks/" + encodeURIComponent(taskId), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body, priority, status, assignee, skills, model_override }),
        });
        const modal = document.getElementById("edit-task-modal");
        if (modal) modal.style.display = "none";
        // Reload the detail view
        loadTaskDetail(taskId);
      } catch (e) {
        alert("Failed to update task: " + (e instanceof Error ? e.message : "Unknown error"));
      }
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
