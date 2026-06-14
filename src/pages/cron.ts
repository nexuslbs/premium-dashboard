import { apiGet, type CronJob } from "../lib/api";
import { router } from "../lib/router";

export function renderCron(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedules</h1>
        <p class="page-subtitle">Scheduled cron jobs</p>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Active Jobs</span></div>
      <div class="card-body" id="cron-table">
        <div class="loading">Loading schedules</div>
      </div>
    </div>
  `;

  loadCronJobs();
}

async function loadCronJobs(): Promise<void> {
  const el = document.getElementById("cron-table")!;
  try {
    const jobs = await apiGet<CronJob[]>("/cron");
    if (jobs.length === 0) {
      el.innerHTML = `<div class="empty-state">No scheduled jobs</div>`;
      return;
    }
    el.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Schedule</th>
              <th>Last Run</th>
              <th>Next Run</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${jobs
              .map(
                (j) => `
              <tr class="clickable-row" data-cron-id="${escapeHtml(j.id)}">
                <td style="color:var(--text-primary);font-weight:500;">${escapeHtml(j.name || j.id)}</td>
                <td><code style="background:var(--bg-card);padding:0.125rem 0.375rem;border-radius:3px;font-size:0.75rem;">${escapeHtml(j.schedule)}</code></td>
                <td>${formatDate(j.last_run)}</td>
                <td>${formatDate(j.next_run)}</td>
                <td><span class="badge ${j.status === "active" ? "badge-success" : j.status === "paused" ? "badge-warning" : "badge-neutral"}">${j.status}</span></td>
              </tr>
            `,
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    // Add click handlers to each row
    document.querySelectorAll("#cron-table .clickable-row").forEach((row) => {
      row.addEventListener("click", (e) => {
        const cronId = (row as HTMLElement).getAttribute("data-cron-id");
        if (cronId) {
          history.pushState({}, "", `/cron/${encodeURIComponent(cronId)}`);
          router.go(`cron/${encodeURIComponent(cronId)}`);
        }
      });
    });
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load schedules: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

// ── Cron job detail view ──

export async function renderCronDetail(
  container: HTMLElement,
  cronId: string,
): Promise<void> {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Schedule Details</h1>
        <p class="page-subtitle">Job: ${escapeHtml(cronId)}</p>
      </div>
      <div>
        <a href="/cron" class="back-link" id="back-to-cron">← Back to Schedules</a>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><span class="card-title">Job Info</span></div>
      <div class="card-body" id="cron-detail">
        <div class="loading">Loading job details</div>
      </div>
    </div>
  `;

  // Wire up the back button
  const backLink = document.getElementById("back-to-cron");
  if (backLink) {
    backLink.addEventListener("click", (e) => {
      e.preventDefault();
      history.pushState({}, "", "/cron");
      router.go("cron");
    });
  }

  await loadCronDetail(cronId);
}

async function loadCronDetail(cronId: string): Promise<void> {
  const el = document.getElementById("cron-detail")!;
  try {
    const jobs = await apiGet<CronJob[]>("/cron");
    const job = jobs.find((j) => j.id === cronId);
    if (!job) {
      el.innerHTML = `<div class="error-state">Job not found: ${escapeHtml(cronId)}</div>`;
      return;
    }

    // Check if a script file exists for this job
    let scriptFileExists = false;
    if (job.script) {
      try {
        const resp = await fetch(`/api/fs/read?path=${encodeURIComponent(job.script)}`);
        scriptFileExists = resp.ok;
      } catch {
        scriptFileExists = false;
      }
    }

    const lastStatusBadge = (status: string | null) => {
      if (!status) return '<span class="badge badge-neutral">—</span>';
      if (status === "completed" || status === "success")
        return '<span class="badge badge-success">Completed</span>';
      if (status === "failed" || status === "error")
        return '<span class="badge badge-error">Failed</span>';
      return `<span class="badge badge-neutral">${escapeHtml(status)}</span>`;
    };

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
        <div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Name</div>
            <div style="color:var(--text-primary);font-weight:500;">${escapeHtml(job.name || job.id)}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Schedule</div>
            <code style="background:var(--bg-card);padding:0.25rem 0.5rem;border-radius:3px;font-size:0.8rem;">${escapeHtml(job.schedule)}</code>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Status</div>
            <span class="badge ${job.status === "active" ? "badge-success" : job.status === "paused" ? "badge-warning" : "badge-neutral"}">${job.status}</span>
          </div>
          ${job.last_status !== null && job.last_status !== undefined ? `
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Last Run Status</div>
            ${lastStatusBadge(job.last_status)}
          </div>` : ""}
        </div>
        <div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Last Run</div>
            <div style="color:var(--text-secondary);">${formatDate(job.last_run)}</div>
          </div>
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Next Run</div>
            <div style="color:var(--text-secondary);">${formatDate(job.next_run)}</div>
          </div>
          ${job.script ? `
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Script</div>
            ${scriptFileExists
              ? `<a href="/search?file=${encodeURIComponent(job.script)}" style="color:var(--accent-cyan);text-decoration:none;font-size:0.8125rem;word-break:break-all;">${escapeHtml(job.script)}</a>`
              : `<div style="color:var(--text-secondary);font-size:0.8125rem;word-break:break-all;">${escapeHtml(job.script)}</div>`
            }
          </div>` : ""}
          ${job.no_agent ? `
          <div style="margin-bottom:0.75rem;">
            <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Mode</div>
            <span class="badge badge-info">No agent (script-only)</span>
          </div>` : ""}
        </div>
      </div>
      ${job.skills && job.skills.length > 0 ? `
      <div style="margin-top:1rem;border-top:1px solid var(--border-primary);padding-top:0.75rem;">
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.5rem;">Skills</div>
        <div style="display:flex;flex-wrap:wrap;gap:0.375rem;">
          ${job.skills.map((s) => `<span class="badge badge-info">${escapeHtml(s)}</span>`).join("")}
        </div>
      </div>` : ""}
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Failed to load job: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
