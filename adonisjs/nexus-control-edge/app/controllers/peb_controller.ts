import type { HttpContext } from '@adonisjs/core/http'
import crypto from 'node:crypto'
import { q } from '#services/nebula_helpers'
import { sseBus, PEB_EVENTS, formatSseMessage } from '#services/peb_sse_bus'

// Mirrors peb-srv/src/routes/*.js. All queries are peb.*-qualified.

// ── Helpers (from peb-srv lib/pagination.js + errors.js) ─────────────
function isAcceptableId(s: unknown): boolean {
  if (typeof s !== 'string' || s.length === 0 || s.length > 256) return false
  if (!/^[\x21-\x7E]+$/.test(s)) return false
  return !/['"\\]/.test(s)
}

function clampLimit(v: unknown): number {
  if (v == null || v === '') return 100
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1) throw Object.assign(new Error('limit must be a positive integer'), { status: 400 })
  if (n > 500) return 500
  return n
}

function clampOffset(v: unknown): number {
  if (v == null || v === '') return 0
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) throw Object.assign(new Error('offset must be a non-negative integer'), { status: 400 })
  return n
}

function parseEventCursor(query: Record<string, any>): { limit: number; offset: number; since: number | null } {
  const limit = clampLimit(query?.limit)
  const offset = clampOffset(query?.offset)
  let since: number | null = null
  if (query?.since != null && query.since !== '') {
    const n = Number(query.since)
    if (!Number.isInteger(n) || n < 0) throw Object.assign(new Error('since must be a non-negative integer (governance_events.id cursor)'), { status: 400 })
    since = n
  }
  return { limit, offset, since }
}

function parseTimeWindow(v: unknown): Date | null {
  if (v == null || v === '') return null
  const m = /^(\d+)([hdm])$/.exec(String(v))
  if (!m) throw Object.assign(new Error('window must match N<h|d|m>, e.g. 24h, 1d, 45m'), { status: 400 })
  const n = Number(m[1])
  if (!Number.isFinite(n) || n <= 0) throw Object.assign(new Error('window length must be positive'), { status: 400 })
  const ms = { h: 3600_000, d: 86_400_000, m: 60_000 }[m[2] as 'h' | 'd' | 'm']
  return new Date(Date.now() - n * ms)
}

