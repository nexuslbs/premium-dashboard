import { apiGet, apiPost, type SearchResult } from "../lib/api";

export function renderSearch(container: HTMLElement): void {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Wiki Search</h1>
        <p class="page-subtitle">Semantic search over the Hermes wiki</p>
      </div>
    </div>
    <div class="search-container">
      <div class="search-input-wrapper">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input type="text" class="search-input" id="search-input" placeholder="Search the wiki..." />
      </div>
    </div>
    <div id="search-results"></div>
  `;

  const input = document.getElementById("search-input") as HTMLInputElement;
  let debounce: ReturnType<typeof setTimeout>;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    const query = input.value.trim();
    if (query.length < 2) {
      document.getElementById("search-results")!.innerHTML =
        '<div class="empty-state">Enter a query to search</div>';
      return;
    }
    debounce = setTimeout(() => search(query), 300);
  });
}

async function search(query: string): Promise<void> {
  const el = document.getElementById("search-results")!;
  el.innerHTML = '<div class="loading">Searching</div>';

  try {
    const results = await apiPost<SearchResult[]>("/wiki-search", { query, limit: 5 });
    if (results.length === 0) {
      el.innerHTML = '<div class="empty-state">No results found</div>';
      return;
    }
    el.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        ${results
          .map(
            (r) => `
          <div class="card" style="cursor:pointer;">
            <div class="card-body" style="padding:1rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
                <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);">${escapeHtml(r.section_title)}</span>
                <span class="badge badge-neutral">${(r.score * 100).toFixed(0)}%</span>
              </div>
              <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.375rem;">${escapeHtml(r.file_path)}</div>
              <div style="font-size:0.8125rem;color:var(--text-secondary);line-height:1.5;">${escapeHtml(r.content_preview.slice(0, 300))}</div>
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<div class="error-state">Search failed: ${e instanceof Error ? e.message : "Unknown error"}</div>`;
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
