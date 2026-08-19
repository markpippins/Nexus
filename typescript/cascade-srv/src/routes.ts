import { Router, Request, Response } from 'express';
import { queryRows, query } from './db';

const router = Router();

// ─── GET /events ────────────────────────────────────────────────────────────
// List events with filtering, pagination, and optional time-range aggregation.
router.get('/events', async (req: Request, res: Response) => {
  try {
    const {
      type, source, aggregate_id, aggregate_type, correlation_id,
      since, until,
      limit = '50', offset = '0',
    } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (type)           { conditions.push(`event_type = $${idx++}`);       params.push(type); }
    if (source)         { conditions.push(`source = $${idx++}`);           params.push(source); }
    if (aggregate_id)   { conditions.push(`aggregate_id = $${idx++}`);     params.push(aggregate_id); }
    if (aggregate_type) { conditions.push(`aggregate_type = $${idx++}`);   params.push(aggregate_type); }
    if (correlation_id) { conditions.push(`correlation_id = $${idx++}`);   params.push(correlation_id); }
    if (since)          { conditions.push(`event_timestamp >= $${idx++}`); params.push(since); }
    if (until)          { conditions.push(`event_timestamp <= $${idx++}`); params.push(until); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    const rows = await queryRows(`
      SELECT event_id, event_type, source, event_timestamp, payload,
             aggregate_type, aggregate_id, actor_type, actor_id,
             correlation_id, causation_id, caused_by_event_type,
             sequence_number, received_at
      FROM cascade.events
      ${where}
      ORDER BY event_timestamp DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, lim, off]);

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cascade.events ${where}`,
      params
    );

    res.json({
      events: rows,
      total: parseInt(countResult.rows[0]?.count || '0'),
      limit: lim,
      offset: off,
    });
  } catch (err: any) {
    console.error('GET /events error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /events/:id ────────────────────────────────────────────────────────
// Single event detail.
router.get('/events/:id', async (req: Request, res: Response) => {
  try {
    const rows = await queryRows(`
      SELECT event_id, event_type, source, event_timestamp, payload,
             aggregate_type, aggregate_id, actor_type, actor_id,
             correlation_id, causation_id, caused_by_event_type,
             sequence_number, received_at
      FROM cascade.events
      WHERE event_id = $1
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Event not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /events/:id/lineage ────────────────────────────────────────────────
// Walk the causation chain backward (what triggered this event).
router.get('/events/:id/lineage', async (req: Request, res: Response) => {
  try {
    const maxDepth = Math.min(parseInt(req.query.maxDepth as string) || 10, 20);

    // Recursive CTE: walk causation_id chain
    const rows = await queryRows(`
      WITH RECURSIVE lineage AS (
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
      SELECT * FROM lineage ORDER BY depth ASC
    `, [req.params.id, maxDepth]);

    res.json({ anchor: req.params.id, chain: rows, depth: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /events/:id/children ───────────────────────────────────────────────
// What events did this one trigger? (causation_id pointing back to this event)
router.get('/events/:id/children', async (req: Request, res: Response) => {
  try {
    const rows = await queryRows(`
      SELECT event_id, event_type, aggregate_type, aggregate_id, source, event_timestamp
      FROM cascade.events
      WHERE causation_id = $1
      ORDER BY event_timestamp ASC
    `, [req.params.id]);

    res.json({ parent: req.params.id, children: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /lineage ───────────────────────────────────────────────────────────
// Graph-style lineage query: nodes + edges between events.
router.get('/lineage', async (req: Request, res: Response) => {
  try {
    const { root, anchor, maxDepth = '5', edgeType = 'caused_by' } = req.query as Record<string, string>;
    const depth = Math.min(parseInt(maxDepth) || 5, 15);

    if (!root && !anchor) {
      return res.status(400).json({ error: 'Provide ?root=<id> or ?anchor=<id>' });
    }

    const seedId = root || anchor;
    const direction = root ? 'forward' : 'backward';

    // Collect nodes and edges via recursive CTE
    const rows = await queryRows(`
      WITH RECURSIVE graph AS (
        SELECT event_id, event_type, causation_id, source, event_timestamp,
               0 AS depth
        FROM cascade.events
        WHERE event_id = $1

        UNION ALL

        SELECT e.event_id, e.event_type, e.causation_id, e.source, e.event_timestamp,
               g.depth + 1
        FROM cascade.events e
        JOIN graph g ON ${direction === 'forward'
          ? 'e.causation_id = g.event_id'
          : 'e.event_id = g.causation_id'}
        WHERE g.depth < $2
      )
      SELECT * FROM graph
    `, [seedId, depth]);

    // Build nodes and edges
    const nodeMap = new Map<string, any>();
    const edges: any[] = [];

    for (const row of rows) {
      nodeMap.set(row.event_id, {
        id: row.event_id,
        type: row.event_type,
        source: row.source,
        timestamp: row.event_timestamp,
        depth: row.depth,
      });

      if (row.causation_id) {
        edges.push({
          source: row.causation_id,
          target: row.event_id,
          type: edgeType,
        });
      }
    }

    res.json({
      root: seedId,
      direction,
      nodes: Array.from(nodeMap.values()),
      edges,
      truncated: rows.length >= depth * 10,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /analytics ─────────────────────────────────────────────────────────
// Aggregated event metrics for dashboards.
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const { range: timeRange = '24h', granularity = 'hour' } = req.query as Record<string, string>;

    const intervalMap: Record<string, string> = {
      '1h': "1 hour", '6h': "6 hours", '24h': "24 hours",
      '7d': "7 days", '30d': "30 days",
    };
    const interval = intervalMap[timeRange] || "24 hours";

    const truncMap: Record<string, string> = {
      'minute': "minute", 'hour': "hour", 'day': "day",
    };
    const truncUnit = truncMap[granularity] || "hour";

    // Throughput by event type
    const throughput = await queryRows(`
      SELECT event_type, COUNT(*)::int AS count
      FROM cascade.events
      WHERE event_timestamp >= NOW() - INTERVAL '${interval}'
      GROUP BY event_type
      ORDER BY count DESC
    `);

    // Timeline (bucketed counts)
    const timeline = await queryRows(`
      SELECT date_trunc('${truncUnit}', event_timestamp) AS bucket,
             event_type, COUNT(*)::int AS count
      FROM cascade.events
      WHERE event_timestamp >= NOW() - INTERVAL '${interval}'
      GROUP BY bucket, event_type
      ORDER BY bucket ASC
    `);

    // Pipeline funnel: harvests → candidates → promoted → intents → plans
    const funnel = await queryRows(`
      SELECT
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
         WHERE event_type = 'requirement.promoted_to_plan'
         AND event_timestamp >= NOW() - INTERVAL '${interval}') AS plans
    `);

    // Top sources
    const topSources = await queryRows(`
      SELECT source, COUNT(*)::int AS count
      FROM cascade.events
      WHERE event_timestamp >= NOW() - INTERVAL '${interval}'
      GROUP BY source
      ORDER BY count DESC
      LIMIT 10
    `);

    // Total events
    const totalResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM cascade.events
       WHERE event_timestamp >= NOW() - INTERVAL '${interval}'`
    );

    res.json({
      range: timeRange,
      granularity: truncUnit,
      totalEvents: parseInt(totalResult.rows[0]?.count || '0'),
      throughput,
      timeline,
      pipelineFunnel: funnel[0] || {},
      topSources,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /subscribers ───────────────────────────────────────────────────────
// List registered subscribers with their processing offsets.
router.get('/subscribers', async (req: Request, res: Response) => {
  try {
    const rows = await queryRows(`
      SELECT s.subject_pattern, s.handler_name, s.description, s.enabled,
             s.created_at,
             p.last_timestamp AS last_processed,
             p.processed_ids,
             p.updated_at AS last_processed_at,
             (SELECT COUNT(*)::int FROM cascade.events e
              WHERE p.last_timestamp IS NULL OR e.event_timestamp > p.last_timestamp
             ) AS lag
      FROM cascade.subscriptions s
      LEFT JOIN cascade.processing_offsets p ON p.subscriber_id = s.subject_pattern
      ORDER BY s.handler_name
    `);

    res.json({ subscribers: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /subscribers/:pattern ──────────────────────────────────────────────
// Get a single subscriber by subject_pattern.
router.get('/subscribers/:pattern', async (req: Request, res: Response) => {
  try {
    const rows = await queryRows(`
      SELECT s.subject_pattern, s.handler_name, s.description, s.enabled,
             s.created_at,
             p.last_timestamp, p.processed_ids, p.updated_at AS last_offset_at
      FROM cascade.subscriptions s
      LEFT JOIN cascade.processing_offsets p ON p.subscriber_id = s.subject_pattern
      WHERE s.subject_pattern = $1
    `, [req.params.pattern]);

    if (!rows.length) return res.status(404).json({ error: 'Subscriber not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PATCH /subscribers/:pattern ────────────────────────────────────────────
// Update subscriber config (enable/disable).
router.patch('/subscribers/:pattern', async (req: Request, res: Response) => {
  try {
    const { enabled } = req.body;
    if (enabled === undefined) return res.status(400).json({ error: 'No fields to update' });

    const rows = await queryRows(`
      UPDATE cascade.subscriptions
      SET enabled = $1
      WHERE subject_pattern = $2
      RETURNING subject_pattern, handler_name, enabled
    `, [enabled, req.params.pattern]);

    if (!rows.length) return res.status(404).json({ error: 'Subscriber not found' });
    res.json(rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /assessments ───────────────────────────────────────────────────────
// Assessment resolutions — how cascade assessors resolved events.
router.get('/assessments', async (req: Request, res: Response) => {
  try {
    const { outcome, event_id, limit = '50', offset = '0' } = req.query as Record<string, string>;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (outcome)  { conditions.push(`ar.outcome = $${idx++}`);   params.push(outcome); }
    if (event_id){ conditions.push(`ar.event_id = $${idx++}`);   params.push(event_id); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const lim = Math.min(parseInt(limit) || 50, 200);
    const off = parseInt(offset) || 0;

    const rows = await queryRows(`
      SELECT ar.resolution_id, ar.event_id, ar.outcome, ar.confidence,
             ar.rationale, ar.dimensions_used, ar.dimensions_total,
             ar.resolved_at,
             e.event_type, e.source, e.payload
      FROM nebula.assessment_resolutions ar
      LEFT JOIN cascade.events e ON e.event_id = ar.event_id
      ${where}
      ORDER BY ar.resolved_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, [...params, lim, off]);

    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM nebula.assessment_resolutions ar ${where}`,
      params
    );

    res.json({
      assessments: rows,
      total: parseInt(countResult.rows[0]?.count || '0'),
      limit: lim,
      offset: off,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /health ────────────────────────────────────────────────────────────
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const result = await query<{ now: string }>('SELECT NOW()::text AS now');
    const countResult = await query<{ count: string }>('SELECT COUNT(*)::text AS count FROM cascade.events');
    res.json({
      status: 'ok',
      schema: 'cascade',
      totalEvents: parseInt(countResult.rows[0]?.count || '0'),
      time: result.rows[0]?.now,
      port: 3106,
    });
  } catch (err: any) {
    res.status(503).json({ status: 'error', error: err.message });
  }
});

export default router;
