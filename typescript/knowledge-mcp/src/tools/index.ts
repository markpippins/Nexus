import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { callKnowledgeJson } from "../db/client.js";

const execFileAsync = promisify(execFile);

function qs(args: Record<string, any>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export function registerTools(server: McpServer) {

  // ── ENTITIES ──────────────────────────────────────────────────────

  server.tool(
    "knowledge_list_entities",
    "List knowledge graph entities with optional filters by section, entity_type, or status.",
    {
      section: z.string().optional().describe("Filter by section (e.g. 'types', 'actors', 'decisions', 'rules')"),
      entity_type: z.string().optional().describe("Filter by entity type"),
      status: z.string().optional().describe("Filter by status"),
      search: z.string().optional().describe("Full-text search across name and description"),
      limit: z.number().min(1).max(500).optional().default(100).describe("Max results (1-500)"),
      offset: z.number().min(0).optional().default(0).describe("Pagination offset"),
    },
    async (args) => {
      const data = await callKnowledgeJson(`/knowledge/entities${qs(args)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "knowledge_get_entity",
    "Get a single knowledge graph entity by section and entity_id, including its full properties JSON.",
    {
      section: z.string().describe("Section (e.g. 'types', 'actors', 'decisions')"),
      entity_id: z.string().describe("Entity ID within the section"),
    },
    async (args) => {
      try {
        const data = await callKnowledgeJson(`/knowledge/entities/${encodeURIComponent(args.section)}/${encodeURIComponent(args.entity_id)}`);
        return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
      } catch (err: any) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: err?.message ?? String(err) }, null, 2) }] };
      }
    }
  );

  // ── EDGES / RELATIONS ─────────────────────────────────────────────

  server.tool(
    "knowledge_list_edges",
    "List knowledge graph edges with optional filters by source, target, or relation type.",
    {
      source_section: z.string().optional().describe("Filter by source section"),
      source_id: z.string().optional().describe("Filter by source entity ID"),
      target_section: z.string().optional().describe("Filter by target section"),
      target_id: z.string().optional().describe("Filter by target entity ID"),
      relation_type: z.string().optional().describe("Filter by relation type (e.g. 'produces', 'consumes', 'governed_by', 'references', 'depends_on')"),
      limit: z.number().min(1).max(500).optional().default(100).describe("Max results (1-500)"),
      offset: z.number().min(0).optional().default(0).describe("Pagination offset"),
    },
    async (args) => {
      const data = await callKnowledgeJson(`/knowledge/edges${qs(args)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.tool(
    "knowledge_get_entity_relations",
    "Get all relationships (inbound and outbound) for a specific entity by section + entity_id.",
    {
      section: z.string().describe("Section (e.g. 'types', 'actors')"),
      entity_id: z.string().describe("Entity ID"),
    },
    async (args) => {
      const data = await callKnowledgeJson(
        `/knowledge/entities/${encodeURIComponent(args.section)}/${encodeURIComponent(args.entity_id)}/relations`
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── CROSS REFERENCES ──────────────────────────────────────────────

  server.tool(
    "knowledge_list_cross_references",
    "List cross-reference mappings between knowledge graph entities.",
    {
      map_name: z.string().optional().describe("Filter by map name"),
      source_section: z.string().optional().describe("Filter by source section"),
      target_id: z.string().optional().describe("Filter by target ID"),
      limit: z.number().min(1).max(500).optional().default(100).describe("Max results"),
      offset: z.number().min(0).optional().default(0).describe("Pagination offset"),
    },
    async (args) => {
      const data = await callKnowledgeJson(`/knowledge/cross-references${qs(args)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── MIGRATIONS ────────────────────────────────────────────────────

  server.tool(
    "knowledge_list_migrations",
    "List the migration history of knowledge graph imports.",
    {
      limit: z.number().min(1).max(100).optional().default(20).describe("Max results"),
    },
    async (args) => {
      const data = await callKnowledgeJson(`/knowledge/migrations${qs(args)}`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── SUMMARY ───────────────────────────────────────────────────────

  server.tool(
    "knowledge_graph_summary",
    "Get summary statistics across all knowledge graph tables — entity counts by section, edge counts by relation type, total migrations.",
    {},
    async () => {
      const data = await callKnowledgeJson(`/knowledge/summary`);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
    }
  );

  // ── UNIFIED SEMANTIC SEARCH (still hits a Python subprocess) ───────
  // This tool does NOT run SQL; it shells out to bin/unified_semantic_search.py.
  // Keeping it in the MCP because it's a Python pipeline, not a Postgres query.

  server.tool(
    "knowledge_semantic_search",
    "Unified semantic search across both knowledge.graph_entity_embeddings (curated) and nebula.harvest_candidate_embeddings (harvested) using cosine similarity via nomic-embed-text. Returns merged results with provenance labels.",
    {
      query: z.string().describe("Search query string (e.g. 'TypeSpec contract architecture')"),
      limit: z.number().min(1).max(50).optional().default(15).describe("Max results (1-50)"),
    },
    async (args) => {
      const scriptPath = "/home/codex/dev/nexus/bin/unified_semantic_search.py";
      const pythonBin = "/home/codex/dev/nexus/python/rover/.venv/bin/python3";

      try {
        const { stdout, stderr } = await execFileAsync(
          pythonBin,
          [scriptPath, args.query, "--limit", String(args.limit), "--json"],
          { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
        );

        if (stderr) console.error("[knowledge_semantic_search] stderr:", stderr);

        let result;
        try { result = JSON.parse(stdout); }
        catch {
          return {
            content: [{ type: "text" as const, text: JSON.stringify({ error: "Failed to parse search results", raw: stdout.slice(0, 500) }, null, 2) }],
          };
        }

        return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
      } catch (err: any) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: "Semantic search failed", message: err?.message ?? String(err), hint: "Ensure Ollama is running with nomic-embed-text and the rover venv has httpx installed" }, null, 2) }],
        };
      }
    }
  );
}
