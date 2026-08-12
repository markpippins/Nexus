import { Router } from 'express';
import { pool } from '../db.js';
import { BadRequestError } from '../errors.js';

export const dualityRouter = Router();

// ── Session Watches ──────────────────────────────────────────────────

/** POST /api/duality/watches — create a session watch for a thread. */
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

/** GET /api/duality/watches/active?role=X&forumSlug=Y
 *  — find the most recent active session thread for a role.
 *  Replaces localStorage for session persistence across browser clears. */
dualityRouter.get('/watches/active', async (req, res, next) => {
  try {
    const { role, forumSlug } = req.query;
    if (!role || !forumSlug) {
      throw new BadRequestError('role and forumSlug query params are required');
    }
    const result = await pool.query(
      `SELECT thread_id, role, execution_backend, status, last_activity
       FROM duality.session_watches
       WHERE role = $1 AND forum_slug = $2 AND status = 'active'
       ORDER BY last_activity DESC
       LIMIT 1`,
      [role, forumSlug]
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
    res.json({ threadId: result.rows[0].thread_id, role: result.rows[0].role });
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
