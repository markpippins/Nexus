import { Router } from 'express';
import { pool } from '../db.js';
import { isAcceptableId } from '../lib/pagination.js';
import { badRequest, notFound } from '../errors.js';

export const decisionsRouter = Router();

// GET /api/peb/decisions/{id}/chain?direction=ancestry|rollback
//
//  - ancestry (default): recursive walk up parent_decision_id
//  - rollback:  recursive walk up rollback_of
//
// Returns a flat ordered list (deepest last). Use direction=rollback when the
// consumer wants the rollback-of chain (a decision that was a corrective
// rollback of an earlier decision) rather than the parent-decision chain.
decisionsRouter.get('/:id/chain', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!isAcceptableId(id)) return next(badRequest('invalid id'));
    const direction = String(req.query.direction ?? 'ancestry').toLowerCase();

    const linkCol = direction === 'rollback' ? 'rollback_of' : 'parent_decision_id';

    // Confirm the decision exists.
    const head = await pool.query(
      `SELECT id FROM peb.decisions WHERE id = $1::uuid`, [id]
    );
    if (head.rowCount === 0) return next(notFound('decision not found'));

    const chain = await pool.query(
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
      [id]
    );

    res.json({ direction, chain: chain.rows });
  } catch (err) {
    next(err);
  }
});
