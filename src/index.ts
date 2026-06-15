import "./style.css";
import { router } from "./lib/router";
import type { HealthCheck } from "./lib/api";

const API_BASE = "/api";

async function checkConnection(): Promise<void> {
  const statusDot = document.querySelector(".status-dot")!;
  const statusText = document.querySelector(".status-text")!;

  try {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error("Not ready");
    const data: HealthCheck = await res.json();
    statusDot.className = "status-dot connected";
    statusText.textContent = `Connected · ${data.version}`;
  } catch {
    statusDot.className = "status-dot disconnected";
    statusText.textContent = "Disconnected";
  }
}

// SPA navigation
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const route =
      (item as HTMLAnchorElement).getAttribute("data-route") || "overview";
    const url = (item as HTMLAnchorElement).getAttribute("href") || "/";
    document
      .querySelectorAll(".nav-item, .mobile-nav-item")
      .forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    history.pushState({}, "", url);
    router.go(route);
  });
});

// Mobile nav click handlers
document.querySelectorAll(".mobile-nav-item").forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    const route =
      (item as HTMLAnchorElement).getAttribute("data-route") || "overview";
    const url = (item as HTMLAnchorElement).getAttribute("href") || "/";
    document
      .querySelectorAll(".nav-item, .mobile-nav-item")
      .forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    history.pushState({}, "", url);
    router.go(route);
  });
});

// Handle browser back/forward
window.addEventListener("popstate", () => {
  const path = location.pathname.slice(1) || "overview";
  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
    const navRoute = n.getAttribute("data-route") || "";
    // Highlight parent nav for parameterized routes (e.g. "session/xxx" highlights "sessions")
    const isActive = path === navRoute || path.startsWith(navRoute + "/");
    n.classList.toggle("active", isActive);
  });
  router.go(path);
});

// Initial render
const initialRoute = location.pathname.slice(1) || "overview";
document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((n) => {
  const navRoute = n.getAttribute("data-route") || "";
  const isActive =
    initialRoute === navRoute || initialRoute.startsWith(navRoute + "/");
  n.classList.toggle("active", isActive);
});
router.go(initialRoute);

// Check API connection
checkConnection();
setInterval(checkConnection, 30000);

// ── Sidebar toggle ──
const sidebarToggle = document.getElementById("sidebar-toggle");
const sidebarToggleBar = document.getElementById("sidebar-toggle-bar");
const sidebar = document.querySelector(".sidebar");
const layout = document.querySelector(".dashboard-layout");

function toggleSidebar(): void {
  const isCollapsed = sidebar!.classList.toggle("collapsed");
  layout!.classList.toggle("sidebar-collapsed", isCollapsed);
  sidebarToggle!.title = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
  if (sidebarToggleBar) sidebarToggleBar.title = isCollapsed ? "Expand sidebar" : "Collapse sidebar";
  localStorage.setItem("sidebar-collapsed", String(isCollapsed));
}

if (sidebarToggle && sidebar && layout) {
  // Restore saved state
  const collapsed = localStorage.getItem("sidebar-collapsed") === "true";
  if (collapsed) {
    sidebar.classList.add("collapsed");
    layout.classList.add("sidebar-collapsed");
    sidebarToggle.title = "Expand sidebar";
    if (sidebarToggleBar) sidebarToggleBar.title = "Expand sidebar";
  }

  sidebarToggle.addEventListener("click", toggleSidebar);
  if (sidebarToggleBar) sidebarToggleBar.addEventListener("click", toggleSidebar);
}
