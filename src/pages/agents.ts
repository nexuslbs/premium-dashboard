import {
  apiGet,
  type AgentFilters,
  type AgentEventsResponse,
  type AgentEventItem,
} from "../lib/api";
import { router } from "../lib/router";

// ── State ──
let currentFilters: {
  agents: string[];
  session: string;
  types: string[];
  subtype: string;
  provider: string;
  model: string;
  message_id: string;
} = {
  agents: [],
  session: "all",
  types: [],
  subtype: "",
  provider: "all",
  model: "all",
  message_id: "all",
};

let allFilters: AgentFilters | null = null;

// ── URL search param sync ──
function syncFiltersToUrl(): void {
  const params = new URLSearchParams();
  if (currentFilters.agents.length > 0) {
    for (const a of currentFilters.agents) params.append("agent", a);
  }
  if (currentFilters.session !== "all") params.set("session", currentFilters.session);
  if (currentFilters.types.length > 0) {
    for (const t of currentFilters.types) params.append("type", t);
  }
  if (currentFilters.subtype) params.set("subtype", currentFilters.subtype);
  if (currentFilters.provider !== "all") params.set("provider", currentFilters.provider);
  if (currentFilters.model !== "all") params.set("model", currentFilters.model);
  if (currentFilters.message_id !== "all") params.set("message_id", currentFilters.message_id);
  if (currentOffset > 0) params.set("offset", String(currentOffset));
  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  history.replaceState(null, "", newUrl);
}

function applyFiltersFromUrl(): void {
  const p = new URLSearchParams(window.location.search);
  const agents = p.getAll("agent").filter((v) => v !== "all");
  if (agents.length > 0) currentFilters.agents = agents;
  const session = p.get("session");
  if (session) currentFilters.session = session;
  const types = p.getAll("type").filter((v) => v !== "all");
  if (types.length > 0) currentFilters.types = types;
  const subtype = p.get("subtype");
  if (subtype) currentFilters.subtype = subtype;
  const provider = p.get("provider");
  if (provider) currentFilters.provider = provider;
  const model = p.get("model");
  if (model) currentFilters.model = model;
  const messageId = p.get("message_id");
  if (messageId === "null" || messageId === "non-null") currentFilters.message_id = messageId;
  const offset = p.get("offset");
  if (offset) currentOffset = parseInt(offset, 10) || 0;
}

// ── Agent role colors ──
const AGENT_COLORS: Record<string, string> = {
  hermes: "#8b5cf6",
  researcher: "#3b82f6",
  coder: "#10b981",
  tester: "#f59e0b",
  reviewer: "#06b6d4",
  planner: "#f43f5e",
  executor: "#a78bfa",
  writer: "#ec4899",
  analyst: "#14b8a6",
};

function agentColor(role: string): string {
  return AGENT_COLORS[role.toLowerCase()] || "#64748b";
}

// ── Type badge colors ──
const TYPE_COLORS: Record<string, string> = {
  prompt: "#3b82f6",
  response: "#10b981",
  reasoning: "#f59e0b",
  tool: "#8b5cf6",
  tool_output: "#a78bfa",
  iteration: "#64748b",
  delegate_result: "#f43f5e",
  skill: "#06b6d4",
};

function typeColor(type: string): string {
  return TYPE_COLORS[type.toLowerCase()] || "#64748b";
}

