import { Router } from 'express';
import { pool } from '../db.js';
import { BadRequestError } from '../errors.js';

export const dualityRouter = Router();

// ── Session Watches ──────────────────────────────────────────────────

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
 *  Deliberately returns the most recent watch of ANY status: a session
 *  closed by the subscriber (e.g. lease-gate failure) must stay resumable so
 *  its error history remains visible — otherwise the user's message appears
 *  to "disappear" into an orphaned thread the UI can never reach.
 */
dualityRouter.get('/watches/active', async (req, res, next) => {
  try {
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
       WHERE role = $1 AND forum_slug = $2${backendClause}
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
