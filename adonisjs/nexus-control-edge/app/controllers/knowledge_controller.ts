import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

/**
 * knowledge-srv routes, re-homed onto the control-plane edge (Wave 2.1).
 * Same wire surface as the retired Express service, backed by the
 * knowledge.postgres schema. The edge's PG connection carries
 * searchPath knowledge,public, so unqualified table names resolve as in
 * the original service.
 *
 * NOTE: Lucid rawQuery bindings go through knex, so placeholders are `?`
 * (knex translates to pg's $n).
 */

function intParam(v: any, dflt: number, min = 0, max = 500): number {
  const n = v === undefined ? dflt : parseInt(String(v), 10)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

export default class KnowledgeController {
  /** GET /knowledge/entities — filtered list + count. */
  async entities({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const { section, entity_type: entityType, status, search } = q as Record<string, string | undefined>
      const limit = intParam(q.limit, 100, 1, 500)
      const offset = intParam(q.offset, 0, 0)

      const conditions: string[] = []
      const params: any[] = []
      if (section) { conditions.push('section = ?'); params.push(section) }
      if (entityType) { conditions.push('entity_type = ?'); params.push(entityType) }
      if (status) { conditions.push('status = ?'); params.push(status) }
      if (search) { conditions.push('(name ILIKE ? OR description ILIKE ?)'); params.push(`%${search}%`, `%${search}%`) }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const allParams = [...params, limit, offset]

      const sql = `
        SELECT id, section, entity_id, name, entity_type, status,
               substring(description, 1, 500) AS description_abbr,
               created_at, updated_at
        FROM graph_entities
        ${where}
        ORDER BY section, name
        LIMIT ? OFFSET ?
      `
      const countSql = `SELECT COUNT(*)::int AS count FROM graph_entities ${where}`
      const [rows, countResult] = await Promise.all([
        db.rawQuery(sql, allParams),
        db.rawQuery(countSql, params),
      ])
      return response.json({
        entities: rows.rows,
        count: countResult.rows[0]?.count ?? 0,
        limit,
        offset,
      })
    } catch (err: any) {
      return response.status(500).json({ error: 'Failed to list entities', message: err?.message ?? String(err) })
    }
  }

  /** GET /knowledge/entities/:section/:entity_id */
  async entity({ params, response }: HttpContext) {
    try {
      const row = await db.rawQuery(
        'SELECT * FROM graph_entities WHERE section = ? AND entity_id = ?',
        [params.section, params.entity_id]
      )
      if (!row.rows[0]) {
        return response.status(404).json({ error: `Entity not found: ${params.section}/${params.entity_id}` })
      }
      return response.json(row.rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: 'Failed to get entity', message: err?.message ?? String(err) })
    }
  }

  /** GET /knowledge/entities/:section/:entity_id/relations */
  async relations({ params, response }: HttpContext) {
    try {
      const { section, entity_id: entityId } = params
      const [outbound, inbound] = await Promise.all([
        db.rawQuery(
          `SELECT e.id, e.relation_type, e.target_section, e.target_id, e.properties, tgt.name AS target_name
           FROM graph_edges e
           LEFT JOIN graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
           WHERE e.source_section = ? AND e.source_id = ?
           ORDER BY e.relation_type`,
          [section, entityId]
        ),
        db.rawQuery(
          `SELECT e.id, e.relation_type, e.source_section, e.source_id, e.properties, src.name AS source_name
           FROM graph_edges e
           LEFT JOIN graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
           WHERE e.target_section = ? AND e.target_id = ?
           ORDER BY e.relation_type`,
          [section, entityId]
        ),
      ])
      return response.json({
        entity: { section, entity_id: entityId },
        outbound: { count: outbound.rows.length, edges: outbound.rows },
        inbound: { count: inbound.rows.length, edges: inbound.rows },
      })
    } catch (err: any) {
      return response.status(500).json({ error: 'Failed to list relations', message: err?.message ?? String(err) })
    }
  }

  /** GET /knowledge/edges — filtered list + count. */
  async edges({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const { source_section: sourceSection, source_id: sourceId, target_section: targetSection, target_id: targetId, relation_type: relationType } = q as Record<string, string | undefined>
      const limit = intParam(q.limit, 100, 1, 500)
      const offset = intParam(q.offset, 0, 0)

      const conditions: string[] = []
      const params: any[] = []
      if (sourceSection) { conditions.push('e.source_section = ?'); params.push(sourceSection) }
      if (sourceId) { conditions.push('e.source_id = ?'); params.push(sourceId) }
      if (targetSection) { conditions.push('e.target_section = ?'); params.push(targetSection) }
      if (targetId) { conditions.push('e.target_id = ?'); params.push(targetId) }
      if (relationType) { conditions.push('e.relation_type = ?'); params.push(relationType) }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const allParams = [...params, limit, offset]

      const sql = `
        SELECT e.id, e.source_section, e.source_id, e.relation_type,
               e.target_section, e.target_id, e.properties, e.created_at,
               src.name AS source_name, tgt.name AS target_name
        FROM graph_edges e
        LEFT JOIN graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
        LEFT JOIN graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
        ${where}
        ORDER BY e.source_section, e.source_id, e.relation_type
        LIMIT ? OFFSET ?
      `
      const countSql = `SELECT COUNT(*)::int AS count FROM graph_edges e ${where}`
      const [rows, countResult] = await Promise.all([
        db.rawQuery(sql, allParams),
        db.rawQuery(countSql, params),
      ])
      return response.json({ edges: rows.rows, count: countResult.rows[0]?.count ?? 0, limit, offset })
    } catch (err: any) {
      return response.status(500).json({ error: 'Failed to list edges', message: err?.message ?? String(err) })
    }
  }

  /** GET /knowledge/cross-references — filtered list + count. */
  async crossReferences({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const { map_name: mapName, source_section: sourceSection, target_id: targetId } = q as Record<string, string | undefined>
      const limit = intParam(q.limit, 100, 1, 500)
      const offset = intParam(q.offset, 0, 0)

      const conditions: string[] = []
      const params: any[] = []
      if (mapName) { conditions.push('xr.map_name = ?'); params.push(mapName) }
      if (sourceSection) { conditions.push('xr.source_section = ?'); params.push(sourceSection) }
      if (targetId) { conditions.push('xr.target_id = ?'); params.push(targetId) }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
      const allParams = [...params, limit, offset]

      const sql = `
        SELECT xr.id, xr.map_name, xr.source_section, xr.source_id,
               xr.target_section, xr.target_id, xr.weight, xr.created_at
        FROM graph_cross_references xr
        ${where}
        ORDER BY xr.map_name, xr.target_id
        LIMIT ? OFFSET ?
      `
      const countSql = `SELECT COUNT(*)::int AS count FROM graph_cross_references xr ${where}`
      const [rows, countResult] = await Promise.all([
        db.rawQuery(sql, allParams),
        db.rawQuery(countSql, params),
      ])
      return response.json({ crossReferences: rows.rows, count: countResult.rows[0]?.count ?? 0, limit, offset })
    } catch (err: any) {
      return response.status(500).json({ error: 'Failed to list cross-references', message: err?.message ?? String(err) })
    }
  }

  /** GET /knowledge/migrations */
  async migrations({ request, response }: HttpContext) {
    try {
      const limit = intParam(request.qs().limit, 20, 1, 100)
      const rows = await db.rawQuery(
        `SELECT id, source_file, file_checksum, entity_count, edge_count,
                cross_ref_count, version, migrated_at
         FROM graph_migrations
         ORDER BY migrated_at DESC
         LIMIT ?`,
        [limit]
      )
      return response.json({ migrations: rows.rows, count: rows.rows.length, limit })
    } catch (err: any) {
      return response.status(500).json({ error: 'Failed to list migrations', message: err?.message ?? String(err) })
    }
  }

  /** GET /knowledge/summary */
  async summary(_ctx: HttpContext) {
    try {
      const [entityCount, edgeCount, xrefCount, migrationCount, sections, relationTypes] = await Promise.all([
        db.rawQuery('SELECT COUNT(*)::int AS count FROM graph_entities'),
        db.rawQuery('SELECT COUNT(*)::int AS count FROM graph_edges'),
        db.rawQuery('SELECT COUNT(*)::int AS count FROM graph_cross_references'),
        db.rawQuery('SELECT COUNT(*)::int AS count FROM graph_migrations'),
        db.rawQuery('SELECT section, COUNT(*)::int AS count FROM graph_entities GROUP BY section ORDER BY count DESC'),
        db.rawQuery('SELECT relation_type, COUNT(*)::int AS count FROM graph_edges GROUP BY relation_type ORDER BY count DESC'),
      ])
      return {
        entityCount: entityCount.rows[0]?.count ?? 0,
        edgeCount: edgeCount.rows[0]?.count ?? 0,
        crossReferenceCount: xrefCount.rows[0]?.count ?? 0,
        migrationCount: migrationCount.rows[0]?.count ?? 0,
        bySection: sections.rows,
        byRelationType: relationTypes.rows,
      }
    } catch (err: any) {
      return { error: 'Failed to compute summary', message: err?.message ?? String(err) }
    }
  }
}
