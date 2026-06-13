import { apiGet, type SystemStats } from "../lib/api";

export function renderOverview(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Overview</h1>
        <p class="page-subtitle">System status and key metrics</p>
      </div>
    </div>
    <div class="stats-grid" id="stats-grid">
      <div class="loading">Loading stats</div>
    </div>
    <div class="charts-grid">
      <div class="card">
        <div class="card-header"><span class="card-title">CPU & Memory</span></div>
        <div class="card-body">
          <canvas id="resource-chart" height="200"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Quick Info</span></div>
        <div class="card-body" id="quick-info">
          <div class="loading">Loading</div>
        </div>
      </div>
    </div>
  `;

  loadStats();
  loadQuickInfo();
}

async function loadStats(): Promise<void> {
  const grid = document.getElementById("stats-grid")!;
  try {
    const stats = await apiGet<SystemStats>("/stats");
    grid.innerHTML = `
      <div class="stat-card purple">
        <div class="stat-card-label">CPU Usage</div>
        <div class="stat-card-value">${stats.cpu.usage.toFixed(1)}%</div>
        <div class="stat-card-sub">${stats.cpu.cores} cores</div>
        <svg width="36" height="36" class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/></svg>
      </div>
      <div class="stat-card cyan">
        <div class="stat-card-label">Memory</div>
        <div class="stat-card-value">${stats.memory.percent.toFixed(0)}%</div>
        <div class="stat-card-sub">${(stats.memory.used / 1024 / 1024 / 1024).toFixed(1)}G / ${(stats.memory.total / 1024 / 1024 / 1024).toFixed(1)}G</div>
        <svg width="36" height="36" class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10v4"/><path d="M10 10v4"/><path d="M14 10v4"/><path d="M18 10v4"/></svg>
      </div>
      <div class="stat-card amber">
        <div class="stat-card-label">Sessions Today</div>
        <div class="stat-card-value">${stats.sessions_today}</div>
        <div class="stat-card-sub">Agent conversations</div>
        <svg width="36" height="36" class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/><path d="M12 6v6l4 2"/></svg>
      </div>
      <div class="stat-card emerald">
        <div class="stat-card-label">Containers</div>
        <div class="stat-card-value">${stats.containers_running}</div>
        <div class="stat-card-sub">Running</div>
        <svg width="36" height="36" class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
      </div>
      <div class="stat-card blue">
        <div class="stat-card-label">Disk</div>
        <div class="stat-card-value">${stats.disk.percent.toFixed(0)}%</div>
        <div class="stat-card-sub">${(stats.disk.used / 1024 / 1024 / 1024).toFixed(0)}G / ${(stats.disk.total / 1024 / 1024 / 1024).toFixed(0)}G</div>
        <svg width="36" height="36" class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
      </div>
      <div class="stat-card rose">
        <div class="stat-card-label">Scheduled Jobs</div>
        <div class="stat-card-value">${stats.cron_jobs}</div>
        <div class="stat-card-sub">Active</div>
        <svg width="36" height="36" class="stat-card-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
      </div>
    `;
    drawChart(stats);
  } catch (e) {
    grid.innerHTML = `<div class="error-state">Failed to load stats: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

async function loadQuickInfo(): Promise<void> {
  const el = document.getElementById("quick-info")!;
  try {
    const stats = await apiGet<SystemStats>("/stats");
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem;font-size:0.875rem;">
        <div style="display:flex;justify-content:space-between;color:var(--text-secondary);">
          <span>System Uptime</span>
          <span style="color:var(--text-primary);font-weight:500;">${formatUptime(stats.uptime)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:var(--text-secondary);">
          <span>CPU Cores</span>
          <span style="color:var(--text-primary);font-weight:500;">${stats.cpu.cores}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:var(--text-secondary);">
          <span>Disk Usage</span>
          <span style="color:var(--text-primary);font-weight:500;">${stats.disk.percent.toFixed(0)}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:var(--text-secondary);">
          <span>Memory</span>
          <span style="color:var(--text-primary);font-weight:500;">${stats.memory.percent.toFixed(0)}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:var(--text-secondary);">
          <span>Sessions Today</span>
          <span style="color:var(--text-primary);font-weight:500;">${stats.sessions_today}</span>
        </div>
        <div style="display:flex;justify-content:space-between;color:var(--text-secondary);">
          <span>Running Containers</span>
          <span style="color:var(--text-primary);font-weight:500;">${stats.containers_running}</span>
        </div>
      </div>
    `;
  } catch {
    el.innerHTML = `<div class="error-state">Failed to load</div>`;
  }
}

function drawChart(stats: SystemStats): void {
  const canvas = document.getElementById("resource-chart") as HTMLCanvasElement | null;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const cpuPercent = Math.min(stats.cpu.usage, 100);
  const memPercent = Math.min(stats.memory.percent, 100);
  const barWidth = w * 0.3;
  const gap = w * 0.08;
  const totalWidth = barWidth * 2 + gap;
  const startX = (w - totalWidth) / 2;
  const bottomMargin = 40;
  const topMargin = 30;
  const drawH = h - bottomMargin - topMargin;

  // Background grid line
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = topMargin + drawH - (pct / 100) * drawH;
    ctx.beginPath();
    ctx.moveTo(10, y);
    ctx.lineTo(w - 10, y);
    ctx.stroke();
    ctx.fillStyle = "rgba(148,163,184,0.5)";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(pct + "%", 8, y + 3);
  }
  ctx.setLineDash([]);

  // CPU bar
  const cpuX = startX;
  const cpuH = (cpuPercent / 100) * drawH;
  const cpuY = topMargin + drawH - cpuH;

  const cpuGrad = ctx.createLinearGradient(cpuX, cpuY, cpuX, topMargin + drawH);
  cpuGrad.addColorStop(0, "rgba(139,92,246,0.9)");
  cpuGrad.addColorStop(1, "rgba(139,92,246,0.3)");
  ctx.fillStyle = cpuGrad;
  ctx.beginPath();
  ctx.roundRect(cpuX, cpuY, barWidth, cpuH, [4, 4, 0, 0]);
  ctx.fill();

  // CPU label
  ctx.fillStyle = "rgba(148,163,184,0.8)";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CPU", cpuX + barWidth / 2, h - 10);

  // CPU value
  ctx.fillStyle = "#a78bfa";
  ctx.font = "bold 13px Inter, sans-serif";
  ctx.fillText(cpuPercent.toFixed(1) + "%", cpuX + barWidth / 2, cpuY - 6);

  // Memory bar
  const memX = startX + barWidth + gap;
  const memH = (memPercent / 100) * drawH;
  const memY = topMargin + drawH - memH;

  const memGrad = ctx.createLinearGradient(memX, memY, memX, topMargin + drawH);
  memGrad.addColorStop(0, "rgba(6,182,212,0.9)");
  memGrad.addColorStop(1, "rgba(6,182,212,0.3)");
  ctx.fillStyle = memGrad;
  ctx.beginPath();
  ctx.roundRect(memX, memY, barWidth, memH, [4, 4, 0, 0]);
  ctx.fill();

  // Memory label
  ctx.fillStyle = "rgba(148,163,184,0.8)";
  ctx.font = "11px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Memory", memX + barWidth / 2, h - 10);

  // Memory value
  ctx.fillStyle = "#22d3ee";
  ctx.font = "bold 13px Inter, sans-serif";
  ctx.fillText(memPercent.toFixed(0) + "%", memX + barWidth / 2, memY - 6);
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}
