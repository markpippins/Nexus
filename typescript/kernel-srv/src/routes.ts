import { Router, Request, Response } from 'express';
import type { Pool } from 'pg';
import { subscribe, type KernelEvent } from './notify';

// All kernel-object references are fully qualified (kernel.*) because
// the pool's search_path is not pinned to the kernel schema.

export interface RouteDeps {
  subscribe: typeof subscribe;
  incSubscriber: () => number;
  decSubscriber: () => number;
}

export function createRoutes(pool: Pool, deps: RouteDeps): Router {
  const router = Router();

  // ── Helpers ────────────────────────────────────────────────────────

  function badRequest(res: Response, message: string): void {
    res.status(400).json({ status: 'error', message });
  }

  function notFound(res: Response, message: string): void {
    res.status(404).json({ status: 'error', message });
  }

  function serverError(res: Response, message: string, code: string): void {
    res.status(500).json({ status: 'error', code, message });
  }

  function isPgError(err: unknown): err is { code: string; message: string } {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      'message' in err
    );
  }

  // ── 1. POST /api/kernel/transitions            wraps sys_transition() ─
  router.post('/transitions', async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const required: string[] = ['event_type', 'aggregate_type', 'aggregate_id', 'actor'];
    for (const f of required) {
      if (b[f] === undefined || b[f] === null || String(b[f]).trim() === '') {
        return badRequest(res, `Missing required field: ${f}`);
      }
    }
    try {
      const { rows } = await pool.query(
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
      );
      res.status(201).json(rows[0]);
    } catch (err: unknown) {
      if (isPgError(err) && err.code === '45000') {
        // RAISE EXCEPTION in kernel trigger — user-facing auth/validation
        return res.status(403).json({ status: 'error', message: err.message });
      }
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'KERNEL_WRITE_FAILED');
    }
  });

  // ── 2. GET  /api/kernel/transitions/{event_id} ────────────────────────
  router.get('/transitions/:event_id', async (req: Request, res: Response) => {
    const event_id = String(req.params.event_id);
    if (!isValidUuid(event_id)) return badRequest(res, 'event_id must be a UUID');
    try {
      const { rows } = await pool.query(
        `SELECT * FROM kernel.transition_event WHERE event_id = $1::uuid`,
        [event_id],
      );
      if (rows.length === 0) return notFound(res, `No transition_event for event_id ${event_id}`);
      res.json(rows[0]);
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'KERNEL_READ_FAILED');
    }
  });

  // ── 3. GET  /api/kernel/transitions/{event_id}/causality                  (v_causality_chain scoped) ─
  router.get('/transitions/:event_id/causality', async (req: Request, res: Response) => {
    const event_id = String(req.params.event_id);
    if (!isValidUuid(event_id)) return badRequest(res, 'event_id must be a UUID');
    try {
      // First confirm the event exists so we can return 404 cleanly.
      const exists = await pool.query(
        `SELECT 1 FROM kernel.transition_event WHERE event_id = $1::uuid`,
        [event_id],
      );
      if (exists.rows.length === 0) return notFound(res, `No transition_event for event_id ${event_id}`);
      // The causality chain rooted at this event: walk descendants of the
      // event_id and also walk UP via causation_id to the root. The view
      // re-runs the entire recursive CTE; we filter the result on the
      // path column (text[]) to events whose path array contains event_id.
      const { rows } = await pool.query(
        `SELECT * FROM kernel.v_causality_chain
         WHERE path @> ARRAY[$1::text]
         ORDER BY depth;`,
        [event_id],
      );
      res.json({
        root_event_id: event_id,
        chain: rows,
        depth: rows.length > 0 ? Math.max(...rows.map((r: any) => r.depth)) : 0,
      });
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'KERNEL_READ_FAILED');
    }
  });

  // ── 4. POST /api/kernel/receipts             wraps sys_issue_receipt() ─
  router.post('/receipts', async (req: Request, res: Response) => {
    const b = req.body ?? {};
    const required: string[] = ['receipt_type', 'receipt_hash', 'event_id', 'issued_by'];
    for (const f of required) {
      if (b[f] === undefined || b[f] === null || String(b[f]).trim() === '') {
        return badRequest(res, `Missing required field: ${f}`);
      }
    }
    try {
      const { rows } = await pool.query(
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
      );
      res.status(201).json(rows[0]);
    } catch (err: unknown) {
      if (isPgError(err) && err.code === '45000') {
        return res.status(403).json({ status: 'error', message: err.message });
      }
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'RECEIPT_ISSUE_FAILED');
    }
  });

  // ── 5. GET  /api/kernel/receipts/{id}/chain                  wraps v_receipt_chain ─
  router.get('/receipts/:id/chain', async (req: Request, res: Response) => {
    const id = String(req.params.id);
    if (!isValidUuid(id)) return badRequest(res, 'id must be a UUID');
    try {
      // The v_receipt_chain view presents one row per (receipt, event). Scoping
      // to a starting receipt gives us that receipt plus any causally-linked
      // siblings — we walk forward via v_receipt_chain's joins.
      const start = await pool.query(`SELECT * FROM kernel.receipt WHERE id = $1::uuid`, [id]);
      if (start.rows.length === 0) return notFound(res, `No receipt for id ${id}`);
      const { rows } = await pool.query(
        `SELECT * FROM kernel.v_receipt_chain WHERE event_id = $1::uuid ORDER BY receipt_created_at;`,
        [start.rows[0].event_id],
      );
      res.json({
        receipt_id: id,
        event_id: start.rows[0].event_id,
        chain: rows,
      });
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'RECEIPT_READ_FAILED');
    }
  });

  // ── 6. GET  /api/kernel/plans/{plan_number}/receipts       wraps v_plan_receipts ─
  router.get('/plans/:plan_number/receipts', async (req: Request, res: Response) => {
    const plan_number = String(req.params.plan_number);
    if (!plan_number || plan_number.trim() === '') {
      return badRequest(res, 'plan_number required');
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM kernel.v_plan_receipts WHERE plan_number = $1;`,
        [plan_number],
      );
      if (rows.length === 0) {
        // 404 when no receipts have ever been issued for this plan.
        return notFound(res, `No receipts found for plan_number ${plan_number}`);
      }
      res.json({
        plan_number,
        summary: rows[0],
        chains: rows,
      });
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'PLAN_RECEIPTS_READ_FAILED');
    }
  });

  // ── 7. GET  /api/kernel/aggregates/{type}/{id}/events    wraps v_aggregate_events ─
  router.get('/aggregates/:aggregate_type/:aggregate_id/events', async (req: Request, res: Response) => {
    const aggregate_type = String(req.params.aggregate_type);
    const aggregate_id = String(req.params.aggregate_id);
    if (!aggregate_type || !aggregate_id) {
      return badRequest(res, 'aggregate_type and aggregate_id required');
    }
    try {
      const { rows } = await pool.query(
        `SELECT * FROM kernel.v_aggregate_events
         WHERE aggregate_type = $1 AND aggregate_id = $2;`,
        [aggregate_type, aggregate_id],
      );
      if (rows.length === 0) {
        return notFound(res, `No events for aggregate ${aggregate_type}/${aggregate_id}`);
      }
      res.json({ aggregate_type, aggregate_id, aggregates: rows[0] });
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'AGGREGATE_READ_FAILED');
    }
  });

  // ── 8. GET  /api/kernel/policy/active                   wraps v_active_policy ─
  router.get('/policy/active', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM kernel.v_active_policy ORDER BY priority;`);
      res.json({ active_rules: rows, count: rows.length });
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'POLICY_READ_FAILED');
    }
  });

  // ── 9. GET  /api/kernel/policy/maturity   (compiled-vs-data-driven ratio) ─
  router.get('/policy/maturity', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(`SELECT * FROM kernel.v_policy_maturity;`);
      res.json(rows[0] ?? {
        total_rules: 0,
        enabled_rules: 0,
        compiled_enabled: 0,
        data_driven_enabled: 0,
        disabled_rules: 0,
        data_driven_pct: '0',
        compiled_pct: '0',
      });
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'POLICY_MATURITY_READ_FAILED');
    }
  });

  // ── 10. GET /api/kernel/health/recent-events                wraps v_recent_events ─
  router.get('/health/recent-events', async (req: Request, res: Response) => {
    const limit = clamp(parseInt(String(req.query.limit ?? '20'), 10), 1, 500);
    try {
      const { rows } = await pool.query(
        `SELECT * FROM kernel.v_recent_events ORDER BY event_timestamp DESC LIMIT $1;`,
        [limit],
      );
      res.json({ recent: rows, count: rows.length });
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'RECENT_EVENTS_READ_FAILED');
    }
  });

  // ── 11. GET /api/kernel/health/receipt-integrity ─ orphan-check ─
  // Receipts with no matching transition_event.receipt_id back-link.
  // Per the thread analysis, this measures the "sole write surface"
  // invariant: every receipt should have a back-link on its event.
  router.get('/health/receipt-integrity', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
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
      );
      res.json({
        orphan_count: rows.length,
        orphans: rows,
      });
    } catch (err: unknown) {
      const msg = isPgError(err) ? err.message : String(err);
      return serverError(res, msg, 'RECEIPT_INTEGRITY_READ_FAILED');
    }
  });

  // ── 12. SSE /api/kernel/events/stream ─ live kernel events ─────
  router.get('/events/stream', (req: Request, res: Response) => {
    // Force text/event-stream headers and prevent buffering/proxies.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`event: ready\ndata: ${JSON.stringify({ channel: 'kernel_transition_committed' })}\n\n`);

    const unsub = deps.subscribe((evt: KernelEvent) => {
      res.write(`event: kernel_event\ndata: ${JSON.stringify(evt)}\n\n`);
    });

    deps.incSubscriber();

    const keepalive = setInterval(() => {
      try {
        res.write(`: keepalive ${Date.now()}\n\n`);
      } catch {
        /* closed */
      }
    }, 15000);

    const cleanup = (): void => {
      clearInterval(keepalive);
      unsub();
      deps.decSubscriber();
    };

    req.on('close', cleanup);
    req.on('error', cleanup);
  });

  return router;
}

// ── Utility helpers ──────────────────────────────────────────────────

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.max(min, Math.min(max, v));
}