export default class PebController {
  // ── GET /api/peb/health ──
  async health({ response }: HttpContext) {
    try {
      const r = await q(
        `SELECT
          (SELECT COUNT(*)::int FROM peb.governance_events)    AS event_count,
          (SELECT COUNT(*)::int FROM peb.transactions)         AS transaction_count,
          (SELECT COUNT(*)::int FROM peb.violations)            AS violation_count,
          (SELECT COUNT(*)::int FROM peb.decisions)             AS decision_count,
          (SELECT COUNT(*)::int FROM peb.traces)               AS trace_count,
          (SELECT COUNT(*)::int FROM peb.role_circuit_breaker
                                         WHERE tripped > 0)     AS circuit_breakers_tripped`,
        [],
        'pg',
      )
      return response.json({ status: 'healthy', counts: r.rows[0] })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/health/circuit-breakers ──
  async circuitBreakers({ response }: HttpContext) {
    try {
      const r = await q(
        `SELECT role, tripped, tripped_at, retry_after, error, failure_count,
                updated_at,
                CASE WHEN tripped_at IS NOT NULL
                          AND retry_after IS NOT NULL
                          AND (now() - tripped_at) < make_interval(secs => retry_after)
                     THEN 'OPEN'
                     WHEN tripped_at IS NOT NULL AND tripped > 0
                     THEN 'RECOVERING'
                     ELSE 'CLOSED'
                END AS state
           FROM peb.role_circuit_breaker
          ORDER BY tripped DESC, tripped_at DESC NULLS LAST`,
        [],
        'pg',
      )
      return response.json({ circuit_breakers: r.rows })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/health/violations/summary ──
  async violationsSummary({ request, response }: HttpContext) {
    try {
      const groupBy = String(request.qs().group_by ?? 'severity').toLowerCase()
      const valid = ['severity', 'violation_type', 'entity_id']
      if (!valid.includes(groupBy)) {
        return response.status(400).json({ error: 'group_by must be one of: ' + valid.join(', ') })
      }
      const since = parseTimeWindow(request.qs().window)
      const args: any[] = []
      if (since) args.push(since)
      const where = since ? `WHERE v.created_at >= $1` : ''
      const r = await q(
        `SELECT v.${groupBy} AS key, count(*)::int AS total,
                count(*) FILTER (WHERE v.resolution = 'resolved')::int AS resolved_total
           FROM peb.violations v
         ${where}
        GROUP BY v.${groupBy}
        ORDER BY total DESC`,
        args,
        'pg',
      )
      return response.json({ grouped_by: groupBy, summary: r.rows })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/health/entropy ──
  async entropy({ request, response }: HttpContext) {
    try {
      const groupBy = String(request.qs().group_by ?? 'entropy_class').toLowerCase()
      const valid = ['entropy_class', 'author_id', 'status']
      if (!valid.includes(groupBy)) {
        return response.status(400).json({ error: 'group_by must be one of: ' + valid.join(', ') })
      }
      const since = parseTimeWindow(request.qs().window)
      const args: any[] = []
      if (since) args.push(since)
      const where = since ? `WHERE d.created_at >= $1` : ''
      const r = await q(
        `SELECT d.${groupBy} AS key,
                count(*)::int AS total,
                max(d.created_at) AS last_seen,
                min(d.created_at) AS first_seen
           FROM peb.decisions d
         ${where}
        GROUP BY d.${groupBy}
        ORDER BY total DESC`,
        args,
        'pg',
      )
      const trendArgs = since ? [since] : []
      const startExpr = since ? '$1::timestamptz' : "now() - interval '7 days'"
      const trend = await q(
        `SELECT dates.day AS day,
                COALESCE(d.${groupBy}, '_no_data') AS key,
                count(*)::int AS total
           FROM generate_series(
              ${startExpr},
              now(),
              interval '1 day'
           ) AS dates(day)
           LEFT JOIN peb.decisions d
             ON date_trunc('day', d.created_at) = dates.day
         ${since ? 'AND d.created_at >= $1' : ''}
         GROUP BY dates.day, COALESCE(d.${groupBy}, '_no_data')
         ORDER BY dates.day ASC, key ASC`,
        trendArgs,
        'pg',
      )
      return response.json({ group_by: groupBy, window: request.qs().window ?? null, summary: r.rows, trend: trend.rows })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/events ──
  async listEvents({ request, response }: HttpContext) {
    try {
      const { limit, offset, since } = parseEventCursor(request.qs())
      const args: any[] = []
      const where: string[] = []
      let n = 1

      if (since != null) {
        where.push(`ge.id > $${n++}`)
        args.push(since)
      }
      if (request.qs().event_type) {
        where.push(`ge.event_type = $${n++}`)
        args.push(String(request.qs().event_type))
      }
      if (request.qs().plan_id) {
        where.push(`ge.plan_id = $${n++}`)
        args.push(String(request.qs().plan_id))
      }
      if (request.qs().agent_role) {
        where.push(`ge.agent_role = $${n++}`)
        args.push(String(request.qs().agent_role))
      }
      if (request.qs().work_request_id) {
        where.push(`ge.work_request_id = $${n++}`)
        args.push(String(request.qs().work_request_id))
      }
      args.push(limit, offset)

      const sql = `
        SELECT ge.id, ge.receipt_id, ge.event_type, ge.work_request_id,
               ge.plan_id, ge.agent_role, ge.payload, ge.created_at, ge.replayed_at
        FROM peb.governance_events ge
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY ge.id ASC
        LIMIT $${n++} OFFSET $${n++}
      `
      const r = await q(sql, args, 'pg')
      const nextCursor = r.rows.length < limit ? null : r.rows[r.rows.length - 1].id
      return response.json({ events: r.rows, next_cursor: nextCursor, limit, offset })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/events/{receipt_id} ──
  async getEvent({ request, response }: HttpContext) {
    try {
      const rid = String(request.param('receipt_id'))
      if (!isAcceptableId(rid)) return response.status(400).json({ error: 'invalid receipt_id' })
      const r = await q(
        `SELECT ge.id, ge.receipt_id, ge.event_type, ge.work_request_id,
                ge.plan_id, ge.agent_role, ge.payload, ge.created_at, ge.replayed_at
         FROM peb.governance_events ge
         WHERE ge.receipt_id = $1
         ORDER BY ge.id DESC
         LIMIT 1`,
        [rid],
        'pg',
      )
      if (r.rowCount === 0) return response.status(404).json({ error: 'event not found' })
      return response.json({ event: r.rows[0] })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── POST /api/peb/events/{receipt_id}/replay ──
  async replayEvent({ request, response }: HttpContext) {
    try {
      const rid = String(request.param('receipt_id'))
      if (!isAcceptableId(rid)) return response.status(400).json({ error: 'invalid receipt_id' })
      const r = await q(
        `UPDATE peb.governance_events
            SET replayed_at = now()
          WHERE receipt_id = $1
          RETURNING id, receipt_id, event_type, work_request_id, plan_id,
                    agent_role, payload, created_at, replayed_at`,
        [rid],
        'pg',
      )
      if (r.rowCount === 0) return response.status(404).json({ error: 'event not found' })
      const ev = r.rows[0]
      sseBus.push('replay', {
        receipt_id: ev.receipt_id,
        plan_id: ev.plan_id,
        agent_role: ev.agent_role,
        replayed_at: ev.replayed_at,
      })
      return response.json({ replayed: ev })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/events/stream (SSE) ──
  async eventsStream({ request, response }: HttpContext) {
    response.response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.response.write(`event: ready\ndata: ${JSON.stringify({ connected: true })}\n\n`)

    const planId = request.qs().plan_id ? String(request.qs().plan_id) : null
    const agentRole = request.qs().agent_role ? String(request.qs().agent_role) : null

    let cursor = 0
    try {
      const r = await q('SELECT coalesce(max(id),0)::bigint AS max_id FROM peb.governance_events', [], 'pg')
      cursor = Number(r.rows[0].max_id)
    } catch (e: any) {
      response.response.write(`event: error\ndata: ${JSON.stringify({ stage: 'init', message: e.message })}\n\n`)
    }

    const onEvent = (event: any) => {
      const p = event.payload || {}
      if (planId && p.plan_id && p.plan_id !== planId) return
      if (agentRole && p.agent_role && p.agent_role !== agentRole) return
      response.response.write(formatSseMessage(event))
    }
    sseBus.on(PEB_EVENTS, onEvent)

    const keepalive = setInterval(() => {
      response.response.write(`: keepalive ${Date.now()}\n\n`)
    }, 15000)

    const poller = setInterval(async () => {
      try {
        const args: any[] = []
        const where = ['ge.id > $1']
        args.push(cursor)
        let n = 2
        if (planId) { where.push(`ge.plan_id = $${n++}`); args.push(planId) }
        if (agentRole) { where.push(`ge.agent_role = $${n++}`); args.push(agentRole) }
        const r = await q(
          `SELECT ge.id, ge.receipt_id, ge.event_type, ge.work_request_id,
                  ge.plan_id, ge.agent_role, ge.payload, ge.created_at, ge.replayed_at
             FROM peb.governance_events ge
            WHERE ${where.join(' AND ')}
            ORDER BY ge.id ASC
            LIMIT 100`,
          args,
          'pg',
        )
        for (const row of r.rows) {
          response.response.write(
            formatSseMessage({
              type: row.event_type || 'event',
              payload: row,
            }),
          )
          cursor = Number(row.id)
        }
      } catch (e: any) {
        response.response.write(`event: error\ndata: ${JSON.stringify({ stage: 'poll', message: e.message })}\n\n`)
      }
    }, 1000)

    response.response.on('close', () => {
      clearInterval(keepalive)
      clearInterval(poller)
      sseBus.off(PEB_EVENTS, onEvent)
      response.response.end()
    })
  }

  // ── GET /api/peb/transactions ──
  async listTransactions({ request, response }: HttpContext) {
    try {
      const limit = Math.min(500, Math.max(1, parseInt(String(request.qs().limit ?? '100'), 10) || 100))
      const offset = Math.max(0, parseInt(String(request.qs().offset ?? '0'), 10) || 0)
      const args: any[] = [limit, offset]
      const where: string[] = []
      let n = 3
      for (const [field, value] of Object.entries({
        entity_id: request.qs().entity_id,
        tool_name: request.qs().tool_name,
        admission_result: request.qs().admission_result,
      })) {
        if (value != null && value !== '') {
          where.push(`t.${field} = $${n++}`)
          args.push(String(value))
        }
      }
      if (request.qs().since) {
        where.push(`t.created_at >= $${n++}`)
        args.push(new Date(String(request.qs().since)))
      }
      const sql = `
        SELECT id, idempotency_key, entity_id, admission_result, tool_name,
               input, output, before_hash, after_hash, state_delta,
               created_at, committed_at, kernel_event_id, kernel_event_type
        FROM peb.transactions t
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY t.created_at DESC
        LIMIT $1 OFFSET $2
      `
      const r = await q(sql, args, 'pg')
      return response.json({ transactions: r.rows })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/transactions/{id} ──
  async getTransaction({ request, response }: HttpContext) {
    try {
      const id = String(request.param('id'))
      if (!isAcceptableId(id)) return response.status(400).json({ error: 'invalid id' })
      const r = await q(
        `SELECT id, idempotency_key, entity_id, admission_result, tool_name,
                input, output, before_hash, after_hash, state_delta,
                created_at, committed_at, kernel_event_id, kernel_event_type
         FROM peb.transactions WHERE id = $1`,
        [id],
        'pg',
      )
      if (r.rowCount === 0) return response.status(404).json({ error: 'transaction not found' })
      return response.json({ transaction: r.rows[0] })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/transactions/{id}/lineage ──
  async transactionLineage({ request, response }: HttpContext) {
    try {
      const id = String(request.param('id'))
      if (!isAcceptableId(id)) return response.status(400).json({ error: 'invalid id' })

      const tx = await q(
        `SELECT id, idempotency_key, entity_id, admission_result, tool_name,
                input, output, before_hash, after_hash, state_delta,
                created_at, committed_at, kernel_event_id, kernel_event_type
         FROM peb.transactions WHERE id = $1`,
        [id],
        'pg',
      )
      if (tx.rowCount === 0) return response.status(404).json({ error: 'transaction not found' })
      const transaction = tx.rows[0]

      const decisionsDirect = await q(`SELECT * FROM peb.decisions d WHERE d.transaction_id = $1`, [id], 'pg')

      let ancestryRows: any[] = []
      if (decisionsDirect.rows.length) {
        const anc = await q(
          `
          WITH RECURSIVE chain AS (
            SELECT d.id, d.parent_decision_id, d.rollback_of, d.title,
                   d.status, d.summary, d.entropy_class, d.created_at,
                   0 AS depth, 'direct' AS link
              FROM peb.decisions d
             WHERE d.transaction_id = $1
            UNION ALL
            SELECT p.id, p.parent_decision_id, p.rollback_of, p.title,
                   p.status, p.summary, p.entropy_class, p.created_at,
                   ch.depth + 1 AS depth,
                   CASE WHEN ch.rollback_of = p.id THEN 'rollback_of'
                        WHEN ch.parent_decision_id = p.id THEN 'parent'
                   END AS link
              FROM peb.decisions p
              JOIN chain ch
                ON ch.parent_decision_id = p.id OR ch.rollback_of = p.id
             WHERE ch.depth < 50
          )
          SELECT DISTINCT ON (chain.id) chain.* FROM chain ORDER BY chain.id, chain.depth
          `,
          [id],
          'pg',
        )
        ancestryRows = anc.rows
      }

      const tracesRows = (
        await q(
          `SELECT id, transaction_id, work_request_id, parent_trace_id, stage,
                  inputs, causal_entries, rejected_alternatives, confidence,
                  status, created_at
           FROM peb.traces WHERE transaction_id = $1`,
          [id],
          'pg',
        )
      ).rows

      const tracesTree = buildTraceTree(tracesRows)

      const violations = (
        await q(
          `
          SELECT v.id, v.violation_type, v.severity, v.capability_attempted,
                 v.context, v.resolution, v.created_at,
                 COALESCE(
                    (SELECT jsonb_agg(jsonb_build_object(
                              'capability_id', c.id,
                              'capability', c.capability,
                              'active', c.active,
                              'granted_by', c.granted_by,
                              'expires_at', c.expires_at,
                              'granted_at', c.created_at
                            ))
                       FROM peb.capabilities c
                      WHERE c.entity_id = v.entity_id
                        AND c.capability = v.capability_attempted
                        AND c.created_at <= v.created_at
                        AND (c.expires_at IS NULL OR c.expires_at > v.created_at)
                    ),
                    '[]'::jsonb
                 ) AS capability_grants_at_violation,
                 CASE WHEN EXISTS (
                       SELECT 1 FROM peb.capabilities c2
                       WHERE c2.entity_id = v.entity_id
                         AND c2.capability = v.capability_attempted
                         AND c2.created_at <= v.created_at
                         AND (c2.expires_at IS NULL OR c2.expires_at > v.created_at)
                 ) THEN false ELSE true END AS gap_detected
            FROM peb.violations v
           WHERE v.transaction_id = $1
           ORDER BY v.created_at
          `,
          [id],
          'pg',
        )
      ).rows

      let govEvents: any[] = []
      if (tracesRows.length > 0) {
        const wrIds = Array.from(new Set(tracesRows.map((t: any) => t.work_request_id).filter(Boolean)))
        if (wrIds.length > 0) {
          const govRes = await q(
            `SELECT ge.id, ge.receipt_id, ge.event_type, ge.work_request_id,
                    ge.plan_id, ge.agent_role, ge.payload, ge.created_at, ge.replayed_at
               FROM peb.governance_events ge
              WHERE ge.work_request_id = ANY($1::text[])
              ORDER BY ge.created_at ASC`,
            [wrIds],
            'pg',
          )
          govEvents = govRes.rows
        }
      }

      return response.json({
        transaction,
        decisions: decisionsDirect.rows,
        decision_chain: ancestryRows,
        traces: tracesRows,
        traces_tree: tracesTree,
        violations,
        governance_events: govEvents,
      })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/traces/{id}/tree ──
  async traceTree({ request, response }: HttpContext) {
    try {
      const id = String(request.param('id'))
      if (!isAcceptableId(id)) return response.status(400).json({ error: 'invalid id' })

      const head = await q(`SELECT id FROM peb.traces WHERE id = $1::uuid`, [id], 'pg')
      if (head.rowCount === 0) return response.status(404).json({ error: 'trace not found' })

      const descendants = await q(
        `
        WITH RECURSIVE walk AS (
          SELECT id, 0 AS depth
            FROM peb.traces WHERE id = $1::uuid
          UNION ALL
          SELECT t.id, w.depth + 1
            FROM peb.traces t
            JOIN walk w ON t.parent_trace_id = w.id
           WHERE w.depth < 200
        )
        SELECT t.id, t.transaction_id, t.work_request_id, t.parent_trace_id,
               t.stage, t.inputs, t.causal_entries, t.rejected_alternatives,
               t.confidence, t.status, t.created_at, w.depth
          FROM peb.traces t
          JOIN walk w ON t.id = w.id
         ORDER BY w.depth, t.created_at
        `,
        [id],
        'pg',
      )
      const flat = descendants.rows
      const tree = buildTree(flat)
      return response.json({ root_id: id, node_count: flat.length, tree })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/decisions ──
  async listDecisions({ request, response }: HttpContext) {
    try {
      const limit = Math.min(500, Math.max(1, parseInt(String(request.qs().limit ?? '100'), 10) || 100))
      const offset = Math.max(0, parseInt(String(request.qs().offset ?? '0'), 10) || 0)
      const args: any[] = [limit, offset]
      const where: string[] = []
      let n = 3

      for (const [field, value] of Object.entries({
        status: request.qs().status,
        author_id: request.qs().author_id,
        adr_number: request.qs().adr_number,
      })) {
        if (value != null && value !== '') {
          where.push(`d.${field} = $${n++}`)
          args.push(String(value))
        }
      }

      if (request.qs().affected_key) {
        where.push(`d.affected_keys && $${n++}`)
        args.push([request.qs().affected_key])
      }

      const sql = `
        SELECT id, adr_number, title, status, summary, affected_keys,
               entropy_class, author_id, parent_decision_id, rollback_of,
               created_at
        FROM peb.decisions d
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY d.created_at DESC
        LIMIT $1 OFFSET $2
      `
      const r = await q(sql, args, 'pg')
      return response.json({ decisions: r.rows, limit, offset })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/decisions/next-number ──
  async nextDecisionNumber({ response }: HttpContext) {
    try {
      const r = await q(
        `SELECT adr_number FROM peb.decisions
         WHERE adr_number IS NOT NULL
         ORDER BY (regexp_replace(adr_number, '[^0-9]', '', 'g'))::int DESC
         LIMIT 1`,
        [],
        'pg',
      )
      const last = r.rows[0]?.adr_number
      const lastNum = last ? parseInt(String(last).replace(/\D/g, ''), 10) || 0 : 0
      return response.json({ next: `ADR-${String(lastNum + 1).padStart(3, '0')}`, last })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/decisions/{id} ──
  async getDecision({ request, response }: HttpContext) {
    try {
      const id = String(request.param('id'))
      if (!isAcceptableId(id)) return response.status(400).json({ error: 'invalid id' })
      const r = await q(`SELECT * FROM peb.decisions WHERE id = $1::uuid`, [id], 'pg')
      if (r.rowCount === 0) return response.status(404).json({ error: 'decision not found' })
      return response.json(r.rows[0])
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── POST /api/peb/decisions ──
  async createDecision({ request, response }: HttpContext) {
    try {
      const b = request.all()
      const { title, author_id, summary, affected_keys, entropy_class, parent_decision_id, rollback_of, adr_number, status, transaction_id } = b
      if (!title) return response.status(400).json({ error: 'title is required' })
      if (!author_id) return response.status(400).json({ error: 'author_id is required' })

      let finalNumber = adr_number || null
      if (!finalNumber) {
        const r = await q(
          `SELECT adr_number FROM peb.decisions
           WHERE adr_number IS NOT NULL
           ORDER BY (regexp_replace(adr_number, '[^0-9]', '', 'g'))::int DESC
           LIMIT 1`,
          [],
          'pg',
        )
        const last = r.rows[0]?.adr_number
        const lastNum = last ? parseInt(String(last).replace(/\D/g, ''), 10) || 0 : 0
        finalNumber = `ADR-${String(lastNum + 1).padStart(3, '0')}`
      }

      const afterHash = summary ? crypto.createHash('sha256').update(JSON.stringify(summary)).digest('hex') : null

      const r = await q(
        `INSERT INTO peb.decisions
           (id, transaction_id, adr_number, title, status, summary,
            affected_keys, entropy_class, before_hash, after_hash,
            author_id, parent_decision_id, rollback_of, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NULL, $8, $9, $10, $11, now())
         RETURNING *`,
        [
          (transaction_id || '00000000-0000-0000-0000-000000000000'),
          finalNumber,
          title,
          status || 'proposed',
          summary ? JSON.stringify(summary) : null,
          affected_keys || null,
          entropy_class || null,
          afterHash,
          author_id,
          parent_decision_id || null,
          rollback_of || null,
        ],
        'pg',
      )
      return response.status(201).json(r.rows[0])
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── PATCH /api/peb/decisions/{id} ──
  async updateDecision({ request, response }: HttpContext) {
    try {
      const id = String(request.param('id'))
      if (!isAcceptableId(id)) return response.status(400).json({ error: 'invalid id' })

      const existing = await q(`SELECT * FROM peb.decisions WHERE id = $1::uuid`, [id], 'pg')
      if (existing.rowCount === 0) return response.status(404).json({ error: 'decision not found' })

      const current = existing.rows[0]
      const updates: string[] = []
      const args: any[] = []
      let n = 1

      for (const field of ['title', 'status', 'entropy_class', 'parent_decision_id']) {
        if (request.body()[field] !== undefined) {
          updates.push(`${field} = $${n++}`)
          args.push(request.body()[field])
        }
      }
      if (request.body().affected_keys !== undefined) {
        updates.push(`affected_keys = $${n++}`)
        args.push(request.body().affected_keys)
      }
      if (request.body().summary !== undefined) {
        updates.push(`summary = $${n++}`)
        args.push(JSON.stringify(request.body().summary))
        const afterHash = crypto.createHash('sha256').update(JSON.stringify(request.body().summary)).digest('hex')
        updates.push(`before_hash = $${n++}`)
        args.push(current.after_hash)
        updates.push(`after_hash = $${n++}`)
        args.push(afterHash)
      }

      if (updates.length === 0) {
        return response.json(current)
      }

      args.push(id)
      const r = await q(
        `UPDATE peb.decisions SET ${updates.join(', ')} WHERE id = $${n} RETURNING *`,
        args,
        'pg',
      )
      return response.json(r.rows[0])
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── POST /api/peb/decisions/{id}/supersede ──
  async supersedeDecision({ request, response }: HttpContext) {
    try {
      const id = String(request.param('id'))
      if (!isAcceptableId(id)) return response.status(400).json({ error: 'invalid id' })

      const existing = await q(`SELECT * FROM peb.decisions WHERE id = $1::uuid`, [id], 'pg')
      if (existing.rowCount === 0) return response.status(404).json({ error: 'decision not found' })

      const current = existing.rows[0]
      const { summary, author_id, title, affected_keys } = request.all()
      if (!summary) return response.status(400).json({ error: 'summary is required' })
      if (!author_id) return response.status(400).json({ error: 'author_id is required' })

      const numR = await q(
        `SELECT adr_number FROM peb.decisions
         WHERE adr_number IS NOT NULL
         ORDER BY (regexp_replace(adr_number, '[^0-9]', '', 'g'))::int DESC
         LIMIT 1`,
        [],
        'pg',
      )
      const last = numR.rows[0]?.adr_number
      const lastNum = last ? parseInt(String(last).replace(/\D/g, ''), 10) || 0 : 0
      const newNumber = `ADR-${String(lastNum + 1).padStart(3, '0')}`

      const afterHash = crypto.createHash('sha256').update(JSON.stringify(summary)).digest('hex')

      const newDecision = await q(
        `INSERT INTO peb.decisions
           (id, transaction_id, adr_number, title, status, summary,
            affected_keys, entropy_class, before_hash, after_hash,
            author_id, parent_decision_id, rollback_of, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'accepted', $4, $5,
                 NULL, $6, $7, $8, NULL, NULL, now())
         RETURNING *`,
        [
          current.transaction_id,
          newNumber,
          title || `${current.title} (supersedes ${current.adr_number})`,
          JSON.stringify(summary),
          affected_keys || current.affected_keys,
          current.after_hash,
          afterHash,
          author_id,
        ],
        'pg',
      )

      await q(`UPDATE peb.decisions SET status = 'superseded' WHERE id = $1::uuid`, [id], 'pg')

      return response.status(201).json({
        superseded: { id: current.id, adr_number: current.adr_number },
        decision: newDecision.rows[0],
      })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/decisions/{id}/chain ──
  async decisionChain({ request, response }: HttpContext) {
    try {
      const id = String(request.param('id'))
      if (!isAcceptableId(id)) return response.status(400).json({ error: 'invalid id' })
      const direction = String(request.qs().direction ?? 'ancestry').toLowerCase()

      const linkCol = direction === 'rollback' ? 'rollback_of' : 'parent_decision_id'

      const head = await q(`SELECT id FROM peb.decisions WHERE id = $1::uuid`, [id], 'pg')
      if (head.rowCount === 0) return response.status(404).json({ error: 'decision not found' })

      const chain = await q(
        `
        WITH RECURSIVE walk AS (
          SELECT d.id, d.transaction_id, d.adr_number, d.title, d.status,
                 d.summary, d.affected_keys, d.entropy_class, d.before_hash,
                 d.after_hash, d.author_id, d.parent_decision_id, d.rollback_of,
                 d.created_at, 0 AS depth
            FROM peb.decisions d
           WHERE d.id = $1::uuid
          UNION ALL
          SELECT p.id, p.transaction_id, p.adr_number, p.title, p.status,
                 p.summary, p.affected_keys, p.entropy_class, p.before_hash,
                 p.after_hash, p.author_id, p.parent_decision_id, p.rollback_of,
                 p.created_at, w.depth + 1
            FROM peb.decisions p
            JOIN walk w ON p.id = w.${linkCol}
           WHERE w.depth < 50
        )
        SELECT * FROM walk ORDER BY depth ASC
        `,
        [id],
        'pg',
      )

      return response.json({ direction, chain: chain.rows })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/entities/{entity_id}/capability-gap ──
  async capabilityGap({ request, response }: HttpContext) {
    try {
      const entity_id = String(request.param('entity_id'))
      if (!isAcceptableId(entity_id)) return response.status(400).json({ error: 'invalid entity_id' })

      const limit = clampLimit(request.qs().limit)
      const offset = clampOffset(request.qs().offset)

      const r = await q(
        `
        SELECT v.id AS violation_id,
               v.violation_type,
               v.severity,
               v.capability_attempted,
               v.context,
               v.resolution,
               v.created_at AS violation_created_at,
               (
                 SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'capability_id', c.id,
                    'capability',    c.capability,
                    'granted_by',    c.granted_by,
                    'granted_at',    c.created_at,
                    'expires_at',    c.expires_at,
                    'active',        c.active
                  )), '[]'::jsonb)
                   FROM peb.capabilities c
                  WHERE c.entity_id = v.entity_id
                    AND c.capability = v.capability_attempted
                    AND c.created_at <= v.created_at
                    AND (c.expires_at IS NULL OR c.expires_at > v.created_at)
                    AND c.active = true
               ) AS active_grants_at_violation,
               (
                 SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'capability_id', c.id,
                    'capability',    c.capability,
                    'granted_by',    c.granted_by,
                    'granted_at',     c.created_at,
                    'expires_at',     c.expires_at,
                    'active',         c.active
                  )), '[]'::jsonb)
                   FROM peb.capabilities c
                  WHERE c.entity_id = v.entity_id
                    AND c.capability = v.capability_attempted
                    AND NOT (
                       c.created_at <= v.created_at
                       AND (c.expires_at IS NULL OR c.expires_at > v.created_at)
                    )
               ) AS lapsed_grants_at_violation,
               CASE WHEN EXISTS (
                     SELECT 1 FROM peb.capabilities c
                     WHERE c.entity_id = v.entity_id
                       AND c.capability = v.capability_attempted
                       AND c.created_at <= v.created_at
                       AND (c.expires_at IS NULL OR c.expires_at > v.created_at)
                       AND c.active = true
               ) THEN 'active'
                    WHEN EXISTS (
                     SELECT 1 FROM peb.capabilities c
                     WHERE c.entity_id = v.entity_id
                       AND c.capability = v.capability_attempted
                    ) THEN 'lapsed'
                    ELSE 'missing'
               END AS gap_status
          FROM peb.violations v
         WHERE v.entity_id = $1
           AND v.capability_attempted IS NOT NULL
         ORDER BY v.created_at DESC
         LIMIT $2 OFFSET $3
        `,
        [entity_id, limit, offset],
        'pg',
      )

      const summary = r.rows.reduce(
        (acc: Record<string, number>, row: any) => {
          acc[row.gap_status] = (acc[row.gap_status] ?? 0) + 1
          return acc
        },
        { active: 0, lapsed: 0, missing: 0 },
      )

      return response.json({ entity_id, capability_gaps: r.rows, summary })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/entities/{entity_id}/capabilities ──
  async entityCapabilities({ request, response }: HttpContext) {
    try {
      const entity_id = String(request.param('entity_id'))
      if (!isAcceptableId(entity_id)) return response.status(400).json({ error: 'invalid entity_id' })
      const r = await q(
        `SELECT c.id, c.entity_id, c.capability, c.granted_by, c.expires_at,
                c.active, c.created_at,
                CASE WHEN c.expires_at IS NOT NULL AND c.expires_at < now()
                     THEN 'expired'
                     ELSE 'active'
                END AS status
           FROM peb.capabilities c
          WHERE c.entity_id = $1
          ORDER BY c.created_at DESC`,
        [entity_id],
        'pg',
      )
      return response.json({ entity_id, capabilities: r.rows })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/state/{key}/versions ──
  async stateVersions({ request, response }: HttpContext) {
    try {
      const key = String(request.param('key'))
      if (!isAcceptableId(key)) return response.status(400).json({ error: 'invalid key' })

      const cur = await q(`SELECT id, key, content, metadata, checksum, version, created_at, updated_at FROM peb.state WHERE key = $1`, [key], 'pg')
      const current = cur.rowCount ? cur.rows[0] : null

      const history = await q(
        `
        SELECT t.id AS transaction_id,
               t.created_at,
               t.committed_at,
               t.before_hash,
               t.after_hash,
               t.state_delta
          FROM peb.transactions t
         WHERE t.state_delta IS NOT NULL
           AND (
             t.state_delta ? $1
             OR jsonb_path_exists(t.state_delta,
                  ('$.keys[*] == "' || $1 || '"')::jsonpath)
           )
         ORDER BY t.committed_at NULLS LAST, t.created_at ASC
        `,
        [key],
        'pg',
      )

      return response.json({
        key,
        current,
        historical_versions: history.rows.map((r: any) => ({
          transaction_id: r.transaction_id,
          created_at: r.created_at,
          committed_at: r.committed_at,
          before_hash: r.before_hash,
          after_hash: r.after_hash,
          touched_key: true,
        })),
        version_count: history.rowCount + (current ? 1 : 0),
      })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }

  // ── GET /api/peb/state/{key}/diff ──
  async stateDiff({ request, response }: HttpContext) {
    try {
      const key = String(request.param('key'))
      if (!isAcceptableId(key)) return response.status(400).json({ error: 'invalid key' })
      const fromTx = request.qs().from
      const toRaw = request.qs().to
      if (!fromTx) return response.status(400).json({ error: 'from query parameter required (transaction id)' })
      if (!toRaw) return response.status(400).json({ error: 'to query parameter required (transaction id or "current")' })

      const touchers = await q(
        `
        SELECT t.id, t.created_at, t.committed_at, t.state_delta
          FROM peb.transactions t
         WHERE t.state_delta IS NOT NULL
           AND (
             t.state_delta ? $1
             OR jsonb_path_exists(t.state_delta,
                  ('$.keys[*] == "' || $1 || '"')::jsonpath)
           )
         ORDER BY t.committed_at NULLS LAST, t.created_at ASC
        `,
        [key],
        'pg',
      )

      if (touchers.rowCount === 0 && String(toRaw).toLowerCase() !== 'current') {
        return response.status(404).json({ error: 'no transactions touch key ' + key })
      }

      const ordered = touchers.rows
      const indexOfTx = (txId: string) => ordered.findIndex((t: any) => t.id === txId)
      const fromIdx = indexOfTx(String(fromTx))
      let toIdx: number
      if (String(toRaw).toLowerCase() === 'current') {
        toIdx = ordered.length - 1
      } else if (isAcceptableId(String(toRaw))) {
        toIdx = indexOfTx(String(toRaw))
      } else {
        return response.status(400).json({ error: 'invalid to query parameter' })
      }

      if (fromIdx === -1) return response.status(404).json({ error: `transaction ${fromTx} does not touch ${key}` })
      if (toIdx === -1 && String(toRaw).toLowerCase() !== 'current') {
        return response.status(404).json({ error: `transaction ${toRaw} does not touch ${key}` })
      }
      if (toIdx !== -1 && fromIdx > toIdx) {
        return response.status(400).json({ error: 'from transaction is later than to transaction' })
      }

      const snapshotAt = (endIdx: number) => {
        let snap: any = null
        for (let i = 0; i <= endIdx; i++) {
          const t = ordered[i]
          const kDelta = deepPick(t.state_delta, key)
          if (kDelta === undefined) continue
          snap = mergeShallow(snap, kDelta)
        }
        return snap
      }

      const fromContent = snapshotAt(fromIdx)
      let toContent: any
      if (String(toRaw).toLowerCase() === 'current') {
        const cur = await q(`SELECT content FROM peb.state WHERE key = $1`, [key], 'pg')
        toContent = cur.rows[0]?.content ?? null
      } else {
        toContent = snapshotAt(toIdx)
      }

      const diff = diffJsonb(fromContent, toContent)

      return response.json({
        key,
        from: {
          transaction_id: fromIdx >= 0 ? ordered[fromIdx].id : null,
          content: fromContent,
        },
        to: {
          transaction_id: String(toRaw).toLowerCase() === 'current' ? null : toIdx >= 0 ? ordered[toIdx].id : null,
          content: toContent,
        },
        diff,
      })
    } catch (err: any) {
      return response.status(err.status || 500).json({ error: err.message })
    }
  }
}

// ── Tree builders ────────────────────────────────────────────────────
function buildTree(rows: any[]): any[] {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as any[] }]))
  const roots: any[] = []
  for (const r of byId.values()) {
    if (r.parent_trace_id && byId.has(r.parent_trace_id)) {
      byId.get(r.parent_trace_id).children.push(r)
    } else if (r.depth === 0) {
      roots.push(r)
    }
  }
  return roots
}

function buildTraceTree(rows: any[]): any[] {
  const byId = new Map(rows.map((r) => [r.id, { ...r, children: [] as any[] }]))
  const roots: any[] = []
  for (const r of byId.values()) {
    if (r.parent_trace_id && byId.has(r.parent_trace_id)) {
      byId.get(r.parent_trace_id).children.push(r)
    } else {
      roots.push(r)
    }
  }
  return roots
}

// ── State diff helpers ───────────────────────────────────────────────
function deepPick(stateDelta: any, key: string): any {
  if (!stateDelta || typeof stateDelta !== 'object') return undefined
  if (Object.prototype.hasOwnProperty.call(stateDelta, key)) {
    return stateDelta[key]
  }
  if (Array.isArray(stateDelta.keys) && stateDelta.keys.includes(key)) {
    if (Object.prototype.hasOwnProperty.call(stateDelta, 'payload')) {
      return stateDelta.payload
    }
    return null
  }
  return undefined
}

function mergeShallow(prev: any, next: any): any {
  if (next === null && prev && typeof prev === 'object' && !Array.isArray(prev)) {
    return prev
  }
  if (next === null) return null
  if (prev === null) return next
  if (typeof prev === 'object' && typeof next === 'object' && !Array.isArray(prev) && !Array.isArray(next)) {
    return { ...prev, ...next }
  }
  return next
}

export function diffJsonb(fromVal: any, toVal: any): any {
  const out: any = { added: {}, removed: [], changed: [] }
  if (fromVal === toVal) return out
  if (fromVal === undefined || fromVal === null) return { added: toVal ?? {}, removed: [], changed: [] }
  if (toVal === undefined || toVal === null) {
    return { added: {}, removed: Object.keys(fromVal ?? {}), changed: [] }
  }
  if (typeof fromVal !== 'object' || typeof toVal !== 'object' || Array.isArray(fromVal) || Array.isArray(toVal)) {
    return { added: {}, removed: [], changed: [{ key: '$scalar', from: fromVal, to: toVal }] }
  }
  const fromKeys = Object.keys(fromVal)
  const toKeys = Object.keys(toVal)
  for (const k of toKeys) {
    if (!Object.prototype.hasOwnProperty.call(fromVal, k)) {
      out.added[k] = toVal[k]
    } else if (JSON.stringify(fromVal[k]) !== JSON.stringify(toVal[k])) {
      out.changed.push({ key: k, from: fromVal[k], to: toVal[k] })
    }
  }
  for (const k of fromKeys) {
    if (!Object.prototype.hasOwnProperty.call(toVal, k)) {
      out.removed.push(k)
    }
  }
  return out
}
