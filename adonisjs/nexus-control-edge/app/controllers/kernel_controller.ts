import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'
import { subscribe, incSubscriber, decSubscriber } from '#services/kernel_notify'

// All kernel-object references are fully qualified (kernel.*) because the
// pool's search_path is not pinned to the kernel schema. Mirrors the
// original kernel-srv routes.ts exactly.

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min
  return Math.max(min, Math.min(max, v))
}

export default class KernelController {
  // ── 1. POST /api/kernel/transitions  wraps sys_transition() ──
  async transitions({ request, response }: HttpContext) {
    const b = request.all()
    const required: string[] = ['event_type', 'aggregate_type', 'aggregate_id', 'actor']
    for (const f of required) {
      if (b[f] === undefined || b[f] === null || String(b[f]).trim() === '') {
        return response.status(400).json({ status: 'error', message: `Missing required field: ${f}` })
      }
    }
    try {
      const { rows } = await q(
        `SELECT * FROM kernel.sys_transition(
            p_event_type     := $1::kernel.event_type,
            p_aggregate_type := $2,
            p_aggregate_id   := $3,
            p_actor          := $4,
            p_payload        := $5::jsonb,
            p_authority      := $6,
            p_receipt        := $7,
            p_causation_id   := $8::uuid,
            p_correlation_id := $9::uuid
        );`,
        [
          b.event_type,
          b.aggregate_type,
          b.aggregate_id,
          b.actor,
          JSON.stringify(b.payload ?? {}),
          b.authority ?? null,
          b.receipt ?? null,
          b.causation_id ?? null,
          b.correlation_id ?? null,
        ],
        'pg',
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      if (err && err.code === '45000') {
        return response.status(403).json({ status: 'error', message: err.message })
      }
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'KERNEL_WRITE_FAILED', message: msg })
    }
  }

  // ── 2. GET /api/kernel/transitions/{event_id} ──
  async transitionById({ request, response }: HttpContext) {
    const event_id = String(request.param('event_id'))
    if (!isValidUuid(event_id)) return response.status(400).json({ status: 'error', message: 'event_id must be a UUID' })
    try {
      const { rows } = await q(`SELECT * FROM kernel.transition_event WHERE event_id = $1::uuid`, [event_id], 'pg')
      if (rows.length === 0) return response.status(404).json({ status: 'error', message: `No transition_event for event_id ${event_id}` })
      return response.json(rows[0])
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'KERNEL_READ_FAILED', message: msg })
    }
  }

  // ── 3. GET /api/kernel/transitions/{event_id}/causality ──
  async causality({ request, response }: HttpContext) {
    const event_id = String(request.param('event_id'))
    if (!isValidUuid(event_id)) return response.status(400).json({ status: 'error', message: 'event_id must be a UUID' })
    try {
      const exists = await q(`SELECT 1 FROM kernel.transition_event WHERE event_id = $1::uuid`, [event_id], 'pg')
      if (exists.rows.length === 0) return response.status(404).json({ status: 'error', message: `No transition_event for event_id ${event_id}` })
      const { rows } = await q(
        `SELECT * FROM kernel.v_causality_chain
         WHERE path @> ARRAY[$1::text]
         ORDER BY depth;`,
        [event_id],
        'pg',
      )
      return response.json({
        root_event_id: event_id,
        chain: rows,
        depth: rows.length > 0 ? Math.max(...rows.map((r: any) => r.depth)) : 0,
      })
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'KERNEL_READ_FAILED', message: msg })
    }
  }

  // ── 4. POST /api/kernel/receipts  wraps sys_issue_receipt() ──
  async receipts({ request, response }: HttpContext) {
    const b = request.all()
    const required: string[] = ['receipt_type', 'receipt_hash', 'event_id', 'issued_by']
    for (const f of required) {
      if (b[f] === undefined || b[f] === null || String(b[f]).trim() === '') {
        return response.status(400).json({ status: 'error', message: `Missing required field: ${f}` })
      }
    }
    try {
      const { rows } = await q(
        `SELECT * FROM kernel.sys_issue_receipt(
            p_receipt_type := $1,
            p_receipt_hash := $2,
            p_event_id     := $3::uuid,
            p_issued_by    := $4,
            p_plan_number  := $5,
            p_metadata     := $6::jsonb
        );`,
        [
          b.receipt_type,
          b.receipt_hash,
          b.event_id,
          b.issued_by,
          b.plan_number ?? null,
          JSON.stringify(b.metadata ?? {}),
        ],
        'pg',
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      if (err && err.code === '45000') {
        return response.status(403).json({ status: 'error', message: err.message })
      }
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'RECEIPT_ISSUE_FAILED', message: msg })
    }
  }

  // ── 5. GET /api/kernel/receipts/{id}/chain ──
  async receiptChain({ request, response }: HttpContext) {
    const id = String(request.param('id'))
    if (!isValidUuid(id)) return response.status(400).json({ status: 'error', message: 'id must be a UUID' })
    try {
      const start = await q(`SELECT * FROM kernel.receipt WHERE id = $1::uuid`, [id], 'pg')
      if (start.rows.length === 0) return response.status(404).json({ status: 'error', message: `No receipt for id ${id}` })
      const { rows } = await q(
        `SELECT * FROM kernel.v_receipt_chain WHERE event_id = $1::uuid ORDER BY receipt_created_at;`,
        [start.rows[0].event_id],
        'pg',
      )
      return response.json({
        receipt_id: id,
        event_id: start.rows[0].event_id,
        chain: rows,
      })
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'RECEIPT_READ_FAILED', message: msg })
    }
  }

  // ── 6. GET /api/kernel/plans/{plan_number}/receipts ──
  async planReceipts({ request, response }: HttpContext) {
    const plan_number = String(request.param('plan_number'))
    if (!plan_number || plan_number.trim() === '') {
      return response.status(400).json({ status: 'error', message: 'plan_number required' })
    }
    try {
      const { rows } = await q(
        `SELECT * FROM kernel.v_plan_receipts WHERE plan_number = $1;`,
        [plan_number],
        'pg',
      )
      if (rows.length === 0) {
        return response.status(404).json({ status: 'error', message: `No receipts found for plan_number ${plan_number}` })
      }
      return response.json({
        plan_number,
        summary: rows[0],
        chains: rows,
      })
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'PLAN_RECEIPTS_READ_FAILED', message: msg })
    }
  }

  // ── 7. GET /api/kernel/aggregates/{type}/{id}/events ──
  async aggregateEvents({ request, response }: HttpContext) {
    const aggregate_type = String(request.param('aggregate_type'))
    const aggregate_id = String(request.param('aggregate_id'))
    if (!aggregate_type || !aggregate_id) {
      return response.status(400).json({ status: 'error', message: 'aggregate_type and aggregate_id required' })
    }
    try {
      const { rows } = await q(
        `SELECT * FROM kernel.v_aggregate_events
         WHERE aggregate_type = $1 AND aggregate_id = $2;`,
        [aggregate_type, aggregate_id],
        'pg',
      )
      if (rows.length === 0) {
        return response.status(404).json({ status: 'error', message: `No events for aggregate ${aggregate_type}/${aggregate_id}` })
      }
      return response.json({ aggregate_type, aggregate_id, aggregates: rows[0] })
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'AGGREGATE_READ_FAILED', message: msg })
    }
  }

  // ── 8. GET /api/kernel/policy/active ──
  async policyActive({ response }: HttpContext) {
    try {
      const { rows } = await q(`SELECT * FROM kernel.v_active_policy ORDER BY priority;`, [], 'pg')
      return response.json({ active_rules: rows, count: rows.length })
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'POLICY_READ_FAILED', message: msg })
    }
  }

  // ── 9. GET /api/kernel/policy/maturity ──
  async policyMaturity({ response }: HttpContext) {
    try {
      const { rows } = await q(`SELECT * FROM kernel.v_policy_maturity;`, [], 'pg')
      return response.json(rows[0] ?? {
        total_rules: 0,
        enabled_rules: 0,
        compiled_enabled: 0,
        data_driven_enabled: 0,
        disabled_rules: 0,
        data_driven_pct: '0',
        compiled_pct: '0',
      })
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'POLICY_MATURITY_READ_FAILED', message: msg })
    }
  }

  // ── 10. GET /api/kernel/health/recent-events ──
  async recentEvents({ request, response }: HttpContext) {
    const limit = clamp(parseInt(String(request.qs().limit ?? '20'), 10), 1, 500)
    try {
      const { rows } = await q(
        `SELECT * FROM kernel.v_recent_events ORDER BY event_timestamp DESC LIMIT $1;`,
        [limit],
        'pg',
      )
      return response.json({ recent: rows, count: rows.length })
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'RECENT_EVENTS_READ_FAILED', message: msg })
    }
  }

  // ── 11. GET /api/kernel/health/receipt-integrity ──
  async receiptIntegrity({ response }: HttpContext) {
    try {
      const { rows } = await q(
        `SELECT
            r.id            AS receipt_id,
            r.receipt_type,
            r.receipt_hash,
            r.event_id,
            r.issued_by,
            r.created_at
         FROM kernel.receipt r
         LEFT JOIN kernel.transition_event te ON te.event_id = r.event_id
         WHERE te.receipt IS NULL
         ORDER BY r.created_at DESC;`,
        [],
        'pg',
      )
      return response.json({
        orphan_count: rows.length,
        orphans: rows,
      })
    } catch (err: any) {
      const msg = err && err.message ? err.message : String(err)
      return response.status(500).json({ status: 'error', code: 'RECEIPT_INTEGRITY_READ_FAILED', message: msg })
    }
  }

  // ── 12. SSE GET /api/kernel/events/stream ──
  async eventsStream({ response }: HttpContext) {
    response.response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    response.response.write(`event: ready\ndata: ${JSON.stringify({ channel: 'kernel_transition_committed' })}\n\n`)

    const unsub = subscribe((evt: any) => {
      response.response.write(`event: kernel_event\ndata: ${JSON.stringify(evt)}\n\n`)
    })

    incSubscriber()

    const keepalive = setInterval(() => {
      try {
        response.response.write(`: keepalive ${Date.now()}\n\n`)
      } catch {
        /* closed */
      }
    }, 15000)

    const cleanup = (): void => {
      clearInterval(keepalive)
      unsub()
      decSubscriber()
    }

    response.response.on('close', cleanup)
    response.response.on('error', cleanup)
  }
}
