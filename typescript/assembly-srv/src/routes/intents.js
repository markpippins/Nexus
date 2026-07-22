import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const intentsRouter = Router();

intentsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          id, candidate_id, parent_id, title, description,
          source_type, source_ref, tags, status, metadata,
          created_at, updated_at
        FROM nebula.intent_records
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.intent_records'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      candidateId: row.candidate_id || null,
      parentId: row.parent_id || null,
      title: row.title || null,
      description: row.description || null,
      sourceType: row.source_type || null,
      sourceRef: row.source_ref || null,
      tags: row.tags || null,
      status: row.status || null,
      metadata: row.metadata || null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
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

intentsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        id, candidate_id, parent_id, title, description,
        source_type, source_ref, tags, status, metadata,
        created_at, updated_at
      FROM nebula.intent_records
      WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      candidateId: row.candidate_id || null,
      parentId: row.parent_id || null,
      title: row.title || null,
      description: row.description || null,
      sourceType: row.source_type || null,
      sourceRef: row.source_ref || null,
      tags: row.tags || null,
      status: row.status || null,
      metadata: row.metadata || null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
