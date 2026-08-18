import { Router } from 'express';
import { pool } from '../db.js';
import { BadRequestError } from '../errors.js';

export const dualityRouter = Router();

// ── Session Watches ──────────────────────────────────────────────────

/**
 * Lazy stale-watch expiry (TTL). Watches that have been idle longer than
 * GREATEST(idle_timeout_ms, 1h) are marked 'expired' and drop out of session
 * resume lookups. Runs opportunistically on the watch reads so no background
 * sweeper is needed; 'expired' is excluded from resume but the row is kept
 * for audit. The 1h floor prevents aggressive 5-minute timeouts from
 * orphaning a human chat session between turns.
 */
async function expireStaleWatches() {
  try {
    await pool.query(
      `UPDATE duality.session_watches
       SET status = 'expired', updated_at = now()
       WHERE status IN ('active', 'paused')
         AND last_activity < now() - (GREATEST(idle_timeout_ms, 3600000) || ' milliseconds')::interval`
    );
  } catch (err) {
    console.error('[duality] stale-watch expiry failed:', err.message);
  }
}

/** POST /api/duality/watches — create (or reactivate) a session watch for a thread.
 *
 *  UPSERT on the (thread_id, role) unique constraint: a watch that was
 *  closed by the subscriber (e.g. lease-gate failure) is reactivated rather
 *  than inserted again, so a session the UI resumes keeps exactly one watch
 *  row and stays processable by the subscriber.
 */
