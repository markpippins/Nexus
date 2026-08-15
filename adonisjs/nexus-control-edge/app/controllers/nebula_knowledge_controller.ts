import type { HttpContext } from '@adonisjs/core/http'
import { q, camelCaseRow, parsePagination } from '../services/nebula_helpers.js'

/**
 * nebula-srv (Wave 3.1) — knowledge graph + op-registry domain.
 * Ported from nexus/typescript/nebula-srv/src/routes.ts sections:
 * KNOWLEDGE GRAPH, OP MAPPING REGISTRY.
 */

function err(e: any, status = 500) {
  return { status, body: { error: e?.message ?? String(e) } }
}

export default class NebulaKnowledgeController {
  // ── KNOWLEDGE GRAPH (read-only queries) ─────────────────────────────

  /** GET /api/knowledge/entities */
  async entities({ request, response }: HttpContext) {
    try {
      const qs = request.qs()
      const { section, entity_type, search } = qs
      const { offset, page, pageSize } = parsePagination(qs)

      const conditions: string[] = []
      const filterParams: any[] = []
      let i = 1
      if (section) { conditions.push(`section = $${i++}`); filterParams.push(section) }
      if (entity_type) { conditions.push(`entity_type = $${i++}`); filterParams.push(entity_type) }
      if (search) { conditions.push(`(name ILIKE $${i} OR description ILIKE $${i})`); filterParams.push(`%${search}%`); i++ }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT id, section, entity_id, name, entity_type, status,
                  substring(description, 1, 500) AS description_abbr,
                  created_at, updated_at
           FROM knowledge.graph_entities ${where}
           ORDER BY section, name
           LIMIT $${i++} OFFSET $${i}`,
          [...filterParams, pageSize, offset]
        ),
        q(`SELECT COUNT(*)::int AS total FROM knowledge.graph_entities ${where}`, filterParams),
      ])

      response.json({
        items: dataResult.rows.map(camelCaseRow),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/knowledge/entities/:section/:entityId */
  async entity({ request, response }: HttpContext) {
    try {
      const { section, entityId } = request.params()
      const { rows: [row] } = await q(
        'SELECT * FROM knowledge.graph_entities WHERE section = ? AND entity_id = ?',
        [section, entityId]
      )
      if (!row) {
        response.status(404).json({ error: 'Entity not found' })
        return
      }
      response.json(row)
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/knowledge/entities/:section/:entityId/relations */
  async relations({ request, response }: HttpContext) {
    try {
      const { section, entityId } = request.params()
      const { offset, page, pageSize } = parsePagination(request.qs())

      const [outbound, inbound, outboundCount, inboundCount] = await Promise.all([
        q(
          `SELECT e.id, e.relation_type, e.target_section, e.target_id, e.properties,
                  tgt.name AS target_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
           WHERE e.source_section = ? AND e.source_id = ?
           ORDER BY e.relation_type
           LIMIT ? OFFSET ?`,
          [section, entityId, pageSize, offset]
        ),
        q(
          `SELECT e.id, e.relation_type, e.source_section, e.source_id, e.properties,
                  src.name AS source_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
           WHERE e.target_section = ? AND e.target_id = ?
           ORDER BY e.relation_type
           LIMIT ? OFFSET ?`,
          [section, entityId, pageSize, offset]
        ),
        q('SELECT COUNT(*)::int AS total FROM knowledge.graph_edges WHERE source_section = ? AND source_id = ?', [section, entityId]),
        q('SELECT COUNT(*)::int AS total FROM knowledge.graph_edges WHERE target_section = ? AND target_id = ?', [section, entityId]),
      ])

      response.json({
        entity: { section, entityId },
        outbound: {
          items: outbound.rows.map(camelCaseRow),
          total: parseInt(outboundCount.rows[0].total, 10),
          page,
          pageSize,
        },
        inbound: {
          items: inbound.rows.map(camelCaseRow),
          total: parseInt(inboundCount.rows[0].total, 10),
          page,
          pageSize,
        },
      })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/knowledge/edges */
  async edges({ request, response }: HttpContext) {
    try {
      const qs = request.qs()
      const { source_section, source_id, target_section, target_id, relation_type } = qs
      const { offset, limit, page, pageSize } = parsePagination(qs)

      const conditions: string[] = []
      const filterParams: any[] = []
      let i = 1
      if (source_section) { conditions.push(`e.source_section = $${i++}`); filterParams.push(source_section) }
      if (source_id) { conditions.push(`e.source_id = $${i++}`); filterParams.push(source_id) }
      if (target_section) { conditions.push(`e.target_section = $${i++}`); filterParams.push(target_section) }
      if (target_id) { conditions.push(`e.target_id = $${i++}`); filterParams.push(target_id) }
      if (relation_type) { conditions.push(`e.relation_type = $${i++}`); filterParams.push(relation_type) }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT e.id, e.source_section, e.source_id, e.relation_type,
                  e.target_section, e.target_id, e.properties, e.created_at,
                  src.name AS source_name, tgt.name AS target_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
           LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
           ${where}
           ORDER BY e.source_section, e.source_id, e.relation_type
           LIMIT $${i++} OFFSET $${i}`,
          [...filterParams, pageSize, offset]
        ),
        q(
          `SELECT COUNT(*)::int AS total
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
           LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
           ${where}`,
          filterParams
        ),
      ])

      response.json({ items: dataResult.rows.map(camelCaseRow), total: parseInt(countResult.rows[0].total, 10), page, pageSize, limit, offset })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/knowledge/summary */
  async summary(_ctx: HttpContext, response: any) {
    try {
      const [entityCount, edgeCount, xrefCount, sections, relationTypes, graphSummary] = await Promise.all([
        q('SELECT COUNT(*)::int AS count FROM knowledge.graph_entities'),
        q('SELECT COUNT(*)::int AS count FROM knowledge.graph_edges'),
        q('SELECT COUNT(*)::int AS count FROM knowledge.graph_cross_references'),
        q('SELECT section, COUNT(*)::int AS count FROM knowledge.graph_entities GROUP BY section ORDER BY count DESC'),
        q('SELECT relation_type, COUNT(*)::int AS count FROM knowledge.graph_edges GROUP BY relation_type ORDER BY count DESC'),
        q('SELECT * FROM knowledge.v_graph_summary ORDER BY section'),
      ])
      response.json({
        entityCount: entityCount.rows[0]?.count ?? 0,
        edgeCount: edgeCount.rows[0]?.count ?? 0,
        crossReferenceCount: xrefCount.rows[0]?.count ?? 0,
        bySection: sections.rows,
        byRelationType: relationTypes.rows,
        embeddingSummary: graphSummary.rows,
      })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/knowledge/view */
  async view({ request, response }: HttpContext) {
    try {
      const limit = Math.min(parseInt(request.qs().limit as string) || 500, 1000)
      const unionEntities = `
        SELECT id, section, entity_id, name, entity_type, status, description_abbr
        FROM (
          SELECT id, section, entity_id, name, entity_type, status,
                 substring(description, 1, 300) AS description_abbr
          FROM knowledge.graph_entities
          UNION ALL
          SELECT gen_random_uuid() AS id,
                 'harvest_candidate' AS section,
                 id::text AS entity_id,
                 COALESCE(title, 'Untitled') AS name,
                 'harvest_candidate' AS entity_type,
                 COALESCE(status, 'unlinked') AS status,
                 substring(intent_description, 1, 300) AS description_abbr
          FROM nebula.harvest_candidates
          WHERE system_id IS NOT NULL
        ) AS all_entities
        ORDER BY section, name
        LIMIT ?`

      const [entities, edges] = await Promise.all([
        q(unionEntities, [limit]),
        q(
          `SELECT e.id, e.source_section, e.source_id, e.relation_type,
                  e.target_section, e.target_id,
                  src.name AS source_name, tgt.name AS target_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
           LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
           LIMIT ?`,
          [limit * 3]
        ),
      ])
      response.json({
        entities: entities.rows,
        edges: edges.rows,
        entityCount: entities.rows.length,
        edgeCount: edges.rows.length,
      })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/knowledge/cross-references */
  async crossReferences({ request, response }: HttpContext) {
    try {
      const { offset, page, pageSize } = parsePagination(request.qs())
      const xrefSubquery = `(
        SELECT xr.id, xr.map_name, xr.source_section, xr.source_id,
               xr.target_section, xr.target_id, xr.weight
        FROM knowledge.graph_cross_references xr
        UNION ALL
        SELECT gen_random_uuid() AS id,
               'harvest_candidate' AS map_name,
               source_type AS source_section,
               source_id,
               target_type AS target_section,
               target_id,
               1 AS weight
        FROM nebula.cross_references
        WHERE source_type = 'harvest_candidate'
          AND rel_type = 'ag:spawns_plan'
      ) AS all_xrefs`

      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT id, map_name, source_section, source_id, target_section, target_id, weight
           FROM ${xrefSubquery}
           LIMIT ? OFFSET ?`,
          [pageSize, offset]
        ),
        q(`SELECT COUNT(*)::int AS total FROM ${xrefSubquery}`, []),
      ])

      response.json({
        items: dataResult.rows.map(camelCaseRow),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  // ── OP MAPPING REGISTRY ─────────────────────────────────────────────

  /** POST /api/op-registry */
  async createOpRegistryEntry({ request, response }: HttpContext) {
    try {
      const body = request.body()
      const {
        id, intent_id, version, status, label,
        match_patterns, opcode_template, required_params, optional_params,
        preconditions, postconditions, idempotency_key, successor_id, notes,
      } = body

      if (!id || !intent_id) {
        response.status(400).json({ error: 'id and intent_id are required' })
        return
      }

      const now = new Date().toISOString()
      const { rows: [row] } = await q(
        `INSERT INTO nebula.op_registry
          (id, intent_id, version, status, label,
           match_patterns, opcode_template, required_params, optional_params,
           preconditions, postconditions, idempotency_key, successor_id, notes,
           created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
        [
          id, intent_id, version || 'v1', status || 'active', label || '',
          match_patterns || [], JSON.stringify(opcode_template || []),
          required_params || [], optional_params || [],
          preconditions || [], postconditions || [],
          idempotency_key || '', successor_id || null, notes || '',
          now, now,
        ]
      )
      response.status(201).json(row)
    } catch (e: any) {
      if (e.message && e.message.includes('Invalid opcode')) {
        response.status(422).json({ error: e.message })
        return
      }
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/op-registry */
  async listOpRegistry({ request, response }: HttpContext) {
    try {
      const qs = request.qs()
      const { intent_id, status, search } = qs
      const { offset, page, pageSize } = parsePagination(qs)

      const conditions: string[] = ['deleted_at IS NULL']
      const filterParams: any[] = []
      let i = 1
      if (intent_id) { conditions.push(`intent_id = $${i++}`); filterParams.push(intent_id) }
      if (status) { conditions.push(`status = $${i++}`); filterParams.push(status) }
      if (search) {
        conditions.push(`(label ILIKE $${i} OR intent_id ILIKE $${i} OR notes ILIKE $${i})`)
        filterParams.push(`%${search}%`)
        i++
      }

      const where = conditions.join(' AND ')

      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT * FROM nebula.op_registry
           WHERE ${where}
           ORDER BY intent_id, version DESC
           LIMIT $${i++} OFFSET $${i}`,
          [...filterParams, pageSize, offset]
        ),
        q(`SELECT COUNT(*)::int AS total FROM nebula.op_registry WHERE ${where}`, filterParams),
      ])

      response.json({
        items: dataResult.rows.map(camelCaseRow),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/op-registry/:id */
  async getOpRegistryEntry({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { rows: [row] } = await q(
        'SELECT * FROM nebula.op_registry WHERE id = ? AND deleted_at IS NULL',
        [id]
      )
      if (!row) {
        response.status(404).json({ error: `Registry entry ${id} not found` })
        return
      }
      response.json(row)
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** PATCH /api/op-registry/:id/deprecate */
  async deprecateOpRegistryEntry({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { successor_id } = request.body()
      const now = new Date().toISOString()
      const { rows: [row] } = await q(
        `UPDATE nebula.op_registry
         SET status = 'deprecated', successor_id = COALESCE(?, successor_id),
             updated_at = ?
         WHERE id = ? AND deleted_at IS NULL
         RETURNING *`,
        [successor_id || null, now, id]
      )
      if (!row) {
        response.status(404).json({ error: `Registry entry ${id} not found or already deleted` })
        return
      }
      response.json(row)
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** PATCH /api/op-registry/:id/supersede */
  async supersedeOpRegistryEntry({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { successor_id } = request.body()
      if (!successor_id) {
        response.status(400).json({ error: 'successor_id is required to supersede an entry' })
        return
      }
      const now = new Date().toISOString()
      const { rows: [row] } = await q(
        `UPDATE nebula.op_registry
         SET status = 'superseded', successor_id = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL
         RETURNING *`,
        [successor_id, now, id]
      )
      if (!row) {
        response.status(404).json({ error: `Registry entry ${id} not found or already deleted` })
        return
      }
      response.json(row)
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** DELETE /api/op-registry/:id */
  async deleteOpRegistryEntry({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const now = new Date().toISOString()
      const { rows: [row] } = await q(
        'UPDATE nebula.op_registry SET deleted_at = ?, updated_at = ?, valid_until = ? WHERE id = ? AND deleted_at IS NULL RETURNING *',
        [now, now, now, id]
      )
      if (!row) {
        response.status(404).json({ error: `Registry entry ${id} not found` })
        return
      }
      response.json({ deleted: true, id })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** POST /api/op-registry/fork */
  async forkOpRegistryEntry({ request, response }: HttpContext) {
    try {
      const body = request.body()
      const { source_id, new_version, label, notes, opcode_template, required_params } = body
      if (!source_id || !new_version) {
        response.status(400).json({ error: 'source_id and new_version are required' })
        return
      }

      const { rows: [source] } = await q(
        'SELECT * FROM nebula.op_registry WHERE id = ? AND deleted_at IS NULL',
        [source_id]
      )
      if (!source) {
        response.status(404).json({ error: `Source registry entry ${source_id} not found` })
        return
      }

      const forkId = `${source.intent_id}:${new_version}`
      const now = new Date().toISOString()

      const { rows: [fork] } = await q(
        `INSERT INTO nebula.op_registry
          (id, intent_id, version, status, label,
           match_patterns, opcode_template, required_params, optional_params,
           preconditions, postconditions, idempotency_key, notes,
           created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         RETURNING *`,
        [
          forkId,
          source.intent_id,
          new_version,
          label || `${source.label} (${new_version})`,
          source.match_patterns,
          JSON.stringify(opcode_template || source.opcode_template),
          required_params || source.required_params,
          source.optional_params,
          source.preconditions,
          source.postconditions,
          source.idempotency_key,
          notes || '',
          now, now,
        ]
      )

      await q(
        `UPDATE nebula.op_registry SET status = 'superseded', successor_id = ?, updated_at = ?
         WHERE id = ?`,
        [forkId, now, source_id]
      )

      response.status(201).json({
        fork,
        superseded: source_id,
        message: `Forked ${source_id} → ${forkId}`,
      })
    } catch (e: any) {
      if (e.message && e.message.includes('Invalid opcode')) {
        response.status(422).json({ error: e.message })
        return
      }
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/op-registry/:id/lineage */
  async opRegistryLineage({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const { rows: [entry] } = await q(
        'SELECT * FROM nebula.op_registry WHERE id = ? AND deleted_at IS NULL',
        [id]
      )
      if (!entry) {
        response.status(404).json({ error: `Registry entry ${id} not found` })
        return
      }

      const { rows: lineage } = await q(
        `SELECT id, intent_id, version, status, successor_id, label, created_at
         FROM nebula.op_registry
         WHERE intent_id = ? AND deleted_at IS NULL
         ORDER BY version DESC`,
        [entry.intent_id]
      )

      response.json({ intent_id: entry.intent_id, entries: lineage, count: lineage.length })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }
}
