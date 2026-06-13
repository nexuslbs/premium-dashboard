import { renderOverview } from "../pages/overview";
import { renderSessions, renderSessionDetail } from "../pages/sessions";
import { renderContainers } from "../pages/containers";
import { renderCron } from "../pages/cron";
import { renderSearch } from "../pages/search";

type PageRenderer = (container: HTMLElement) => void;
type ParamPageRenderer = (container: HTMLElement, param: string) => void;

interface Route {
  name: string;
  handler: PageRenderer;
}

interface ParamRoute {
  prefix: string;
  handler: ParamPageRenderer;
}

const routes: Route[] = [
  { name: "overview", handler: renderOverview },
  { name: "sessions", handler: renderSessions },
  { name: "containers", handler: renderContainers },
  { name: "cron", handler: renderCron },
  { name: "search", handler: renderSearch },
];

const paramRoutes: ParamRoute[] = [
  { prefix: "session/", handler: renderSessionDetail },
];

function createRouter() {
  const content = document.getElementById("main-content")!;

  return {
    go(route: string) {
      // Check parameterized routes first
      for (const pr of paramRoutes) {
        if (route.startsWith(pr.prefix)) {
          const param = route.slice(pr.prefix.length);
          pr.handler(content, param);
          return;
        }
      }

      // Check exact routes
      for (const r of routes) {
        if (r.name === route) {
          r.handler(content);
          return;
        }
      }

      content.innerHTML = `<div class="error-state" style="padding:3rem;text-align:center;"><h2>404</h2><p>Page not found</p></div>`;
    },
  };
}

export const router = createRouter();
