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
    const route = (item as HTMLAnchorElement).getAttribute("data-route") || "overview";
    const url = (item as HTMLAnchorElement).getAttribute("href") || "/";
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    history.pushState({}, "", url);
    router.go(route);
  });
});

// Handle browser back/forward
window.addEventListener("popstate", () => {
  const path = location.pathname.slice(1) || "overview";
  document.querySelectorAll(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.getAttribute("data-route") === path);
  });
  router.go(path);
});

// Initial render
const initialRoute = location.pathname.slice(1) || "overview";
document.querySelectorAll(".nav-item").forEach((n) => {
  n.classList.toggle("active", n.getAttribute("data-route") === initialRoute);
});
router.go(initialRoute);

// Check API connection
checkConnection();
setInterval(checkConnection, 30000);
