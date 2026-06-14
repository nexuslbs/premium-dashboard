import { apiGet, type Session, type SessionMessage } from "../lib/api";
import { router } from "../lib/router";

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
            ${sessions
              .map(
                (s) => `
              <tr class="clickable-row" data-session-id="${s.id}">
                <td style="font-family:monospace;font-size:0.75rem;">#${s.id}</td>
                <td style="color:var(--text-primary);font-weight:500;">${escapeHtml(s.title || "Untitled")}</td>
                <td><span class="badge badge-info">${escapeHtml(s.model)}</span></td>
                <td>${escapeHtml(s.provider)}</td>
                <td>${formatDate(s.created_at)}</td>
                <td>${s.turn_count}</td>
                <td><span class="badge ${s.status === "completed" ? "badge-success" : s.status === "active" ? "badge-warning" : "badge-neutral"}">${s.status}</span></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // Add click handlers to each row
    document.querySelectorAll(".clickable-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const sessionId = (row as HTMLElement).getAttribute("data-session-id");
        if (sessionId) {
          history.pushState({}, "", `/session/${sessionId}`);
          router.go(`session/${sessionId}`);
        }
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load sessions: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// Session detail view
export async function renderSessionDetail(
  container: HTMLElement,
  sessionId: string,
): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Session Details</h1>
        <p class="page-subtitle">Session: ${escapeHtml(sessionId)}</p>
      </div>
      <div>
        <a href="/sessions" class="back-link" id="back-to-sessions">← Back to Sessions</a>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Messages</span></div>
      <div class="card-body" id="messages-container">
        <div class="loading">Loading messages</div>
      </div>
    </div>
  `;

  // Wire up the back button
  const backLink = document.getElementById("back-to-sessions");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({}, "", "/sessions");
      router.go("sessions");
    });
  }

  await loadMessages(sessionId);
}

async function loadMessages(sessionId: string): Promise<void> {
  const el = document.getElementById("messages-container")!;
  try {
    const messages = await apiGet<SessionMessage[]>(
      `/sessions/${encodeURIComponent(sessionId)}/messages`,
    );
    if (messages.length === 0) {
      el.innerHTML = `<div class="empty-state">No messages found for this session</div>`;
      return;
    }

    el.innerHTML = messages.map((m) => renderMessage(m)).join("");

    // Auto-scroll to bottom
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load messages: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function renderMessage(msg: SessionMessage): string {
  const role = msg.role || "unknown";
  const content = msg.content || "";
  const toolName = msg.tool_name;
  const reasoning = msg.reasoning;
  const tokenCount = msg.token_count;
  const timestamp = msg.timestamp
    ? new Date(msg.timestamp * 1000).toLocaleString()
    : "";

  // Format content with code blocks
  const formattedContent = formatContent(content);

  let roleClass = "msg-assistant";
  let roleLabel = "Assistant";
  let icon = "🤖";

  if (role === "user") {
    roleClass = "msg-user";
    roleLabel = "User";
    icon = "👤";
  } else if (role === "tool" || role === "function") {
    roleClass = "msg-tool";
    roleLabel = toolName ? `Tool: ${escapeHtml(toolName)}` : "Tool";
    icon = "🔧";
  } else if (role === "session_meta") {
    roleClass = "msg-meta";
    roleLabel = "System";
    icon = "⚙️";
  } else if (role === "reasoning") {
    roleClass = "msg-reasoning";
    roleLabel = "Reasoning";
    icon = "🧠";
  }

  return `
    <div class="message ${roleClass}">
      <div class="msg-header">
        <span class="msg-role">${icon} <span class="msg-role-text">${roleLabel}</span></span>
        <span class="msg-meta-info">
          ${tokenCount ? `<span class="msg-tokens">${tokenCount} tokens</span>` : ""}
          ${timestamp ? `<span class="msg-timestamp">${timestamp}</span>` : ""}
        </span>
      </div>
      <div class="msg-content">${formattedContent}</div>
      ${reasoning ? `<details class="msg-reasoning-details"><summary>Reasoning</summary><pre class="reasoning-text">${escapeHtml(reasoning)}</pre></details>` : ""}
    </div>
  `;
}

function formatContent(content: string): string {
  if (!content) return "<em>No content</em>";

  // Escape HTML first
  let escaped = escapeHtml(content);

  // Replace code blocks (```...```) with styled pre blocks
  escaped = escaped.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langClass = lang
      ? ` class="code-lang" data-lang="${escapeHtml(lang)}"`
      : "";
    return `<pre class="code-block"${langClass}><code>${code.trim()}</code></pre>`;
  });

  // Replace inline code
  escaped = escaped.replace(
    /`([^`]+)`/g,
    '<code class="inline-code">$1</code>',
  );

  // Replace double newlines with paragraph breaks
  escaped = escaped.replace(/\n\n/g, "</p><p>");
  escaped = escaped.replace(/\n/g, "<br>");

  // Wrap in paragraph if not already wrapped by code blocks
  if (!escaped.startsWith("<pre")) {
    escaped = `<p>${escaped}</p>`;
  }

  return escaped;
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
