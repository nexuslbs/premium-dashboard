import { Router } from "express";

export const searchRouter = Router();

interface SearchQuery {
  query: string;
  limit?: number;
}

searchRouter.post("/", (req, res) => {
  const { query } = req.body as SearchQuery;
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: "query is required" });
    return;
  }

  // For now, return mock results
  // In production, this would call wiki-search.py
  const mockResults = [
    {
      file_path: "Reference/FastActions.md",
      section_title: "`commit`",
      score: 0.87,
      content_preview: "Check both repos (hermes-repo and workspace) for unpushed commits. Push each with a single API call using gh-push.py...",
    },
    {
      file_path: "Operations/Recipes.md",
      section_title: "Docker Management",
      score: 0.82,
      content_preview: "Common Docker operations for managing Hermes services stack...",
    },
    {
      file_path: "Reference/Anti-Patterns.md",
      section_title: "Fast Actions Run From Memory",
      score: 0.79,
      content_preview: "When the user said \"commit, wiki, backup, ps\", the agent ran them from memory instead of loading FastActions.md first...",
    },
  ];

  res.json(mockResults);
});
