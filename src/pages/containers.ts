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

async function loadContainers(): Promise<void> {
  const grid = document.getElementById("container-grid")!;
  try {
    const containers = await apiGet<ContainerInfo[]>("/containers");
    if (containers.length === 0) {
      grid.innerHTML = `<div class="empty-state">No containers found</div>`;
      return;
    }
    grid.innerHTML = containers
      .map(
        (c) => `
      <div class="container-card">
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
            <span style="color:var(--text-secondary);font-family:monospace;font-size:0.7rem;">${escapeHtml(c.image)}</span>
          </div>
          <div class="container-info-row">
            <span>Uptime</span>
            <span>${c.uptime}</span>
          </div>
          <div class="container-info-row">
            <span>Memory</span>
            <span>${c.memory}</span>
          </div>
          ${c.ports ? `<div class="container-info-row"><span>Ports</span><span style="font-family:monospace;font-size:0.7rem;">${escapeHtml(c.ports)}</span></div>` : ""}
        </div>
      </div>
    `
      )
      .join("");
  } catch (e) {
    grid.innerHTML = `<div class="error-state">Failed to load containers: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
