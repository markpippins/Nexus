import { Router, Request, Response } from "express";
import { query, queryOne } from "../db/client.js";

const router = Router();

// ── helpers ─────────────────────────────────────────────────────────
function intParam(v: any, dflt: number, min = 0, max = 500): number {
  const n = v === undefined ? dflt : parseInt(String(v), 10);
  if (Number.isNaN(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}

// ── graph_entities ─────────────────────────────────────────────────

// GET /knowledge/entities?section=&entity_type=&status=&search=&limit=&offset=
router.get("/entities", async (req: Request, res: Response) => {
  try {
    const { section, entity_type: entityType, status, search } = req.query as Record<string, string | undefined>;
    const limit = intParam(req.query.limit, 100, 1, 500);
    const offset = intParam(req.query.offset, 0, 0);

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (section)    { conditions.push(`section = $${i++}`);       params.push(section); }
    if (entityType) { conditions.push(`entity_type = $${i++}`);  params.push(entityType); }
    if (status)     { conditions.push(`status = $${i++}`);        params.push(status); }
    if (search)     { conditions.push(`(name ILIKE $${i} OR description ILIKE $${i})`); params.push(`%${search}%`); i++; }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit); params.push(offset);

    const sql = `
      SELECT id, section, entity_id, name, entity_type, status,
             substring(description, 1, 500) AS description_abbr,
             created_at, updated_at
      FROM graph_entities
      ${where}
      ORDER BY section, name
      LIMIT $${i++} OFFSET $${i}
    `;
    const countSql = `SELECT COUNT(*)::int AS count FROM graph_entities ${where}`;
    const [rows, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2)),
    ]);
    res.json({
      entities: rows,
      count: countResult[0]?.count ?? 0,
      limit,
      offset,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list entities", message: err?.message ?? String(err) });
  }
});

// GET /knowledge/entities/:section/:entity_id
router.get("/entities/:section/:entity_id", async (req: Request, res: Response) => {
  try {
    const row = await queryOne(
      `SELECT * FROM graph_entities WHERE section = $1 AND entity_id = $2`,
      [req.params.section, req.params.entity_id]
    );
    if (!row) return res.status(404).json({ error: `Entity not found: ${req.params.section}/${req.params.entity_id}` });
    res.json(row);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to get entity", message: err?.message ?? String(err) });
  }
});

