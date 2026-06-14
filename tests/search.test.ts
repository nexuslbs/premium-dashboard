// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ── Polyfill CSS.escape (missing in jsdom) ──────────────────────────────────
beforeAll(() => {
  if (typeof CSS === "undefined") {
    (globalThis as Record<string, unknown>).CSS = {} as Record<string, unknown>;
  }
  if (typeof CSS.escape !== "function") {
    CSS.escape = (str: string): string =>
      str.replace(/[!"#$%&'()*+,./:;<=>?@[\]^`{|}~\\ ]/g, (c) => `\\${c}`);
  }
});

// ── Mock external dependencies ──────────────────────────────────────────────
// These vi.mock calls are hoisted above imports by vitest.
vi.mock("../src/lib/api", () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}));

vi.mock("highlight.js", () => ({
  default: {
    configure: vi.fn(),
    getLanguage: vi.fn(() => true),
    highlight: vi.fn(() => ({ value: "" })),
    highlightAuto: vi.fn(() => ({ value: "" })),
  },
}));

vi.mock("marked", () => ({
  marked: {
    parse: vi.fn((text: string) => `<p>${text}</p>`),
    use: vi.fn(),
  },
  Renderer: vi.fn().mockImplementation(() => ({ table: vi.fn() })),
}));

vi.mock("marked-highlight", () => ({
  markedHighlight: vi.fn(() => () => {}),
}));

