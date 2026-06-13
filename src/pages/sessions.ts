import { apiGet, type Session } from "../lib/api";

export function renderSessions(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Sessions</h1>
        <p class="page-subtitle">Agent conversation history</p>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Recent Sessions</span></div>
      <div class="card-body" id="sessions-table">
        <div class="loading">Loading sessions</div>
      </div>
    </div>
  `;

  loadSessions();
}

async function loadSessions(): Promise<void> {
  const el = document.getElementById("sessions-table")!;
  try {
    const sessions = await apiGet<Session[]>("/sessions");
    if (sessions.length === 0) {
      el.innerHTML = `<div class="empty-state">No sessions found</div>`;
      return;
    }
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Title</th>
              <th>Model</th>
              <th>Provider</th>
              <th>Created</th>
              <th>Turns</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.map(s => `
              <tr>
                <td style="font-family:monospace;font-size:0.75rem;">#${s.id}</td>
                <td style="color:var(--text-primary);font-weight:500;">${escapeHtml(s.title || "Untitled")}</td>
                <td><span class="badge badge-info">${escapeHtml(s.model)}</span></td>
                <td>${escapeHtml(s.provider)}</td>
                <td>${formatDate(s.created_at)}</td>
                <td>${s.turn_count}</td>
                <td><span class="badge ${s.status === "completed" ? "badge-success" : s.status === "active" ? "badge-warning" : "badge-neutral"}">${s.status}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load sessions: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