// GET /knowledge/entities/:section/:entity_id/relations
router.get("/entities/:section/:entity_id/relations", async (req: Request, res: Response) => {
  try {
    const { section, entity_id: entityId } = req.params;
    const [outbound, inbound] = await Promise.all([
      query(
        `SELECT e.id, e.relation_type, e.target_section, e.target_id, e.properties, tgt.name AS target_name
         FROM graph_edges e
         LEFT JOIN graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
         WHERE e.source_section = $1 AND e.source_id = $2
         ORDER BY e.relation_type`,
        [section, entityId]
      ),
      query(
        `SELECT e.id, e.relation_type, e.source_section, e.source_id, e.properties, src.name AS source_name
         FROM graph_edges e
         LEFT JOIN graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
         WHERE e.target_section = $1 AND e.target_id = $2
         ORDER BY e.relation_type`,
        [section, entityId]
      ),
    ]);

    res.json({
      entity: { section, entity_id: entityId },
      outbound: { count: outbound.length, edges: outbound },
      inbound: { count: inbound.length, edges: inbound },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list relations", message: err?.message ?? String(err) });
  }
});

// ── graph_edges ────────────────────────────────────────────────────

// GET /knowledge/edges?source_section=&source_id=&target_section=&target_id=&relation_type=&limit=&offset=
router.get("/edges", async (req: Request, res: Response) => {
  try {
    const { source_section: sourceSection, source_id: sourceId,
            target_section: targetSection, target_id: targetId,
            relation_type: relationType } = req.query as Record<string, string | undefined>;
    const limit = intParam(req.query.limit, 100, 1, 500);
    const offset = intParam(req.query.offset, 0, 0);

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (sourceSection) { conditions.push(`e.source_section = $${i++}`); params.push(sourceSection); }
    if (sourceId)      { conditions.push(`e.source_id = $${i++}`);      params.push(sourceId); }
    if (targetSection) { conditions.push(`e.target_section = $${i++}`); params.push(targetSection); }
    if (targetId)      { conditions.push(`e.target_id = $${i++}`);      params.push(targetId); }
    if (relationType)  { conditions.push(`e.relation_type = $${i++}`);  params.push(relationType); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit); params.push(offset);

    const sql = `
      SELECT e.id, e.source_section, e.source_id, e.relation_type,
             e.target_section, e.target_id, e.properties, e.created_at,
             src.name AS source_name, tgt.name AS target_name
      FROM graph_edges e
      LEFT JOIN graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
      LEFT JOIN graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
      ${where}
      ORDER BY e.source_section, e.source_id, e.relation_type
      LIMIT $${i++} OFFSET $${i}
    `;
    const countParams = params.slice(0, params.length - 2);
    const countSql = `SELECT COUNT(*)::int AS count FROM graph_edges e ${where}`;
    const [rows, countResult] = await Promise.all([query(sql, params), query(countSql, countParams)]);
    res.json({ edges: rows, count: countResult[0]?.count ?? 0, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list edges", message: err?.message ?? String(err) });
  }
});

// ── graph_cross_references ─────────────────────────────────────────

// GET /knowledge/cross-references?map_name=&source_section=&target_id=&limit=&offset=
router.get("/cross-references", async (req: Request, res: Response) => {
  try {
    const { map_name: mapName, source_section: sourceSection, target_id: targetId } = req.query as Record<string, string | undefined>;
    const limit = intParam(req.query.limit, 100, 1, 500);
    const offset = intParam(req.query.offset, 0, 0);

    const conditions: string[] = [];
    const params: any[] = [];
    let i = 1;
    if (mapName)       { conditions.push(`xr.map_name = $${i++}`);       params.push(mapName); }
    if (sourceSection) { conditions.push(`xr.source_section = $${i++}`);  params.push(sourceSection); }
    if (targetId)      { conditions.push(`xr.target_id = $${i++}`);       params.push(targetId); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit); params.push(offset);

    const sql = `
      SELECT xr.id, xr.map_name, xr.source_section, xr.source_id,
             xr.target_section, xr.target_id, xr.weight, xr.created_at
      FROM graph_cross_references xr
      ${where}
      ORDER BY xr.map_name, xr.target_id
      LIMIT $${i++} OFFSET $${i}
    `;
    const countParams = params.slice(0, params.length - 2);
    const countSql = `SELECT COUNT(*)::int AS count FROM graph_cross_references xr ${where}`;
    const [rows, countResult] = await Promise.all([query(sql, params), query(countSql, countParams)]);
    res.json({ crossReferences: rows, count: countResult[0]?.count ?? 0, limit, offset });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list cross-references", message: err?.message ?? String(err) });
  }
});

// ── graph_migrations ───────────────────────────────────────────────

// GET /knowledge/migrations?limit=
router.get("/migrations", async (req: Request, res: Response) => {
  try {
    const limit = intParam(req.query.limit, 20, 1, 100);
    const rows = await query(
      `SELECT id, source_file, file_checksum, entity_count, edge_count,
              cross_ref_count, version, migrated_at
       FROM graph_migrations
       ORDER BY migrated_at DESC
       LIMIT $1`,
      [limit]
    );
    res.json({ migrations: rows, count: rows.length, limit });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to list migrations", message: err?.message ?? String(err) });
  }
});

// ── summary ───────────────────────────────────────────────────────

// GET /knowledge/summary
router.get("/summary", async (_req: Request, res: Response) => {
  try {
    const [entityCount, edgeCount, xrefCount, migrationCount, sections, relationTypes] = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM graph_entities"),
      query("SELECT COUNT(*)::int AS count FROM graph_edges"),
      query("SELECT COUNT(*)::int AS count FROM graph_cross_references"),
      query("SELECT COUNT(*)::int AS count FROM graph_migrations"),
      query("SELECT section, COUNT(*)::int AS count FROM graph_entities GROUP BY section ORDER BY count DESC"),
      query("SELECT relation_type, COUNT(*)::int AS count FROM graph_edges GROUP BY relation_type ORDER BY count DESC"),
    ]);
    res.json({
      entityCount: entityCount[0]?.count ?? 0,
      edgeCount: edgeCount[0]?.count ?? 0,
      crossReferenceCount: xrefCount[0]?.count ?? 0,
      migrationCount: migrationCount[0]?.count ?? 0,
      bySection: sections,
      byRelationType: relationTypes,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to compute summary", message: err?.message ?? String(err) });
  }
});

export default router;
