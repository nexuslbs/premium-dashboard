import { apiGet, type ContainerInfo } from "../lib/api";

export function renderContainers(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Containers</h1>
        <p class="page-subtitle">Docker container status</p>
      </div>
      <button class="refresh-btn" onclick="location.reload()" style="background:var(--glass-bg);border:1px solid var(--glass-border);color:var(--text-secondary);padding:0.5rem 1rem;border-radius:var(--radius-sm);cursor:pointer;font-size:0.875rem;">Refresh</button>
    </div>
    <div id="container-grid" class="container-grid">
      <div class="loading">Loading containers</div>
    </div>
  `;

  loadContainers();
}

function replaceSpinnersWithDash(): void {
  document.querySelectorAll(".container-memory").forEach((el) => {
    if (el.querySelector(".loading-spinner")) {
      el.textContent = "\u2014";
    }
  });
}

async function loadContainers(): Promise<void> {
  const grid = document.getElementById("container-grid")!;
  try {
    // Fast load — containers without memory
    const containers = await apiGet<ContainerInfo[]>("/containers");
    if (containers.length === 0) {
      grid.innerHTML = `<div class="empty-state">No containers found</div>`;
      return;
    }
    // Render with spinner placeholders for memory
    grid.innerHTML = containers
      .map(
        (c) => `
      <div class="container-card" data-container-name="${escapeHtml(c.name)}">
        <div class="container-card-header">
          <span class="container-name">${escapeHtml(c.name)}</span>
          <span class="container-status">
            <span class="container-status-dot ${c.state}"></span>
            ${c.state}
          </span>
        </div>
        <div class="container-info">
          <div class="container-info-row">
            <span>Image</span>
            <span style="color:var(--text-secondary);font-family:monospace;font-size:0.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%;display:inline-block;vertical-align:middle;">${escapeHtml(c.image)}</span>
          </div>
          <div class="container-info-row">
            <span>Uptime</span>
            <span>${c.uptime}</span>
          </div>
          <div class="container-info-row">
            <span>Memory</span>
            <span class="container-memory" data-container-name="${escapeHtml(c.name)}"><span class="loading-spinner"></span></span>
          </div>
          ${c.ports ? `<div class="container-info-row"><span>Ports</span><span style="font-family:monospace;font-size:0.7rem;">${escapeHtml(c.ports)}</span></div>` : ""}
        </div>
      </div>
    `,
      )
      .join("");

    // Background — lazy-load memory values
    loadMemoryAsync();
  } catch (e) {
    grid.innerHTML = `<div class="error-state">Failed to load containers: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

async function loadMemoryAsync(): Promise<void> {
  try {
    const memMap = await apiGet<Record<string, string>>("/containers/memory");
    for (const [name, memory] of Object.entries(memMap)) {
      const el = document.querySelector(
        `.container-memory[data-container-name="${escapeCss(name)}"]`,
      );
      if (el) {
        el.textContent = memory;
      }
    }
  } catch (e) {
    console.error("Container memory async load error:", e);
  }
  // Clean up spinners that weren't updated (timeout returned {} or container not running)
  replaceSpinnersWithDash();
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeCss(text: string): string {
  return text.replace(/"/g, '\\"').replace(/'/g, "\\'");
}
