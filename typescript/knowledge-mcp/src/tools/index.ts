import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";
import { query, queryOne } from "../db/client.js";

const execFileAsync = promisify(execFile);

export function registerTools(server: McpServer) {

  // ════════════════════════════════════════════════════════════════
  //  ENTITIES
  // ════════════════════════════════════════════════════════════════

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
      const conditions: string[] = [];
      const params: any[] = [];
      let i = 1;

      if (args.section) { conditions.push(`section = $${i++}`); params.push(args.section); }
      if (args.entity_type) { conditions.push(`entity_type = $${i++}`); params.push(args.entity_type); }
      if (args.status) { conditions.push(`status = $${i++}`); params.push(args.status); }
      if (args.search) { conditions.push(`(name ILIKE $${i} OR description ILIKE $${i})`); params.push(`%${args.search}%`); i++; }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(args.limit);
      params.push(args.offset);

      const sql = `
        SELECT id, section, entity_id, name, entity_type, status,
               substring(description, 1, 500) AS description_abbr,
               created_at, updated_at
        FROM knowledge.graph_entities
        ${where}
        ORDER BY section, name
        LIMIT $${i++} OFFSET $${i}
      `;

      const countSql = `
        SELECT COUNT(*)::int AS count
        FROM knowledge.graph_entities
        ${where}
      `;

      const [rows, countResult] = await Promise.all([
        query(sql, params),
        query(countSql, params.slice(0, params.length - 2))
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ entities: rows, count: countResult[0]?.count ?? 0, limit: args.limit, offset: args.offset }, null, 2)
        }],
      };
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
      const row = await queryOne(
        `SELECT * FROM knowledge.graph_entities WHERE section = $1 AND entity_id = $2`,
        [args.section, args.entity_id]
      );
      if (!row) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ error: `Entity not found: ${args.section}/${args.entity_id}` }, null, 2) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(row, null, 2) }] };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  EDGES / RELATIONS
  // ════════════════════════════════════════════════════════════════

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
      const conditions: string[] = [];
      const params: any[] = [];
      let i = 1;

      if (args.source_section) { conditions.push(`e.source_section = $${i++}`); params.push(args.source_section); }
      if (args.source_id) { conditions.push(`e.source_id = $${i++}`); params.push(args.source_id); }
      if (args.target_section) { conditions.push(`e.target_section = $${i++}`); params.push(args.target_section); }
      if (args.target_id) { conditions.push(`e.target_id = $${i++}`); params.push(args.target_id); }
      if (args.relation_type) { conditions.push(`e.relation_type = $${i++}`); params.push(args.relation_type); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(args.limit);
      params.push(args.offset);

      const sql = `
        SELECT e.id, e.source_section, e.source_id, e.relation_type,
               e.target_section, e.target_id, e.properties, e.created_at,
               src.name AS source_name, tgt.name AS target_name
        FROM knowledge.graph_edges e
        LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
        LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
        ${where}
        ORDER BY e.source_section, e.source_id, e.relation_type
        LIMIT $${i++} OFFSET $${i}
      `;

      const countParams = params.slice(0, params.length - 2);
      const countSql = `
        SELECT COUNT(*)::int AS count
        FROM knowledge.graph_edges e
        ${where}
      `;

      const [rows, countResult] = await Promise.all([
        query(sql, params),
        query(countSql, countParams)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ edges: rows, count: countResult[0]?.count ?? 0, limit: args.limit, offset: args.offset }, null, 2)
        }],
      };
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
      const [outbound, inbound] = await Promise.all([
        query(
          `SELECT e.id, e.relation_type, e.target_section, e.target_id, e.properties,
                  tgt.name AS target_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
           WHERE e.source_section = $1 AND e.source_id = $2
           ORDER BY e.relation_type`,
          [args.section, args.entity_id]
        ),
        query(
          `SELECT e.id, e.relation_type, e.source_section, e.source_id, e.properties,
                  src.name AS source_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
           WHERE e.target_section = $1 AND e.target_id = $2
           ORDER BY e.relation_type`,
          [args.section, args.entity_id]
        ),
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            entity: { section: args.section, entity_id: args.entity_id },
            outbound: { count: outbound.length, edges: outbound },
            inbound: { count: inbound.length, edges: inbound },
          }, null, 2)
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  CROSS REFERENCES
  // ════════════════════════════════════════════════════════════════

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
      const conditions: string[] = [];
      const params: any[] = [];
      let i = 1;

      if (args.map_name) { conditions.push(`xr.map_name = $${i++}`); params.push(args.map_name); }
      if (args.source_section) { conditions.push(`xr.source_section = $${i++}`); params.push(args.source_section); }
      if (args.target_id) { conditions.push(`xr.target_id = $${i++}`); params.push(args.target_id); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      params.push(args.limit);
      params.push(args.offset);

      const sql = `
        SELECT xr.id, xr.map_name, xr.source_section, xr.source_id,
               xr.target_section, xr.target_id, xr.weight, xr.created_at
        FROM knowledge.graph_cross_references xr
        ${where}
        ORDER BY xr.map_name, xr.target_id
        LIMIT $${i++} OFFSET $${i}
      `;

      const countParams = params.slice(0, params.length - 2);
      const countSql = `
        SELECT COUNT(*)::int AS count
        FROM knowledge.graph_cross_references xr
        ${where}
      `;

      const [rows, countResult] = await Promise.all([
        query(sql, params),
        query(countSql, countParams)
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ crossReferences: rows, count: countResult[0]?.count ?? 0, limit: args.limit, offset: args.offset }, null, 2)
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  MIGRATIONS (history)
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "knowledge_list_migrations",
    "List the migration history of knowledge graph imports.",
    {
      limit: z.number().min(1).max(100).optional().default(20).describe("Max results"),
    },
    async (args) => {
      const rows = await query(
        `SELECT id, source_file, file_checksum, entity_count, edge_count,
                cross_ref_count, version, migrated_at
         FROM knowledge.graph_migrations
         ORDER BY migrated_at DESC
         LIMIT $1`,
        [args.limit]
      );
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({ migrations: rows, count: rows.length }, null, 2)
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  SUMMARY
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "knowledge_graph_summary",
    "Get summary statistics across all knowledge graph tables — entity counts by section, edge counts by relation type, total migrations.",
    {},
    async () => {
      const [entityCount, edgeCount, xrefCount, migrationCount, sections, relationTypes] = await Promise.all([
        query("SELECT COUNT(*)::int AS count FROM knowledge.graph_entities"),
        query("SELECT COUNT(*)::int AS count FROM knowledge.graph_edges"),
        query("SELECT COUNT(*)::int AS count FROM knowledge.graph_cross_references"),
        query("SELECT COUNT(*)::int AS count FROM knowledge.graph_migrations"),
        query("SELECT section, COUNT(*)::int AS count FROM knowledge.graph_entities GROUP BY section ORDER BY count DESC"),
        query("SELECT relation_type, COUNT(*)::int AS count FROM knowledge.graph_edges GROUP BY relation_type ORDER BY count DESC"),
      ]);

      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            entityCount: entityCount[0]?.count ?? 0,
            edgeCount: edgeCount[0]?.count ?? 0,
            crossReferenceCount: xrefCount[0]?.count ?? 0,
            migrationCount: migrationCount[0]?.count ?? 0,
            bySection: sections,
            byRelationType: relationTypes,
          }, null, 2)
        }],
      };
    }
  );

  // ════════════════════════════════════════════════════════════════
  //  UNIFIED SEMANTIC SEARCH
  // ════════════════════════════════════════════════════════════════

  server.tool(
    "knowledge_semantic_search",
    "Unified semantic search across both knowledge.graph_entity_embeddings (curated) and nebula.harvest_candidate_embeddings (harvested) using cosine similarity via nomic-embed-text. Returns merged results with provenance labels.",
    {
      query: z.string().describe("Search query string (e.g. 'TypeSpec contract architecture')"),
      limit: z.number().min(1).max(50).optional().default(15).describe("Max results (1-50)"),
    },
    async (args) => {
      const scriptPath = "/home/codex/dev/nexus/python/rover/unified_semantic_search.py";
      const pythonBin = "/home/codex/dev/nexus/python/rover/.venv/bin/python3";

      try {
        const { stdout, stderr } = await execFileAsync(
          pythonBin,
          [scriptPath, args.query, "--limit", String(args.limit), "--json"],
          { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
        );

        if (stderr) {
          console.error("[knowledge_semantic_search] stderr:", stderr);
        }

        let result;
        try {
          result = JSON.parse(stdout);
        } catch {
          return {
            content: [{
              type: "text" as const,
              text: JSON.stringify({ error: "Failed to parse search results", raw: stdout.slice(0, 500) }, null, 2)
            }],
          };
        }

        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }],
        };
      } catch (err: any) {
        console.error("[knowledge_semantic_search] error:", err);
        return {
          content: [{
            type: "text" as const,
            text: JSON.stringify({
              error: "Semantic search failed",
              message: err?.message || String(err),
              hint: "Ensure Ollama is running with nomic-embed-text and the rover venv has httpx installed"
            }, null, 2)
          }],
        };
      }
    }
  );
}
