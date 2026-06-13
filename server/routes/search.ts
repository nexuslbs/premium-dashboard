import { Router } from "express";

export const searchRouter = Router();

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
    // Scroll all points from Qdrant collection and filter by text match
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

    // Filter by case-insensitive substring match on text, file_path, and section_title
    const q = query.toLowerCase();
    const matched = points.filter((p: any) => {
      const payload = p.payload || {};
      const contentPreview = (payload.content_preview || "").toLowerCase();
      const filePath = (payload.file_path || "").toLowerCase();
      const sectionTitle = (payload.section_title || "").toLowerCase();
      return contentPreview.includes(q) || filePath.includes(q) || sectionTitle.includes(q);
    });

    // Sort by relevance: prefer file_path matches, then section_title matches
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
      return {
        file_path: payload.file_path || "",
        section_title: payload.section_title || "",
        score: 0,
        content_preview: contentPreview.substring(0, 200),
      };
    });

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
});
