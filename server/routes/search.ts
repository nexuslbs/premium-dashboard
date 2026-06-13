import { Router } from "express";

export const searchRouter = Router();

const WIKI_BASE = "https://hermes-files.nexuslbs.org/opt/data/wiki";

interface SearchQuery {
  query: string;
  limit?: number;
}

searchRouter.post("/", async (req, res) => {
  const { query, limit = 10 } = req.body as SearchQuery;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "query is required" });
    return;
  }

  try {
    const scrollResponse = await fetch("http://hermes-qdrant:6333/collections/hermes-wiki/points/scroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        limit: 100,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!scrollResponse.ok) {
      throw new Error(`Qdrant scroll returned ${scrollResponse.status}`);
    }

    const scrollData = await scrollResponse.json() as { result?: { points?: any[] } };
    const points = scrollData.result?.points || [];

    // Filter by case-insensitive substring match
    const q = query.toLowerCase();
    const matched = points.filter((p: any) => {
      const payload = p.payload || {};
      const contentPreview = (payload.content_preview || "").toLowerCase();
      const filePath = (payload.file_path || "").toLowerCase();
      const sectionTitle = (payload.section_title || "").toLowerCase();
      return contentPreview.includes(q) || filePath.includes(q) || sectionTitle.includes(q);
    });

    // Sort by relevance
    matched.sort((a: any, b: any) => {
      const ap = a.payload || {};
      const bp = b.payload || {};
      const aFilePath = (ap.file_path || "").toLowerCase().includes(q) ? 1 : 0;
      const bFilePath = (bp.file_path || "").toLowerCase().includes(q) ? 1 : 0;
      const aSection = (ap.section_title || "").toLowerCase().includes(q) ? 1 : 0;
      const bSection = (bp.section_title || "").toLowerCase().includes(q) ? 1 : 0;
      return (bFilePath + bSection) - (aFilePath + aSection);
    });

    const results = matched.slice(0, limit).map((p: any) => {
      const payload = p.payload || {};
      const contentPreview = payload.content_preview || "";
      const filePath = payload.file_path || "";
      // Build wiki URL — strip .md extension for cleaner links
      const wikiUrl = `${WIKI_BASE}/${filePath}`;
      return {
        file_path: filePath,
        section_title: payload.section_title || "",
        score: 0,
        content_preview: contentPreview.substring(0, 200),
        url: wikiUrl,
      };
    });

    res.json(results);
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