// ── Main render function ──
export function renderAgents(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Agent Interactions</h1>
        <p class="page-subtitle">Full event log with agent attribution</p>
      </div>
    </div>
    <div class="filter-bar" id="filter-bar">
      <div class="filter-section">
        <label class="filter-label">Agents</label>
        <div class="agent-filter-group" id="agent-filter-group"></div>
      </div>
      <div class="filter-section">
        <label class="filter-label">Session</label>
        <select class="filter-select" id="filter-session">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Type</label>
        <div class="type-filter-group" id="type-filter-group"></div>
      </div>
      <div class="filter-section">
        <label class="filter-label">Subtype</label>
        <input class="filter-input" id="filter-subtype" type="text" placeholder="Filter by subtype..." />
      </div>
      <div class="filter-section">
        <label class="filter-label">Provider</label>
        <select class="filter-select" id="filter-provider">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Model</label>
        <select class="filter-select" id="filter-model">
          <option value="all">All</option>
        </select>
      </div>
      <div class="filter-section">
        <label class="filter-label">Message ID</label>
        <select class="filter-select" id="filter-message-id">
          <option value="all">All</option>
          <option value="null">Only NULL</option>
          <option value="non-null">Only non-null</option>
        </select>
      </div>
      <div class="filter-actions">
        <button class="btn btn-secondary" id="btn-refresh">⟳ Refresh</button>
        <button class="btn btn-secondary" id="btn-reset">✕ Reset</button>
      </div>
    </div>
    <div class="events-count" id="events-count"></div>
    <div class="card">
      <div class="card-header">
        <span class="card-title">Event Log</span>
        <span class="events-nav" id="events-nav">
          <button class="nav-btn" id="prev-page" disabled>← Prev</button>
          <span id="page-info">Page 1</span>
          <button class="nav-btn" id="next-page" disabled>Next →</button>
        </span>
      </div>
      <div class="card-body" id="events-list">
        <div class="loading">Loading events</div>
      </div>
      <div class="card-footer" id="events-bottom-nav" style="display:none;padding:0.75rem 1.25rem;border-top:1px solid var(--border-primary);display:flex;align-items:center;justify-content:space-between">
        <span class="events-count" id="events-count-bottom"></span>
        <span class="events-nav">
          <button class="nav-btn" id="prev-page-bottom" disabled>← Prev</button>
          <span id="page-info-bottom">Page 1</span>
          <button class="nav-btn" id="next-page-bottom" disabled>Next →</button>
        </span>
      </div>
    </div>
  `;

  // Reset state
  currentFilters = {
    agents: [],
    session: "all",
    types: [],
    subtype: "",
    provider: "all",
    model: "all",
    message_id: "all",
  };
  currentOffset = 0;
  allFilters = null;

  applyFiltersFromUrl();

  loadFilters();
}

// ── Load filter data ──
async function loadFilters(): Promise<void> {
  try {
    allFilters = await apiGet<AgentFilters>("/agents/filters");
    populateFilterControls();
    syncFilterStateToControls();
    loadEvents();
  } catch (e) {
    console.error("Failed to load filters:", e);
    document.getElementById("events-list")!.innerHTML = `<div class="error-state">Failed to load filters: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Populate filter controls ──
function populateFilterControls(): void {
  if (!allFilters) return;

  // Agents - toggle buttons
  const agentGroup = document.getElementById("agent-filter-group")!;

  // Aggregate agent roles with total counts
  const roleCounts = new Map<string, number>();
  for (const a of allFilters.agents) {
    roleCounts.set(a.role, (roleCounts.get(a.role) || 0) + a.count);
  }

  // "All" button first
  agentGroup.innerHTML = `<button class="agent-filter-btn selected" data-agent="all">All</button>`;

  // Unique roles sorted
  const sortedRoles = Array.from(roleCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [role, count] of sortedRoles) {
    const color = agentColor(role);
    agentGroup.innerHTML += `<button class="agent-filter-btn" data-agent="${escapeHtml(role)}" style="--agent-color:${color}">${escapeHtml(role)} <span class="agent-count">${count}</span></button>`;
  }

  // Session select
  const sessionSel = document.getElementById("filter-session") as HTMLSelectElement;
  sessionSel.innerHTML = '<option value="all">All</option>';
  for (const s of allFilters.sessions) {
    sessionSel.innerHTML += `<option value="${escapeHtml(s.session_id)}">${escapeHtml(truncateMiddle(s.session_id, 32))} (${s.count})</option>`;
  }

  // Types - toggle buttons
  const typeGroup = document.getElementById("type-filter-group")!;
  typeGroup.innerHTML = `<button class="type-filter-btn selected" data-type="all">All</button>`;
  for (const t of allFilters.types) {
    const color = typeColor(t);
    typeGroup.innerHTML += `<button class="type-filter-btn" data-type="${escapeHtml(t)}" style="--type-color:${color}">${escapeHtml(t)}</button>`;
  }

  // Provider select
  const provSel = document.getElementById("filter-provider") as HTMLSelectElement;
  provSel.innerHTML = '<option value="all">All</option>';
  for (const p of allFilters.providers) {
    provSel.innerHTML += `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`;
  }

  // Model select
  const modelSel = document.getElementById("filter-model") as HTMLSelectElement;
  modelSel.innerHTML = '<option value="all">All</option>';
  for (const m of allFilters.models) {
    modelSel.innerHTML += `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`;
  }

  // Wire up events
  wireFilterEvents();
}

// ── Wire filter change events ──
function wireFilterEvents(): void {
  // Agent toggle buttons
  document.querySelectorAll(".agent-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const role = (btn as HTMLElement).getAttribute("data-agent") || "";
      if (role === "all") {
        // Unselect all others, select All
        document.querySelectorAll(".agent-filter-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        currentFilters.agents = [];
      } else {
        // Unselect "All" if selected
        const allBtn = document.querySelector('.agent-filter-btn[data-agent="all"]');
        if (allBtn) allBtn.classList.remove("selected");

        btn.classList.toggle("selected");
        // Gather selected
        const selected: string[] = [];
        document.querySelectorAll(".agent-filter-btn.selected").forEach((b) => {
          const r = (b as HTMLElement).getAttribute("data-agent");
          if (r && r !== "all") selected.push(r);
        });
        currentFilters.agents = selected;

        // If none selected, select "All"
        if (selected.length === 0) {
          if (allBtn) allBtn.classList.add("selected");
        }
      }
      loadEvents();
    });
  });

  // Session select
  document.getElementById("filter-session")!.addEventListener("change", (e) => {
    currentFilters.session = (e.target as HTMLSelectElement).value;
    loadEvents();
  });

  // Type toggle buttons
  document.querySelectorAll(".type-filter-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const type = (btn as HTMLElement).getAttribute("data-type") || "";
      if (type === "all") {
        document.querySelectorAll(".type-filter-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        currentFilters.types = [];
      } else {
        const allBtn = document.querySelector('.type-filter-btn[data-type="all"]');
        if (allBtn) allBtn.classList.remove("selected");

        btn.classList.toggle("selected");
        const selected: string[] = [];
        document.querySelectorAll(".type-filter-btn.selected").forEach((b) => {
          const t = (b as HTMLElement).getAttribute("data-type");
          if (t && t !== "all") selected.push(t);
        });
        currentFilters.types = selected;

        if (selected.length === 0) {
          if (allBtn) allBtn.classList.add("selected");
        }
      }
      loadEvents();
    });
  });

  // Subtype input (debounced)
  const subtypeInput = document.getElementById("filter-subtype") as HTMLInputElement;
  let subtypeTimer: ReturnType<typeof setTimeout> | null = null;
  subtypeInput.addEventListener("input", () => {
    if (subtypeTimer) clearTimeout(subtypeTimer);
    subtypeTimer = setTimeout(() => {
      currentFilters.subtype = subtypeInput.value;
      loadEvents();
    }, 300);
  });

  // Provider select
  document.getElementById("filter-provider")!.addEventListener("change", (e) => {
    currentFilters.provider = (e.target as HTMLSelectElement).value;
    loadEvents();
  });

  // Model select
  document.getElementById("filter-model")!.addEventListener("change", (e) => {
    currentFilters.model = (e.target as HTMLSelectElement).value;
    loadEvents();
  });

  // Message ID select
  document.getElementById("filter-message-id")!.addEventListener("change", (e) => {
    currentFilters.message_id = (e.target as HTMLSelectElement).value;
    loadEvents();
  });

  // Refresh button
  document.getElementById("btn-refresh")!.addEventListener("click", () => {
    loadEvents();
  });

  // Reset button
  document.getElementById("btn-reset")!.addEventListener("click", () => {
    currentFilters = {
      agents: [],
      session: "all",
      types: [],
      subtype: "",
      provider: "all",
      model: "all",
      message_id: "all",
    };
    currentOffset = 0;
    syncFilterStateToControls();
    history.replaceState(null, "", window.location.pathname);
    loadEvents();
  });

  // Pagination
  document.getElementById("prev-page")!.addEventListener("click", () => {
    if (currentOffset > 0) {
      currentOffset = Math.max(0, currentOffset - currentLimit);
      loadEvents();
    }
  });
  document.getElementById("next-page")!.addEventListener("click", () => {
    currentOffset += currentLimit;
    loadEvents();
  });
  document.getElementById("prev-page-bottom")!.addEventListener("click", () => {
    if (currentOffset > 0) {
      currentOffset = Math.max(0, currentOffset - currentLimit);
      loadEvents();
    }
  });
  document.getElementById("next-page-bottom")!.addEventListener("click", () => {
    currentOffset += currentLimit;
    loadEvents();
  });
}

