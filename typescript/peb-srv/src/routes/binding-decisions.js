import { Router } from 'express';
import { pool } from '../db.js';

export const bindingDecisionsRouter = Router();

// GET /api/peb/binding-decisions?subject_id=&disposition=&decision_class=&limit=&offset=
bindingDecisionsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit ?? '100', 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10) || 0);
    const args = [limit, offset];
    const where = [];
    let n = 3;
    for (const field of ['subject_id', 'disposition', 'decision_class']) {
      const value = req.query[field];
      if (value != null && value !== '') {
        where.push(`b.${field} = $${n++}`);
        args.push(String(value));
      }
    }
    const result = await pool.query(
      `SELECT id, decision_id, decision_class, binding_contract_version,
              subject_id, work_item_id, disposition, authority_level,
              evaluation_fingerprint, lineage_fingerprint, replay_context,
              as_of, payload, created_at
         FROM peb.binding_decision_evidence b
        ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
        ORDER BY b.created_at DESC
        LIMIT $1 OFFSET $2`,
      args,
    );
    res.json({ decisions: result.rows, limit, offset });
  } catch (err) {
    next(err);
  }
});
