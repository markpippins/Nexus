import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const specificationsRouter = Router();

specificationsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, agenda_id, revision_number, revision_type, superseded_by,
                derived_from, item_snapshot, change_summary, valid_from, valid_until, created_at
         FROM nebula.specifications
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.specifications'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      agendaId: row.agenda_id,
      revisionNumber: parseInt(row.revision_number, 10),
      revisionType: row.revision_type,
      supersededBy: row.superseded_by || null,
      derivedFrom: row.derived_from || null,
      itemSnapshot: row.item_snapshot || null,
      changeSummary: row.change_summary || null,
      validFrom: new Date(row.valid_from).toISOString(),
      validUntil: new Date(row.valid_until).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
    }));

    res.json({
      items,
      total: parseInt(countResult.rows[0].total, 10),
      page,
      pageSize,
    });
  } catch (err) {
    next(err);
  }
});

specificationsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, agenda_id, revision_number, revision_type, superseded_by,
              derived_from, item_snapshot, change_summary, valid_from, valid_until, created_at
       FROM nebula.specifications
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      agendaId: row.agenda_id,
      revisionNumber: parseInt(row.revision_number, 10),
      revisionType: row.revision_type,
      supersededBy: row.superseded_by || null,
      derivedFrom: row.derived_from || null,
      itemSnapshot: row.item_snapshot || null,
      changeSummary: row.change_summary || null,
      validFrom: new Date(row.valid_from).toISOString(),
      validUntil: new Date(row.valid_until).toISOString(),
      createdAt: new Date(row.created_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
