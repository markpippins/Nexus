import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'

// Mirrors cascade-srv/src/routes.ts. Queries are cascade.* / nebula.*
// qualified; uses the shared `pg` connection.

export default class CascadeController {
  // ── GET /cascade/events ──
  async listEvents({ request, response }: HttpContext) {
    try {
      const query = request.qs() as Record<string, string>
      const { type, source, aggregate_id, aggregate_type, correlation_id, since, until, limit = '50', offset = '0' } = query

      const conditions: string[] = []
      const params: any[] = []
      let idx = 1

      if (type) { conditions.push(`event_type = $${idx++}`); params.push(type) }
      if (source) { conditions.push(`source = $${idx++}`); params.push(source) }
      if (aggregate_id) { conditions.push(`aggregate_id = $${idx++}`); params.push(aggregate_id) }
      if (aggregate_type) { conditions.push(`aggregate_type = $${idx++}`); params.push(aggregate_type) }
      if (correlation_id) { conditions.push(`correlation_id = $${idx++}`); params.push(correlation_id) }
      if (since) { conditions.push(`event_timestamp >= $${idx++}`); params.push(since) }
      if (until) { conditions.push(`event_timestamp <= $${idx++}`); params.push(until) }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const lim = Math.min(parseInt(limit) || 50, 200)
      const off = parseInt(offset) || 0

      const rows = (
        await q(
          `SELECT event_id, event_type, source, event_timestamp, payload,
                  aggregate_type, aggregate_id, actor_type, actor_id,
                  correlation_id, causation_id, caused_by_event_type,
                  sequence_number, received_at
           FROM cascade.events
           ${where}
           ORDER BY event_timestamp DESC
           LIMIT $${idx++} OFFSET $${idx++}`,
          [...params, lim, off],
          'pg',
        )
      ).rows

      const countResult = await q(`SELECT COUNT(*)::text AS count FROM cascade.events ${where}`, params, 'pg')

      return response.json({
        events: rows,
        total: parseInt(countResult.rows[0]?.count || '0'),
        limit: lim,
        offset: off,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/events/:id ──
  async getEvent({ request, response }: HttpContext) {
    try {
      const rows = (
        await q(
          `SELECT event_id, event_type, source, event_timestamp, payload,
                  aggregate_type, aggregate_id, actor_type, actor_id,
                  correlation_id, causation_id, caused_by_event_type,
                  sequence_number, received_at
           FROM cascade.events
           WHERE event_id = $1`,
          [request.param('id')],
          'pg',
        )
      ).rows

      if (!rows.length) return response.status(404).json({ error: 'Event not found' })
      return response.json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/events/:id/lineage ──
  async eventLineage({ request, response }: HttpContext) {
    try {
      const maxDepth = Math.min(parseInt(String(request.qs().maxDepth) || '10', 10) || 10, 20)
      const rows = (
        await q(
          `WITH RECURSIVE lineage AS (
            SELECT event_id, event_type, causation_id, caused_by_event_type, source,
                   event_timestamp, payload, 0 AS depth
            FROM cascade.events
            WHERE event_id = $1

            UNION ALL

            SELECT e.event_id, e.event_type, e.causation_id, e.caused_by_event_type, e.source,
                   e.event_timestamp, e.payload, l.depth + 1
            FROM cascade.events e
            JOIN lineage l ON e.event_id = l.causation_id
            WHERE l.depth < $2
          )
          SELECT * FROM lineage ORDER BY depth ASC`,
          [request.param('id'), maxDepth],
          'pg',
        )
      ).rows

      return response.json({ anchor: request.param('id'), chain: rows, depth: rows.length })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/events/:id/children ──
  async eventChildren({ request, response }: HttpContext) {
    try {
      const rows = (
        await q(
          `SELECT event_id, event_type, aggregate_type, aggregate_id, source, event_timestamp
           FROM cascade.events
           WHERE causation_id = $1
           ORDER BY event_timestamp ASC`,
          [request.param('id')],
          'pg',
        )
      ).rows

      return response.json({ parent: request.param('id'), children: rows })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/lineage ──
  async lineage({ request, response }: HttpContext) {
    try {
      const { root, anchor, maxDepth = '5', edgeType = 'caused_by' } = request.qs() as Record<string, string>
      const depth = Math.min(parseInt(maxDepth) || 5, 15)

      if (!root && !anchor) {
        return response.status(400).json({ error: 'Provide ?root=<id> or ?anchor=<id>' })
      }

      const seedId = root || anchor
      const direction = root ? 'forward' : 'backward'

      const rows = (
        await q(
          `WITH RECURSIVE graph AS (
            SELECT event_id, event_type, causation_id, source, event_timestamp,
                   0 AS depth
            FROM cascade.events
            WHERE event_id = $1

            UNION ALL

            SELECT e.event_id, e.event_type, e.causation_id, e.source, e.event_timestamp,
                   g.depth + 1
            FROM cascade.events e
            JOIN graph g ON ${direction === 'forward' ? 'e.causation_id = g.event_id' : 'e.event_id = g.causation_id'}
            WHERE g.depth < $2
          )
          SELECT * FROM graph`,
          [seedId, depth],
          'pg',
        )
      ).rows

      const nodeMap = new Map<string, any>()
      const edges: any[] = []

      for (const row of rows) {
        nodeMap.set(row.event_id, {
          id: row.event_id,
          type: row.event_type,
          source: row.source,
          timestamp: row.event_timestamp,
          depth: row.depth,
        })

        if (row.causation_id) {
          edges.push({
            source: row.causation_id,
            target: row.event_id,
            type: edgeType,
          })
        }
      }

      return response.json({
        root: seedId,
        direction,
        nodes: Array.from(nodeMap.values()),
        edges,
        truncated: rows.length >= depth * 10,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/analytics ──
  async analytics({ request, response }: HttpContext) {
    try {
      const { range: timeRange = '24h', granularity = 'hour' } = request.qs() as Record<string, string>

      const intervalMap: Record<string, string> = {
        '1h': '1 hour', '6h': '6 hours', '24h': '24 hours',
        '7d': '7 days', '30d': '30 days',
      }
      const interval = intervalMap[timeRange] || '24 hours'

      const truncMap: Record<string, string> = {
        minute: 'minute', hour: 'hour', day: 'day',
      }
      const truncUnit = truncMap[granularity] || 'hour'

      const throughput = (
        await q(
          `SELECT event_type, COUNT(*)::int AS count
           FROM cascade.events
           WHERE event_timestamp >= NOW() - INTERVAL '${interval}'
           GROUP BY event_type
           ORDER BY count DESC`,
          [],
          'pg',
        )
      ).rows

      const timeline = (
        await q(
          `SELECT date_trunc('${truncUnit}', event_timestamp) AS bucket,
                  event_type, COUNT(*)::int AS count
           FROM cascade.events
           WHERE event_timestamp >= NOW() - INTERVAL '${interval}'
           GROUP BY bucket, event_type
           ORDER BY bucket ASC`,
          [],
          'pg',
        )
      ).rows

      const funnel = (
        await q(
          `SELECT
            (SELECT COUNT(DISTINCT aggregate_id)::int FROM cascade.events
             WHERE event_type = 'harvest.captured'
             AND event_timestamp >= NOW() - INTERVAL '${interval}') AS harvests,
            (SELECT COUNT(DISTINCT aggregate_id)::int FROM cascade.events
             WHERE event_type = 'candidate.discovered'
             AND event_timestamp >= NOW() - INTERVAL '${interval}') AS candidates,
            (SELECT COUNT(DISTINCT aggregate_id)::int FROM cascade.events
             WHERE event_type = 'candidate.promoted'
             AND event_timestamp >= NOW() - INTERVAL '${interval}') AS promoted,
            (SELECT COUNT(DISTINCT aggregate_id)::int FROM cascade.events
             WHERE event_type = 'intent_record.created'
             AND event_timestamp >= NOW() - INTERVAL '${interval}') AS intent_records,
            (SELECT COUNT(DISTINCT aggregate_id)::int FROM cascade.events
             WHERE event_type = 'requirement.promoted_to_plan'
             AND event_timestamp >= NOW() - INTERVAL '${interval}') AS plans`,
          [],
          'pg',
        )
      ).rows

      const topSources = (
        await q(
          `SELECT source, COUNT(*)::int AS count
           FROM cascade.events
           WHERE event_timestamp >= NOW() - INTERVAL '${interval}'
           GROUP BY source
           ORDER BY count DESC
           LIMIT 10`,
          [],
          'pg',
        )
      ).rows

      const totalResult = await q(
        `SELECT COUNT(*)::text AS count FROM cascade.events
         WHERE event_timestamp >= NOW() - INTERVAL '${interval}'`,
        [],
        'pg',
      )

      return response.json({
        range: timeRange,
        granularity: truncUnit,
        totalEvents: parseInt(totalResult.rows[0]?.count || '0'),
        throughput,
        timeline,
        pipelineFunnel: funnel[0] || {},
        topSources,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/subscribers ──
  async listSubscribers({ response }: HttpContext) {
    try {
      const rows = (
        await q(
          `SELECT s.subject_pattern, s.handler_name, s.description, s.enabled,
                  s.created_at,
                  p.last_timestamp AS last_processed,
                  p.processed_ids,
                  p.updated_at AS last_processed_at,
                  (SELECT COUNT(*)::int FROM cascade.events e
                   WHERE p.last_timestamp IS NULL OR e.event_timestamp > p.last_timestamp
                  ) AS lag
           FROM cascade.subscriptions s
           LEFT JOIN cascade.processing_offsets p ON p.subscriber_id = s.subject_pattern
           ORDER BY s.handler_name`,
          [],
          'pg',
        )
      ).rows

      return response.json({ subscribers: rows })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/subscribers/:pattern ──
  async getSubscriber({ request, response }: HttpContext) {
    try {
      const rows = (
        await q(
          `SELECT s.subject_pattern, s.handler_name, s.description, s.enabled,
                  s.created_at,
                  p.last_timestamp, p.processed_ids, p.updated_at AS last_offset_at
           FROM cascade.subscriptions s
           LEFT JOIN cascade.processing_offsets p ON p.subscriber_id = s.subject_pattern
           WHERE s.subject_pattern = $1`,
          [request.param('pattern')],
          'pg',
        )
      ).rows

      if (!rows.length) return response.status(404).json({ error: 'Subscriber not found' })
      return response.json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── PATCH /cascade/subscribers/:pattern ──
  async updateSubscriber({ request, response }: HttpContext) {
    try {
      const { enabled } = request.body()
      if (enabled === undefined) return response.status(400).json({ error: 'No fields to update' })

      const rows = (
        await q(
          `UPDATE cascade.subscriptions
           SET enabled = $1
           WHERE subject_pattern = $2
           RETURNING subject_pattern, handler_name, enabled`,
          [enabled, request.param('pattern')],
          'pg',
        )
      ).rows

      if (!rows.length) return response.status(404).json({ error: 'Subscriber not found' })
      return response.json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/assessments ──
  async listAssessments({ request, response }: HttpContext) {
    try {
      const { outcome, event_id, limit = '50', offset = '0' } = request.qs() as Record<string, string>

      const conditions: string[] = []
      const params: any[] = []
      let idx = 1

      if (outcome) { conditions.push(`ar.outcome = $${idx++}`); params.push(outcome) }
      if (event_id) { conditions.push(`ar.event_id = $${idx++}`); params.push(event_id) }

      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
      const lim = Math.min(parseInt(limit) || 50, 200)
      const off = parseInt(offset) || 0

      const rows = (
        await q(
          `SELECT ar.resolution_id, ar.event_id, ar.outcome, ar.confidence,
                  ar.rationale, ar.dimensions_used, ar.dimensions_total,
                  ar.resolved_at,
                  e.event_type, e.source, e.payload
           FROM nebula.assessment_resolutions ar
           LEFT JOIN cascade.events e ON e.event_id = ar.event_id
           ${where}
           ORDER BY ar.resolved_at DESC
           LIMIT $${idx++} OFFSET $${idx++}`,
          [...params, lim, off],
          'pg',
        )
      ).rows

      const countResult = await q(`SELECT COUNT(*)::text AS count FROM nebula.assessment_resolutions ar ${where}`, params, 'pg')

      return response.json({
        assessments: rows,
        total: parseInt(countResult.rows[0]?.count || '0'),
        limit: lim,
        offset: off,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /cascade/health ──
  async health({ response }: HttpContext) {
    try {
      const result = await q('SELECT NOW()::text AS now', [], 'pg')
      const countResult = await q('SELECT COUNT(*)::text AS count FROM cascade.events', [], 'pg')
      return response.json({
        status: 'ok',
        schema: 'cascade',
        totalEvents: parseInt(countResult.rows[0]?.count || '0'),
        time: result.rows[0]?.now,
        port: 3106,
      })
    } catch (err: any) {
      return response.status(503).json({ status: 'error', error: err.message })
    }
  }
}