// ── Pagination state ──
let currentOffset = 0;
const currentLimit = 200;
let currentTotal = 0;

// ── Sync filter controls to currentFilters state ──
function syncFilterStateToControls(): void {
  // Session select
  const sessionSel = document.getElementById("filter-session") as HTMLSelectElement | null;
  if (sessionSel) sessionSel.value = currentFilters.session;

  // Subtype input
  const subtypeInput = document.getElementById("filter-subtype") as HTMLInputElement | null;
  if (subtypeInput) subtypeInput.value = currentFilters.subtype;

  // Provider select
  const providerSel = document.getElementById("filter-provider") as HTMLSelectElement | null;
  if (providerSel) providerSel.value = currentFilters.provider;

  // Model select
  const modelSel = document.getElementById("filter-model") as HTMLSelectElement | null;
  if (modelSel) modelSel.value = currentFilters.model;

  // Message ID select
  const msgIdSel = document.getElementById("filter-message-id") as HTMLSelectElement | null;
  if (msgIdSel) msgIdSel.value = currentFilters.message_id;

  // Agent toggle buttons
  document.querySelectorAll(".agent-filter-btn").forEach((btn) => {
    const role = (btn as HTMLElement).getAttribute("data-agent") || "";
    if (role === "all") {
      btn.classList.toggle("selected", currentFilters.agents.length === 0);
    } else {
      btn.classList.toggle("selected", currentFilters.agents.includes(role));
    }
  });

  // Type toggle buttons
  document.querySelectorAll(".type-filter-btn").forEach((btn) => {
    const type = (btn as HTMLElement).getAttribute("data-type") || "";
    if (type === "all") {
      btn.classList.toggle("selected", currentFilters.types.length === 0);
    } else {
      btn.classList.toggle("selected", currentFilters.types.includes(type));
    }
  });
}

