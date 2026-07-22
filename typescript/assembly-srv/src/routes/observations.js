import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const observationsRouter = Router();

observationsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, trigger_type, source_artifact_type, source_artifact_id,
                payload, assessed, created_at
         FROM nebula.observations
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.observations'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      triggerType: row.trigger_type,
      sourceArtifactType: row.source_artifact_type || null,
      sourceArtifactId: row.source_artifact_id || null,
      payload: row.payload || null,
      assessed: row.assessed,
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

observationsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, trigger_type, source_artifact_type, source_artifact_id,
              payload, assessed, created_at
       FROM nebula.observations
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      triggerType: row.trigger_type,
      sourceArtifactType: row.source_artifact_type || null,
      sourceArtifactId: row.source_artifact_id || null,
      payload: row.payload || null,
      assessed: row.assessed,
      createdAt: new Date(row.created_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
