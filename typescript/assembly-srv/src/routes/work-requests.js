import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const workRequestsRouter = Router();

workRequestsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, title, description, source_specification_id, source_requirement_id,
                business_status, intent, context, constraints, created_by, created_at, updated_at
         FROM nebula.work_requests
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.work_requests'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      description: row.description || null,
      sourceSpecificationId: row.source_specification_id || null,
      sourceRequirementId: row.source_requirement_id || null,
      status: row.business_status,
      intent: row.intent || null,
      context: row.context || null,
      constraints: row.constraints || null,
      createdBy: row.created_by || null,
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

workRequestsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, description, source_specification_id, source_requirement_id,
              business_status, intent, context, constraints, created_by, created_at, updated_at
       FROM nebula.work_requests WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      title: row.title,
      description: row.description || null,
      sourceSpecificationId: row.source_specification_id || null,
      sourceRequirementId: row.source_requirement_id || null,
      status: row.business_status,
      intent: row.intent || null,
      context: row.context || null,
      constraints: row.constraints || null,
      createdBy: row.created_by || null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