// ── Load events ──
async function loadEvents(): Promise<void> {
  const eventsList = document.getElementById("events-list")!;
  const countEl = document.getElementById("events-count")!;
  const prevBtn = document.getElementById("prev-page") as HTMLButtonElement;
  const nextBtn = document.getElementById("next-page") as HTMLButtonElement;
  const pageInfo = document.getElementById("page-info")!;
  const countBottom = document.getElementById("events-count-bottom")!;
  const prevBottom = document.getElementById("prev-page-bottom") as HTMLButtonElement;
  const nextBottom = document.getElementById("next-page-bottom") as HTMLButtonElement;
  const pageInfoBottom = document.getElementById("page-info-bottom")!;

  eventsList.innerHTML = '<div class="loading">Loading events</div>';

  try {
    // Build URL params
    const params = new URLSearchParams();
    params.set("limit", String(currentLimit));
    params.set("offset", String(currentOffset));

    if (currentFilters.agents.length > 0) {
      for (const a of currentFilters.agents) {
        params.append("agent", a);
      }
    } else {
      params.set("agent", "all");
    }

    params.set("session", currentFilters.session);

    if (currentFilters.types.length > 0) {
      for (const t of currentFilters.types) {
        params.append("type", t);
      }
    } else {
      params.set("type", "all");
    }

    if (currentFilters.subtype) {
      params.set("subtype", currentFilters.subtype);
    }
    params.set("provider", currentFilters.provider);
    params.set("model", currentFilters.model);
    params.set("message_id", currentFilters.message_id);

    const data = await apiGet<AgentEventsResponse>(
      `/agents/events?${params.toString()}`,
    );
    currentTotal = data.total;

    // Update nav
    const totalPages = Math.ceil(data.total / currentLimit);
    const currentPage = Math.floor(currentOffset / currentLimit) + 1;
    prevBtn.disabled = currentOffset <= 0;
    nextBtn.disabled = currentOffset + currentLimit >= data.total;
    prevBottom.disabled = prevBtn.disabled;
    nextBottom.disabled = nextBtn.disabled;

    // Update count
    const start = data.total > 0 ? currentOffset + 1 : 0;
    const end = Math.min(currentOffset + data.events.length, data.total);
    const countText =
      data.total > 0
        ? `Showing ${start}–${end} of ${data.total} events`
        : "No events found";
    countEl.textContent = countText;
    countBottom.textContent = countText;

    pageInfo.textContent =
      data.total > 0 ? `Page ${currentPage} of ${totalPages}` : "";
    pageInfoBottom.textContent = pageInfo.textContent;

    if (data.events.length === 0) {
      eventsList.innerHTML = `<div class="empty-state">No events match the current filters</div>`;
      return;
    }

    // Render events
    eventsList.innerHTML = `<div class="events-scroll">${data.events.map((ev) => renderEventRow(ev)).join("")}</div>`;

    // Wire up expand buttons
    document.querySelectorAll(".ev-expand-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = (btn as HTMLElement).getAttribute("data-ev-id");
        const expanded = (btn as HTMLElement).getAttribute("data-expanded") === "true";
        const previewEl = document.querySelector(`.ev-content-preview[data-ev-id="${id}"]`) as HTMLElement;
        const fullEl = document.querySelector(`.ev-content-full[data-ev-id="${id}"]`) as HTMLElement;

        if (expanded) {
          if (previewEl) previewEl.style.display = "";
          if (fullEl) fullEl.style.display = "none";
          btn.textContent = "Show more";
          btn.setAttribute("data-expanded", "false");
        } else {
          if (previewEl) previewEl.style.display = "none";
          if (fullEl) fullEl.style.display = "block";
          btn.textContent = "Show less";
          btn.setAttribute("data-expanded", "true");
        }
      });
    });

    // Wire up session click
    document.querySelectorAll(".ev-session-link").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        const sessionId = (el as HTMLElement).getAttribute("data-session-id");
        if (sessionId) {
          history.pushState({}, "", `/agent/${sessionId}`);
          router.go(`agent/${sessionId}`);
        }
      });
    });

    // Sync current filters to URL search params
    syncFiltersToUrl();
  } catch (e) {
    eventsList.innerHTML = `<div class="error-state">Failed to load events: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Render a single event row ──
function renderEventRow(ev: AgentEventItem): string {
  const role = ev.agent_role || "hermes";
  const roleColor = agentColor(role);
  const type = ev.type || "unknown";
  const tColor = typeColor(type);
  const content = ev.content || "";
  const maxPreview = 100;
  const isLong = content.length > maxPreview;
  const preview = escapeHtml(content.slice(0, maxPreview)) + (isLong ? "…" : "");
  const full = escapeHtml(content);
  const ts = new Date(ev.timestamp + "Z");
  const timeStr = formatRelativeTime(ts);
  const timeFull = ts.toLocaleString();

  return `
    <div class="event-row">
      <div class="event-row-header">
        <span class="ev-id-badge" title="Row ID in agent-interactions.db">#${ev.id}</span>
        <span class="agent-badge" style="--agent-color:${roleColor};background:${roleColor}22;border-color:${roleColor}44;color:${roleColor}">
          ${escapeHtml(role)}
        </span>
        <span class="event-type-badge" style="--type-color:${tColor};background:${tColor}22;border-color:${tColor}44;color:${tColor}">
          ${escapeHtml(type)}
        </span>
        ${ev.subtype ? `<span class="event-subtype">${escapeHtml(ev.subtype)}</span>` : ""}
        <span class="event-flow">
          <span class="ev-from">${escapeHtml(ev.from_entity)}</span>
          ${ev.to_entity ? `<span class="ev-arrow">→</span><span class="ev-to">${escapeHtml(ev.to_entity)}</span>` : ""}
        </span>
        <span class="event-row-meta">
          ${ev.provider ? `<span class="ev-provider" title="Provider">${escapeHtml(ev.provider)}</span>` : ""}
          ${ev.model ? `<span class="ev-model" title="Model">${escapeHtml(ev.model)}</span>` : ""}
        </span>
        <a href="#" class="ev-session-link" data-session-id="${escapeHtml(ev.session_id)}" title="View session: ${escapeHtml(ev.session_id)}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        </a>
        <span class="ev-time" title="${timeFull}">${timeStr}</span>
      </div>
      <div class="event-content-area">
        <div class="ev-content-preview" data-ev-id="${ev.id}">
          <pre class="ev-content-text">${preview}</pre>
        </div>
        ${isLong ? `<div class="ev-content-full" data-ev-id="${ev.id}" style="display:none"><pre class="ev-content-text">${full}</pre></div>` : ""}
        ${isLong ? `<button class="ev-expand-btn" data-ev-id="${ev.id}" data-expanded="false">Show more</button>` : ""}
      </div>
    </div>
  `;
}

// ── Agent session detail view (legacy support) ──
export async function renderAgentDetail(
  container: HTMLElement,
  sessionId: string,
): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Agent Session</h1>
        <p class="page-subtitle">Session: ${escapeHtml(sessionId)}</p>
      </div>
      <div>
        <a href="/agents" class="back-link" id="back-to-agents">← Back to Agents</a>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Events (${escapeHtml(sessionId)})</span></div>
      <div class="card-body" id="agent-events-container">
        <div class="loading">Loading events</div>
      </div>
    </div>
  `;

  const backLink = document.getElementById("back-to-agents");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({}, "", "/agents");
      router.go("agents");
    });
  }

  await loadLegacyEvents(sessionId);
}

async function loadLegacyEvents(sessionId: string): Promise<void> {
  const el = document.getElementById("agent-events-container")!;
  try {
    const events = await apiGet<AgentEventItem[]>(
      `/agents/${encodeURIComponent(sessionId)}`,
    );
    if (events.length === 0) {
      el.innerHTML = `<div class="empty-state">No events found for this session</div>`;
      return;
    }
    el.innerHTML = events.map((ev) => renderEventRow(ev)).join("");
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load events: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Utilities ──
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function truncateMiddle(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const half = Math.floor((maxLen - 3) / 2);
  return str.slice(0, half) + "…" + str.slice(str.length - half);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
