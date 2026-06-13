import { renderOverview } from "../pages/overview";
import { renderSessions } from "../pages/sessions";
import { renderContainers } from "../pages/containers";
import { renderCron } from "../pages/cron";
import { renderSearch } from "../pages/search";

type PageRenderer = (container: HTMLElement) => void;

const routes: Record<string, PageRenderer> = {
  overview: renderOverview,
  sessions: renderSessions,
  containers: renderContainers,
  cron: renderCron,
  search: renderSearch,
};

function createRouter() {
  const content = document.getElementById("main-content")!;

  return {
    go(route: string) {
      const renderer = routes[route];
      if (!renderer) {
        content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;"><h2>404</h2><p>Page not found</p></div>`;
        return;
      }
      renderer(content);
    },
  };
}

export const router = createRouter();