// ── Test-scoped module references ───────────────────────────────────────────
// These are set in beforeEach via dynamic import (after resetModules)
let apiGet: ReturnType<typeof vi.fn>;
let apiPost: ReturnType<typeof vi.fn>;
let renderSearch: (container: HTMLElement) => void;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function waitForDom(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

// ── Suite ───────────────────────────────────────────────────────────────────
describe("Search page features", () => {
  let container: HTMLElement;

  beforeEach(async () => {
    // Reset module registry so lastOpenedFile and other module-level state
    // are reinitialised for each test.
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();

    // Fresh-import both the API module and the search page module.
    // (The vi.mock factory above still applies after resetModules.)
    const apiMod = await import("../src/lib/api");
    apiGet = apiMod.apiGet as ReturnType<typeof vi.fn>;
    apiPost = apiMod.apiPost as ReturnType<typeof vi.fn>;
    const searchMod = await import("../src/pages/search");
    renderSearch = searchMod.renderSearch;

    // Reset URL to a clean state
    window.history.replaceState({}, "", "/search");

    // Fresh DOM
    document.body.innerHTML = `
      <div id="main-content"></div>
      <div id="app"></div>
    `;
    container = document.getElementById("app")!;

    // ── Default API mocks ────────────────────────────────────────────────
    // Tree listing: single "wiki" directory at root
    apiGet.mockImplementation((path: string) => {
      if (path.startsWith("/fs/list")) {
        return Promise.resolve({
          entries: [
            { name: "wiki", path: "/wiki", type: "directory", size: null },
          ],
          path: "/",
        });
      }
      if (path.startsWith("/fs/read")) {
        const filePath = decodeURIComponent(path.replace("/fs/read?path=", ""));
        return Promise.resolve({ content: "# Test\nContent.", size: 42, path: filePath });
      }
      return Promise.reject(new Error(`Unexpected apiGet: ${path}`));
    });

    // Search returns empty by default
    apiPost.mockResolvedValue([]);

    // Clipboard API
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  1. lastOpenedFile restoration
  // ═════════════════════════════════════════════════════════════════════════

  describe("lastOpenedFile restoration", () => {
    it("restores the last opened file when search query becomes empty", async () => {
      renderSearch(container);
      await waitForDom(); // let tree load finish

      const input = document.getElementById("search-input") as HTMLInputElement;

      // ── Open a file via search result click ────────────────────────
      apiPost.mockResolvedValue([
        {
          file_path: "wiki/test.md",
          section_title: "Test Article",
          score: 0.95,
          content_preview: "Some preview text.",
          url: "/wiki/test.md",
        },
      ]);

      input.value = "test";
      input.dispatchEvent(new Event("input", { bubbles: true }));

      // Advance past the 300 ms debounce
      await vi.advanceTimersByTimeAsync(350);
      await waitForDom();

      // Click the search result
      const result = document.querySelector<HTMLElement>(".search-result-item");
      expect(result).not.toBeNull();
      result!.click();
      await waitForDom();

      // Sanity: openFile should have called apiGet for the file read
      const readCalls = apiGet.mock.calls.filter(
        (c: string[]) => c[0].startsWith("/fs/read"),
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);
      const lastReadPath = readCalls[readCalls.length - 1][0] as string;
      expect(lastReadPath).toContain(
        encodeURIComponent("/opt/data/wiki/wiki/test.md"),
      );

      // ── Clear the search input ────────────────────────────────────
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await waitForDom();

      // restoreLastFile() should have called openFile(lastOpenedFile) again
      const readCalls2 = apiGet.mock.calls.filter(
        (c: string[]) => c[0].startsWith("/fs/read"),
      );
      expect(readCalls2.length).toBeGreaterThanOrEqual(2);
      const restoredPath = readCalls2[readCalls2.length - 1][0] as string;
      expect(restoredPath).toContain(
        encodeURIComponent("/opt/data/wiki/wiki/test.md"),
      );
    });

    it("shows the empty state when lastOpenedFile is null", async () => {
      renderSearch(container);
      await waitForDom();

      const input = document.getElementById("search-input") as HTMLInputElement;

      // Type something then clear to trigger restoreLastFile with null
      input.value = "ab";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await waitForDom();

      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await waitForDom();

      // When lastOpenedFile is null, the empty state is shown
      const contentView = document.getElementById("content-view")!;
      expect(contentView.innerHTML).toContain("Select a file to view");
    });

    it("persists the file path in URL via history.replaceState", async () => {
      // Spy on replaceState
      const replaceSpy = vi.spyOn(history, "replaceState");

      renderSearch(container);
      await waitForDom();

      // Open a file via search
      apiPost.mockResolvedValue([
        {
          file_path: "wiki/url-test.md",
          section_title: "URL Test",
          score: 0.9,
          content_preview: "URL persistence test.",
          url: "/wiki/url-test.md",
        },
      ]);

      const input = document.getElementById("search-input") as HTMLInputElement;
      input.value = "url";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await waitForDom();

      const result = document.querySelector<HTMLElement>(".search-result-item");
      result!.click();
      await waitForDom();

      // Check that replaceState was called with the file path
      const fileCalls = replaceSpy.mock.calls.filter(
        (call) => call[0] && typeof call[0] === "object" && "file" in call[0],
      );
      expect(fileCalls.length).toBeGreaterThanOrEqual(1);
      const fileArg = (fileCalls[0][0] as { file: string }).file;
      expect(fileArg).toBe("/opt/data/wiki/wiki/url-test.md");
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  2. Clear search button
  // ═════════════════════════════════════════════════════════════════════════

  describe("Clear search button", () => {
    it("toggles visibility based on input content", async () => {
      renderSearch(container);
      await waitForDom();

      const input = document.getElementById("search-input") as HTMLInputElement;
      const clearBtn = document.getElementById("search-clear") as HTMLButtonElement;

      // Initially hidden (no text in input)
      expect(clearBtn.style.display).toBe("none");

      // Type text → button becomes visible
      input.value = "hello";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(clearBtn.style.display).toBe("flex");

      // Click clear → button hidden, input empty, input focused
      clearBtn.click();
      expect(input.value).toBe("");
      expect(clearBtn.style.display).toBe("none");
      expect(document.activeElement).toBe(input);
    });

    it("calls restoreLastFile when clicked", async () => {
      renderSearch(container);
      await waitForDom();

      const input = document.getElementById("search-input") as HTMLInputElement;
      const clearBtn = document.getElementById("search-clear") as HTMLButtonElement;

      // Open a file first to set lastOpenedFile
      apiPost.mockResolvedValue([
        {
          file_path: "wiki/hello.md",
          section_title: "Hello",
          score: 0.9,
          content_preview: "Hello world.",
          url: "/wiki/hello.md",
        },
      ]);

      input.value = "hello";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await waitForDom();

      const result = document.querySelector<HTMLElement>(".search-result-item");
      result!.click();
      await waitForDom();

      // Grab the apiGet read URL from the last call
      const readCalls = apiGet.mock.calls.filter((c: string[]) =>
        c[0].startsWith("/fs/read"),
      );
      expect(readCalls.length).toBeGreaterThanOrEqual(1);
      const lastPathParam = readCalls[readCalls.length - 1][0] as string;

      // Clear mock calls so we can detect new ones
      apiGet.mockClear();

      // Click clear button — should restore the last opened file
      clearBtn.click();
      await waitForDom();

      const newReadCalls = apiGet.mock.calls.filter((c: string[]) =>
        c[0].startsWith("/fs/read"),
      );
      expect(newReadCalls.length).toBeGreaterThanOrEqual(1);
      expect(newReadCalls[newReadCalls.length - 1][0]).toBe(lastPathParam);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  3. Copy file path to clipboard
  // ═════════════════════════════════════════════════════════════════════════

  describe("Copy file path to clipboard", () => {
    it("copies the file path on .file-path click", async () => {
      renderSearch(container);
      await waitForDom();

      // Open a file via search
      apiPost.mockResolvedValue([
        {
          file_path: "wiki/copy-test.md",
          section_title: "Copy Test",
          score: 0.8,
          content_preview: "Testing copy to clipboard.",
          url: "/wiki/copy-test.md",
        },
      ]);

      const input = document.getElementById("search-input") as HTMLInputElement;
      input.value = "copy";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await waitForDom();

      const result = document.querySelector<HTMLElement>(".search-result-item");
      result!.click();
      await waitForDom();

      // The file content should now contain .file-path
      const contentView = document.getElementById("content-view")!;
      const filePathEl = contentView.querySelector<HTMLElement>(".file-path");
      expect(filePathEl).not.toBeNull();

      const expectedPath = "/opt/data/wiki/wiki/copy-test.md";
      expect(filePathEl!.textContent).toBe(expectedPath);

      // Spy on clipboard
      const writeSpy = vi.mocked(navigator.clipboard.writeText);

      // Click the file path element
      filePathEl!.click();

      // Clipboard should be called with the correct path
      expect(writeSpy).toHaveBeenCalledWith(expectedPath);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════
  //  4. Search result click handling
  // ═════════════════════════════════════════════════════════════════════════

  describe("Search result click handling", () => {
    it("opens the correct file when .search-result-item is clicked", async () => {
      renderSearch(container);
      await waitForDom();

      apiPost.mockResolvedValue([
        {
          file_path: "wiki/doc1.md",
          section_title: "Document 1",
          score: 0.95,
          content_preview: "Content of doc 1.",
          url: "/wiki/doc1.md",
        },
        {
          file_path: "wiki/doc2.md",
          section_title: "Document 2",
          score: 0.85,
          content_preview: "Content of doc 2.",
          url: "/wiki/doc2.md",
        },
      ]);

      const input = document.getElementById("search-input") as HTMLInputElement;
      input.value = "document";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await waitForDom();

      const items = document.querySelectorAll<HTMLElement>(".search-result-item");
      expect(items.length).toBe(2);

      // ── Click first result ───────────────────────────────────────────
      const path1 = items[0].dataset.path!;
      items[0].click();
      await waitForDom();

      const readCalls1 = apiGet.mock.calls.filter((c: string[]) =>
        c[0].startsWith("/fs/read"),
      );
      expect(readCalls1.length).toBeGreaterThanOrEqual(1);
      const call1 = readCalls1[readCalls1.length - 1][0] as string;
      expect(call1).toContain(encodeURIComponent("/opt/data/wiki/" + path1));

      // ── Click second result ──────────────────────────────────────────
      const path2 = items[1].dataset.path!;
      items[1].click();
      await waitForDom();

      const readCalls2 = apiGet.mock.calls.filter((c: string[]) =>
        c[0].startsWith("/fs/read"),
      );
      expect(readCalls2.length).toBeGreaterThanOrEqual(2);
      const call2 = readCalls2[readCalls2.length - 1][0] as string;
      expect(call2).toContain(encodeURIComponent("/opt/data/wiki/" + path2));
    });

    it("sends the correct search request to the API", async () => {
      renderSearch(container);
      await waitForDom();

      apiPost.mockResolvedValue([
        {
          file_path: "wiki/alpha.md",
          section_title: "Alpha",
          score: 0.99,
          content_preview: "Alpha content preview.",
          url: "/wiki/alpha.md",
        },
      ]);

      const input = document.getElementById("search-input") as HTMLInputElement;
      input.value = "alpha";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await waitForDom();

      // API called with correct params
      expect(apiPost).toHaveBeenCalledWith("/wiki-search", { query: "alpha", limit: 10 });

      // Results rendered in DOM
      const contentView = document.getElementById("content-view")!;
      expect(contentView.textContent).toContain("Alpha");
      expect(contentView.textContent).toContain("99%");
      expect(contentView.textContent).toContain("wiki/alpha.md");
    });

    it("shows 'No results found' when the API returns an empty array", async () => {
      renderSearch(container);
      await waitForDom();

      apiPost.mockResolvedValue([]);

      const input = document.getElementById("search-input") as HTMLInputElement;
      input.value = "nonexistent";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await waitForDom();

      const contentView = document.getElementById("content-view")!;
      expect(contentView.textContent).toContain("No results found");
    });

    it("handles search API errors gracefully", async () => {
      renderSearch(container);
      await waitForDom();

      apiPost.mockRejectedValue(new Error("Network error"));

      const input = document.getElementById("search-input") as HTMLInputElement;
      input.value = "error";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(350);
      await waitForDom();

      const contentView = document.getElementById("content-view")!;
      expect(contentView.textContent).toContain("Search failed");
      expect(contentView.textContent).toContain("Network error");
    });
  });
});