dualityRouter.post('/watches', async (req, res, next) => {
  try {
    const { threadId, forumSlug, role, executionBackend, maxTurns, idleTimeoutMs, leaseId } = req.body;
    if (!threadId || !forumSlug || !role) {
      throw new BadRequestError('threadId, forumSlug, and role are required');
    }
    if (leaseId !== undefined && leaseId !== null
        && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(leaseId))) {
      throw new BadRequestError('leaseId must be a UUID');
    }
    const result = await pool.query(
      `INSERT INTO duality.session_watches
         (thread_id, forum_slug, role, execution_backend, max_turns, idle_timeout_ms,
          lease_id, turn_count, status, last_activity, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'active', now(), now(), now())
       ON CONFLICT (thread_id, role) DO UPDATE SET
         status = 'active',
         execution_backend = EXCLUDED.execution_backend,
         max_turns = EXCLUDED.max_turns,
         idle_timeout_ms = EXCLUDED.idle_timeout_ms,
         lease_id = COALESCE(EXCLUDED.lease_id, duality.session_watches.lease_id),
         turn_count = 0,
         last_activity = now(),
         updated_at = now()
       RETURNING id`,
      [
        threadId,
        forumSlug,
        role,
        executionBackend || 'freebuff',
        maxTurns ?? 20,
        idleTimeoutMs ?? 300_000,
        leaseId ?? null,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

/** GET /api/duality/watches/active?role=X&forumSlug=Y[&execution_backend=Z]
 *  — find the most recent session thread for a role (+ backend when given).
 *
 *  Replaces localStorage for session persistence across browser clears.
 *  The optional execution_backend filter keeps freebuff and harness sessions
 *  from being confused with each other (previously the backend-blind lookup
 *  returned the wrong session type, and the UI silently created a new thread
 *  instead of resuming the existing one).
 *
 *  Deliberately returns the most recent watch of ANY status except
 *  'expired': a session closed by the subscriber (e.g. lease-gate failure)
 *  must stay resumable so its error history remains visible — otherwise the
 *  user's message appears to "disappear" into an orphaned thread the UI can
 *  never reach. Only stale watches (idle past the TTL) are expired and drop
 *  out of resume.
 */
dualityRouter.get('/watches/active', async (req, res, next) => {
  try {
    await expireStaleWatches();
    const { role, forumSlug, execution_backend } = req.query;
    if (!role || !forumSlug) {
      throw new BadRequestError('role and forumSlug query params are required');
    }
    const params = [role, forumSlug];
    let backendClause = '';
    if (execution_backend) {
      params.push(String(execution_backend));
      backendClause = ` AND execution_backend = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT thread_id, role, execution_backend, status, last_activity
       FROM duality.session_watches
       WHERE role = $1 AND forum_slug = $2 AND status <> 'expired'${backendClause}
       ORDER BY last_activity DESC
       LIMIT 1`,
      params
    );
    if (result.rows.length === 0) {
      return res.json({ threadId: null });
    }
    // Verify the thread still exists
    const threadCheck = await pool.query(
      'SELECT id FROM assembly.posts WHERE id = $1',
      [result.rows[0].thread_id]
    );
    if (threadCheck.rows.length === 0) {
      return res.json({ threadId: null });
    }
    const row = result.rows[0];
    res.json({
      threadId: row.thread_id,
      role: row.role,
      status: row.status,
      execution_backend: row.execution_backend,
    });
  } catch (err) { next(err); }
});

/** GET /api/duality/watches/:threadId — get watches for a thread. */
dualityRouter.get('/watches/:threadId', async (req, res, next) => {
  try {
    await expireStaleWatches();
    const result = await pool.query(
      `SELECT id, thread_id, forum_slug, role, execution_backend, max_turns,
              turn_count, idle_timeout_ms, status, last_activity, created_at
       FROM duality.session_watches
       WHERE thread_id = $1 AND status = 'active'
       ORDER BY created_at DESC`,
      [req.params.threadId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── Turn/job state envelope (P0-1 item 3) ──────────────────────────────
// Server-side turn state so the UI renders the turn lifecycle instead of
// inferring it from comment count. Rows are written by the interactive-turn
// subscriber (duality.session_turns); this route is the read path.

/** GET /api/duality/turns?threadId=X[&limit=N][&state=...]
 *  — turn state envelopes for a thread, newest first.
 *
 *  Each envelope: { id (turn_id), thread_id, role, execution_backend, state,
 *  request_comment_id, response_comment_id, subscriber_id, job_id,
 *  execution_plan_version, failure_detail, *_at timestamps }.
 *
 *  The optional state filter (accepted|running|completed|failed|timed_out|
 *  cancelled) lets the UI ask specifically for the in-flight turn.
 */
dualityRouter.get('/turns', async (req, res, next) => {
  try {
    const { threadId, limit, state } = req.query;
    if (!threadId) {
      throw new BadRequestError('threadId query param is required');
    }
    const params = [threadId];
    let stateClause = '';
    if (state) {
      const allowed = ['accepted', 'running', 'completed', 'failed', 'timed_out', 'cancelled'];
      if (!allowed.includes(String(state))) {
        throw new BadRequestError(`state must be one of: ${allowed.join(', ')}`);
      }
      params.push(String(state));
      stateClause = ` AND state = $${params.length}`;
    }
    const lim = Math.min(Math.max(Number(limit) || 10, 1), 100);
    params.push(lim);
    const result = await pool.query(
      `SELECT id, thread_id, watch_id, role, execution_backend, state,
              request_comment_id, response_comment_id, subscriber_id, job_id,
              execution_plan_version, failure_detail,
              created_at, updated_at, accepted_at, running_at, completed_at,
              failed_at, timed_out_at, cancelled_at
       FROM duality.session_turns
       WHERE thread_id = $1${stateClause}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ turns: result.rows });
  } catch (err) { next(err); }
});

/** GET /api/duality/turns/latest?threadId=X — the most recent turn envelope
 *  for a thread (any state), so the UI has a single in-flight/terminal
 *  state to render without paging. */
dualityRouter.get('/turns/latest', async (req, res, next) => {
  try {
    const { threadId } = req.query;
    if (!threadId) {
      throw new BadRequestError('threadId query param is required');
    }
    const result = await pool.query(
      `SELECT id, thread_id, watch_id, role, execution_backend, state,
              request_comment_id, response_comment_id, subscriber_id, job_id,
              execution_plan_version, failure_detail,
              created_at, updated_at, accepted_at, running_at, completed_at,
              failed_at, timed_out_at, cancelled_at
       FROM duality.session_turns
       WHERE thread_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [threadId]
    );
    res.json({ turn: result.rows[0] ?? null });
  } catch (err) { next(err); }
});

/** GET /api/duality/turns/:turnId — a single turn envelope. */
dualityRouter.get('/turns/:turnId', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, thread_id, watch_id, role, execution_backend, state,
              request_comment_id, response_comment_id, subscriber_id, job_id,
              execution_plan_version, failure_detail,
              created_at, updated_at, accepted_at, running_at, completed_at,
              failed_at, timed_out_at, cancelled_at
       FROM duality.session_turns
       WHERE id = $1`,
      [req.params.turnId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'turn not found' });
    }
    res.json({ turn: result.rows[0] });
  } catch (err) { next(err); }
});
