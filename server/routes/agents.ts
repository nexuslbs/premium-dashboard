import { Router } from "express";
import { queryAgentDb } from "../db.js";

export const agentsRouter = Router();

// ── Helper: shell-quote SQL value ──
function sq(val: string): string {
  return "'" + val.replace(/'/g, "''") + "'";
}

// ── GET /api/agents/filters — Distinct filter values ──
agentsRouter.get("/filters", (_req, res) => {
  try {
    // Sessions with event counts
    const sessions = queryAgentDb(`
      SELECT session_id, COUNT(*) as count
      FROM agent_interactions
      GROUP BY session_id
      ORDER BY count DESC
    `);

    // Distinct types
    const types = queryAgentDb(`
      SELECT DISTINCT type FROM agent_interactions ORDER BY type
    `);

    // Distinct subtypes (non-null)
    const subtypes = queryAgentDb(`
      SELECT DISTINCT subtype FROM agent_interactions WHERE subtype IS NOT NULL AND subtype != '' ORDER BY subtype
    `);

    // Agents from role_map grouped by unique role, plus hermes + user
    const agents = queryAgentDb(`
      SELECT arm.role, 'all' as session_id, SUM(sub.cnt) as count
      FROM agent_role_map arm
      JOIN (
        SELECT session_id, COUNT(*) as cnt
        FROM agent_interactions
        GROUP BY session_id
      ) sub ON sub.session_id = arm.session_id
      GROUP BY arm.role
      UNION ALL
      SELECT 'hermes' as role, 'all' as session_id, SUM(sub.cnt) as count
      FROM (
        SELECT ai.session_id, COUNT(*) as cnt
        FROM agent_interactions ai
        WHERE ai.session_id NOT IN (SELECT session_id FROM agent_role_map)
          AND ai.from_entity != 'user'
        GROUP BY ai.session_id
      ) sub
      UNION ALL
      SELECT 'user' as role, 'all' as session_id, COUNT(*) as count
      FROM agent_interactions
      WHERE from_entity = 'user'
      ORDER BY role
    `);

    // Distinct providers
    const providers = queryAgentDb(`
      SELECT DISTINCT provider FROM agent_interactions WHERE provider IS NOT NULL AND provider != '' ORDER BY provider
    `);

    // Distinct models
    const models = queryAgentDb(`
      SELECT DISTINCT model FROM agent_interactions WHERE model IS NOT NULL AND model != '' ORDER BY model
    `);

    res.json({
      sessions: (sessions || []).map((r: any) => ({
        session_id: r.session_id,
        count: r.count,
      })),
      types: (types || []).map((r: any) => r.type),
      subtypes: (subtypes || []).map((r: any) => r.subtype),
      agents: (agents || []).map((r: any) => ({
        role: r.role,
        session_id: r.session_id,
        count: r.count,
      })),
      providers: (providers || []).map((r: any) => r.provider),
      models: (models || []).map((r: any) => r.model),
    });
  } catch (e: any) {
    console.error("Agents filters error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/agents/events — Flat event list with filtering ──
agentsRouter.get("/events", (req, res) => {
  try {
    // Parse query params
    const agentParam = req.query.agent;
    const sessionParam = (req.query.session as string) || "all";
    const typeParam = req.query.type;
    const subtypeParam = (req.query.subtype as string) || "";
    const providerParam = (req.query.provider as string) || "all";
    const modelParam = (req.query.model as string) || "all";
    const limit = Math.min(parseInt((req.query.limit as string) || "200", 10), 1000);
    const offset = parseInt((req.query.offset as string) || "0", 10);

    // Build WHERE clauses
    const conditions: string[] = [];

    // Origin filter param
    const originParam = (req.query.origin as string) || "all";

    // Message_id filter param
    const messageIdParam = (req.query.message_id as string) || "all";

    // Agent filter
    const agentValues: string[] = Array.isArray(agentParam)
      ? (agentParam as string[])
      : agentParam && agentParam !== "all"
        ? [agentParam as string]
        : [];
    if (agentValues.length > 0) {
      const quoted = agentValues.map((a) => sq(a));
      conditions.push(`CASE WHEN ai.from_entity = 'user' THEN 'user' ELSE COALESCE(arm.role, 'hermes') END IN (${quoted.join(",")})`);
    }

    // Session filter
    if (sessionParam && sessionParam !== "all") {
      conditions.push(`ai.session_id = ${sq(sessionParam)}`);
    }

    // Type filter
    const typeValues: string[] = Array.isArray(typeParam)
      ? (typeParam as string[])
      : typeParam && typeParam !== "all"
        ? [typeParam as string]
        : [];
    if (typeValues.length > 0) {
      const quoted = typeValues.map((t) => sq(t));
      conditions.push(`ai.type IN (${quoted.join(",")})`);
    }

    // Origin filter
    if (originParam !== "all") {
      conditions.push(`ai.origin = ${sq(originParam)}`);
    }

    // Message_id filter
    if (messageIdParam === "null") {
      conditions.push("ai.message_id IS NULL");
    } else if (messageIdParam === "non-null") {
      conditions.push("ai.message_id IS NOT NULL");
    }

    // Subtype filter (LIKE search)
    if (subtypeParam && subtypeParam.trim() !== "") {
      conditions.push(`ai.subtype LIKE '%${subtypeParam.replace(/'/g, "''")}%'`);
    }

    // Provider filter
    if (providerParam && providerParam !== "all") {
      conditions.push(`ai.provider = ${sq(providerParam)}`);
    }

    // Model filter
    if (modelParam && modelParam !== "all") {
      conditions.push(`ai.model = ${sq(modelParam)}`);
    }

    const whereClause =
      conditions.length > 0 ? "WHERE " + conditions.join(" AND ") : "";

    // Get total count
    const countRows = queryAgentDb(`
      SELECT COUNT(*) as total
      FROM agent_interactions ai
      LEFT JOIN agent_role_map arm ON ai.session_id = arm.session_id
      ${whereClause}
    `);
    const total = (countRows && countRows.length > 0 ? countRows[0].total : 0) as number;

    // Get events
    const events = queryAgentDb(`
      SELECT
        ai.id,
        ai.timestamp,
        ai.session_id,
        CASE
          WHEN ai.from_entity = 'user' THEN 'user'
          ELSE COALESCE(arm.role, 'hermes')
        END as agent_role,
        ai.origin,
        ai.type,
        ai.subtype,
        ai.from_entity,
        COALESCE(ai.to_entity, '') as to_entity,
        ai.provider,
        ai.model,
        ai.content,
        ai.metadata
      FROM agent_interactions ai
      LEFT JOIN agent_role_map arm ON ai.session_id = arm.session_id
      ${whereClause}
      ORDER BY ai.timestamp DESC, ai.id DESC
      LIMIT ${parseInt(String(limit), 10)}
      OFFSET ${parseInt(String(offset), 10)}
    `);

    res.json({
      events: events || [],
      total,
      offset,
      limit,
    });
  } catch (e: any) {
    console.error("Agents events error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/agents/summary — Overall agent system summary ──
agentsRouter.get("/summary", (_req, res) => {
  try {
    const rows = queryAgentDb(`
      SELECT COUNT(DISTINCT session_id) AS total_sessions,
             COUNT(*) AS total_events,
             COUNT(DISTINCT type) AS type_count,
             MIN(timestamp) AS oldest_event,
             MAX(timestamp) AS newest_event
      FROM agent_interactions
    `);
    const data = (rows && rows.length > 0) ? rows[0] : {
      total_sessions: 0,
      total_events: 0,
      type_count: 0,
      oldest_event: null,
      newest_event: null,
    };
    res.json(data);
  } catch (e: any) {
    console.error("Agents summary error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/agents/:sessionId — Legacy: Full event list for one session ──
agentsRouter.get("/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId) {
      res.status(400).json({ error: "Session ID is required" });
      return;
    }
    const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "");
    if (safeId !== sessionId) {
      res.status(400).json({ error: "Invalid session ID" });
      return;
    }
    const rows = queryAgentDb(
      `SELECT * FROM agent_interactions WHERE session_id = '${safeId.replace(/'/g, "''")}' ORDER BY id ASC`,
    );
    res.json(rows || []);
  } catch (e: any) {
    console.error("Agent session events error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
