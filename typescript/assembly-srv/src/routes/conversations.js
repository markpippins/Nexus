import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const conversationsRouter = Router();

// GET / — paginated list of conversation snapshots
// Queries nebula.conversation_snapshots directly (nebula-srv has no REST surface for this table).
conversationsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '20'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, conversation_id, snapshot_index, source_hash, capture_mode,
                block_count, created_by, created_at
         FROM nebula.conversation_snapshots
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.conversation_snapshots'),
    ]);

    res.json({
      items: dataResult.rows,
      total: parseInt(countResult.rows[0].total, 10),
      page,
      pageSize,
    });
  } catch (err) {
    next(err);
  }
});

// GET /:id — single conversation snapshot
conversationsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, conversation_id, snapshot_index, source_hash, capture_mode,
              block_count, created_by, created_at
       FROM nebula.conversation_snapshots
       WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Not found');
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /:id/blocks — conversation blocks for latest snapshot
conversationsRouter.get('/:id/blocks', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, conversation_id, snapshot_id, block_index, parent_turn_id,
              parent_block_id, block_type, content_md, content_hash,
              dom_path, dom_fingerprint, first_line_no, last_line_no,
              created_at, role
       FROM nebula.conversation_blocks
       WHERE snapshot_id = $1
       ORDER BY block_index ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});
