import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

/**
 * voyager-srv routes, re-homed onto the control-plane edge (Wave 2.4).
 * Same wire surface as the retired Express service, backed by the
 * voyager.* schema. All table names are schema-qualified.
 *
 * NOTE: Lucid rawQuery bindings go through knex, so placeholders are `?`.
 */

function toNumber(v: any, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function camelCaseRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    const camelKey = key.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase())
    if (value instanceof Date) {
      out[camelKey] = value.getTime()
    } else {
      out[camelKey] = value
    }
  }
  return out
}

function camelCaseRows(rows: Record<string, any>[]): Record<string, any>[] {
  return rows.map(camelCaseRow)
}

function errResponse(response: any, status: number, error: string, message: string) {
  return response.status(status).json({ error, message })
}

export default class VoyagerController {
  /** GET /api/health */
  async health({ response }: HttpContext) {
    try {
      const { rows } = await db.rawQuery('SELECT 1 AS ok')
      return response.json({ status: 'ok', db: rows[0].ok === 1, service: 'voyager-srv' })
    } catch (err: any) {
      return response.status(503).json({ status: 'error', message: err.message })
    }
  }

  /** GET /api/scan-epochs */
  async scanEpochs({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const page = Math.max(1, toNumber(q.page, 1))
      const pageSize = Math.min(100, Math.max(1, toNumber(q.pageSize, 20)))
      const offset = (page - 1) * pageSize

      const [countResult, { rows }] = await Promise.all([
        db.rawQuery('SELECT COUNT(*)::int AS total FROM voyager.scan_epoch'),
        db.rawQuery('SELECT * FROM voyager.scan_epoch ORDER BY started_at DESC LIMIT ? OFFSET ?', [pageSize, offset]),
      ])

      return response.json({
        items: camelCaseRows(rows),
        total: countResult.rows[0].total,
        page,
        pageSize,
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/scan-epochs/:id */
  async scanEpoch({ params, response }: HttpContext) {
    try {
      const { rows: [epoch] } = await db.rawQuery('SELECT * FROM voyager.scan_epoch WHERE id = ?', [params.id])
      if (!epoch) return errResponse(response, 404, 'Scan epoch not found', '')
      return response.json(camelCaseRow(epoch))
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/observations/files */
  async fileObservations({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const page = Math.max(1, toNumber(q.page, 1))
      const pageSize = Math.min(100, Math.max(1, toNumber(q.pageSize, 50)))
      const offset = (page - 1) * pageSize

      const clauses: string[] = []
      const vals: any[] = []
      if (q.scanEpochId) { clauses.push('scan_epoch_id = ?'); vals.push(q.scanEpochId) }
      if (q.path) { clauses.push('path ILIKE ?'); vals.push(`%${q.path}%`) }
      if (q.deviceId) { clauses.push('device_id = ?'); vals.push(q.deviceId) }
      if (q.inode) { clauses.push('inode = ?'); vals.push(q.inode) }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const [countResult, { rows }] = await Promise.all([
        db.rawQuery(`SELECT COUNT(*)::int AS total FROM voyager.file_observation ${where}`, vals),
        db.rawQuery(
          `SELECT * FROM voyager.file_observation ${where} ORDER BY discovered_at DESC LIMIT ? OFFSET ?`,
          [...vals, pageSize, offset],
        ),
      ])

      return response.json({
        items: camelCaseRows(rows),
        total: countResult.rows[0].total,
        page,
        pageSize,
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/observations/files/by-id/:observationId */
  async fileObservationByObsId({ params, response }: HttpContext) {
    try {
      const { rows: [obs] } = await db.rawQuery(
        'SELECT * FROM voyager.file_observation WHERE observation_id = ?',
        [params.observationId],
      )
      if (!obs) return errResponse(response, 404, 'File observation not found', '')
      return response.json(camelCaseRow(obs))
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/observations/files/:id */
  async fileObservation({ params, response }: HttpContext) {
    try {
      const { rows: [obs] } = await db.rawQuery('SELECT * FROM voyager.file_observation WHERE id = ?', [params.id])
      if (!obs) return errResponse(response, 404, 'File observation not found', '')
      return response.json(camelCaseRow(obs))
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/observations/directories */
  async directoryObservations({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const page = Math.max(1, toNumber(q.page, 1))
      const pageSize = Math.min(100, Math.max(1, toNumber(q.pageSize, 50)))
      const offset = (page - 1) * pageSize

      const clauses: string[] = []
      const vals: any[] = []
      if (q.scanEpochId) { clauses.push('scan_epoch_id = ?'); vals.push(q.scanEpochId) }
      if (q.path) { clauses.push('path ILIKE ?'); vals.push(`%${q.path}%`) }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const [countResult, { rows }] = await Promise.all([
        db.rawQuery(`SELECT COUNT(*)::int AS total FROM voyager.directory_observation ${where}`, vals),
        db.rawQuery(
          `SELECT * FROM voyager.directory_observation ${where} ORDER BY discovered_at DESC LIMIT ? OFFSET ?`,
          [...vals, pageSize, offset],
        ),
      ])

      return response.json({
        items: camelCaseRows(rows),
        total: countResult.rows[0].total,
        page,
        pageSize,
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/topology/signals */
  async topologySignals({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const page = Math.max(1, toNumber(q.page, 1))
      const pageSize = Math.min(100, Math.max(1, toNumber(q.pageSize, 50)))
      const offset = (page - 1) * pageSize

      const clauses: string[] = []
      const vals: any[] = []
      if (q.scanEpochId) { clauses.push('scan_epoch_id = ?'); vals.push(q.scanEpochId) }
      if (q.structureType) { clauses.push("structure->>'type' = ?"); vals.push(q.structureType) }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const [countResult, { rows }] = await Promise.all([
        db.rawQuery(`SELECT COUNT(*)::int AS total FROM voyager.topology_signal ${where}`, vals),
        db.rawQuery(
          `SELECT * FROM voyager.topology_signal ${where} ORDER BY discovered_at DESC LIMIT ? OFFSET ?`,
          [...vals, pageSize, offset],
        ),
      ])

      return response.json({
        items: camelCaseRows(rows),
        total: countResult.rows[0].total,
        page,
        pageSize,
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/topology/signals/:id */
  async topologySignal({ params, response }: HttpContext) {
    try {
      const { rows: [sig] } = await db.rawQuery('SELECT * FROM voyager.topology_signal WHERE id = ?', [params.id])
      if (!sig) return errResponse(response, 404, 'Topology signal not found', '')
      return response.json(camelCaseRow(sig))
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/topology/edge-hints */
  async edgeHints({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const page = Math.max(1, toNumber(q.page, 1))
      const pageSize = Math.min(100, Math.max(1, toNumber(q.pageSize, 50)))
      const offset = (page - 1) * pageSize

      const clauses: string[] = []
      const vals: any[] = []
      if (q.evidenceType) { clauses.push("evidence->>'type' = ?"); vals.push(q.evidenceType) }
      if (q.minConfidence) { clauses.push('confidence >= ?'); vals.push(q.minConfidence) }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const [countResult, { rows }] = await Promise.all([
        db.rawQuery(`SELECT COUNT(*)::int AS total FROM voyager.observation_edge_hint ${where}`, vals),
        db.rawQuery(
          `SELECT * FROM voyager.observation_edge_hint ${where} ORDER BY discovered_at DESC LIMIT ? OFFSET ?`,
          [...vals, pageSize, offset],
        ),
      ])

      return response.json({
        items: camelCaseRows(rows),
        total: countResult.rows[0].total,
        page,
        pageSize,
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/entities */
  async entities({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const page = Math.max(1, toNumber(q.page, 1))
      const pageSize = Math.min(100, Math.max(1, toNumber(q.pageSize, 50)))
      const offset = (page - 1) * pageSize

      const clauses: string[] = []
      const vals: any[] = []
      if (q.minStability) { clauses.push('stability_score >= ?'); vals.push(q.minStability) }
      if (q.canonicalPath) { clauses.push("state->>'canonical_path' ILIKE ?"); vals.push(`%${q.canonicalPath}%`) }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const [countResult, { rows }] = await Promise.all([
        db.rawQuery(`SELECT COUNT(*)::int AS total FROM voyager.entity ${where}`, vals),
        db.rawQuery(
          `SELECT * FROM voyager.entity ${where} ORDER BY stability_score DESC LIMIT ? OFFSET ?`,
          [...vals, pageSize, offset],
        ),
      ])

      return response.json({
        items: camelCaseRows(rows),
        total: countResult.rows[0].total,
        page,
        pageSize,
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/entities/by-id/:entityId */
  async entityByEntityId({ params, response }: HttpContext) {
    try {
      const { rows: [ent] } = await db.rawQuery(
        'SELECT * FROM voyager.entity WHERE entity_id = ?',
        [params.entityId],
      )
      if (!ent) return errResponse(response, 404, 'Entity not found', '')

      const { rows: drifts } = await db.rawQuery(
        'SELECT * FROM voyager.entity_drift WHERE entity_id = ? ORDER BY discovered_at DESC',
        [ent.id],
      )

      return response.json({
        ...camelCaseRow(ent),
        drifts: camelCaseRows(drifts),
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/entities/:id */
  async entity({ params, response }: HttpContext) {
    try {
      const { rows: [ent] } = await db.rawQuery('SELECT * FROM voyager.entity WHERE id = ?', [params.id])
      if (!ent) return errResponse(response, 404, 'Entity not found', '')

      const { rows: drifts } = await db.rawQuery(
        'SELECT * FROM voyager.entity_drift WHERE entity_id = ? ORDER BY discovered_at DESC',
        [params.id],
      )

      return response.json({
        ...camelCaseRow(ent),
        drifts: camelCaseRows(drifts),
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/spans */
  async spans({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const page = Math.max(1, toNumber(q.page, 1))
      const pageSize = Math.min(100, Math.max(1, toNumber(q.pageSize, 50)))
      const offset = (page - 1) * pageSize

      const clauses: string[] = []
      const vals: any[] = []
      if (q.spanType) { clauses.push('span_type = ?'); vals.push(q.spanType) }
      if (q.markdownRole) { clauses.push('markdown_role = ?'); vals.push(q.markdownRole) }
      if (q.minConfidence) { clauses.push('confidence >= ?'); vals.push(q.minConfidence) }
      if (q.observationId) { clauses.push('observation_id = ?'); vals.push(q.observationId) }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const [countResult, { rows }] = await Promise.all([
        db.rawQuery(`SELECT COUNT(*)::int AS total FROM voyager.metadata_span ${where}`, vals),
        db.rawQuery(
          `SELECT id, span_id, observation_id, span_type, text, start_pos, end_pos,
                  confidence, markdown_role, discourse_role, event_candidate,
                  provenance, created_at
           FROM voyager.metadata_span ${where}
           ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...vals, pageSize, offset],
        ),
      ])

      return response.json({
        items: camelCaseRows(rows),
        total: countResult.rows[0].total,
        page,
        pageSize,
      })
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/spans/:id */
  async span({ params, response }: HttpContext) {
    try {
      const { rows: [span] } = await db.rawQuery(
        `SELECT id, span_id, observation_id, span_type, text, start_pos, end_pos,
                confidence, markdown_role, discourse_role, event_candidate,
                provenance, created_at
         FROM voyager.metadata_span WHERE id = ?`,
        [params.id],
      )
      if (!span) return errResponse(response, 404, 'Metadata span not found', '')
      return response.json(camelCaseRow(span))
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }

  /** GET /api/stats */
  async stats({ response }: HttpContext) {
    try {
      const queries: [string, string][] = [
        ['file_observations', 'SELECT COUNT(*)::int FROM voyager.file_observation'],
        ['directory_observations', 'SELECT COUNT(*)::int FROM voyager.directory_observation'],
        ['topology_signals', 'SELECT COUNT(*)::int FROM voyager.topology_signal'],
        ['edge_hints', 'SELECT COUNT(*)::int FROM voyager.observation_edge_hint'],
        ['metadata_spans', 'SELECT COUNT(*)::int FROM voyager.metadata_span'],
        ['scan_epochs', 'SELECT COUNT(*)::int FROM voyager.scan_epoch'],
        ['latest_epoch', 'SELECT id, status, started_at FROM voyager.scan_epoch ORDER BY started_at DESC LIMIT 1'],
        ['span_types', 'SELECT span_type, COUNT(*)::int FROM voyager.metadata_span GROUP BY span_type ORDER BY count DESC'],
      ]

      const stats: Record<string, any> = {}
      for (const [key, sql] of queries) {
        try {
          const { rows } = await db.rawQuery(sql)
          if (key === 'span_types') {
            stats[key] = rows
          } else if (key === 'latest_epoch') {
            stats[key] = rows.length > 0 ? camelCaseRow(rows[0]) : null
          } else {
            stats[key] = rows[0]?.count ?? 0
          }
        } catch {
          stats[key] = null
        }
      }

      return response.json(stats)
    } catch (err: any) {
      return errResponse(response, 500, err.message, '')
    }
  }
}
