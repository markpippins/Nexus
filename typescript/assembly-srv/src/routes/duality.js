import { Router } from 'express';
import { pool } from '../db.js';
import { BadRequestError } from '../errors.js';

export const dualityRouter = Router();

// ── Session Watches ──────────────────────────────────────────────────

/** POST /api/duality/watches — create a session watch for a thread. */
dualityRouter.post('/watches', async (req, res, next) => {
  try {
    const { threadId, forumSlug, role, executionBackend, maxTurns, idleTimeoutMs } = req.body;
    if (!threadId || !forumSlug || !role) {
      throw new BadRequestError('threadId, forumSlug, and role are required');
    }
    const result = await pool.query(
      `INSERT INTO duality.session_watches
         (thread_id, forum_slug, role, execution_backend, max_turns, idle_timeout_ms,
          turn_count, status, last_activity, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 'active', now(), now(), now())
       RETURNING id`,
      [
        threadId,
        forumSlug,
        role,
        executionBackend || 'freebuff',
        maxTurns ?? 20,
        idleTimeoutMs ?? 300_000,
      ]
    );
    res.status(201).json(result.rows[0]);
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
