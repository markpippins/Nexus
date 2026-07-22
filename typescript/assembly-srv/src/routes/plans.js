import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const plansRouter = Router();

plansRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, file_name, title, project, goal, content,
                files_affected, acceptance_criteria, dependencies,
                prompt_ref, created_at, updated_at,
                COALESCE(derived_status, 'PLAN_CREATE') AS status
         FROM conduit.plan_status
         WHERE id IS NOT NULL AND id != ''
         ORDER BY updated_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM conduit.plan_status WHERE id IS NOT NULL AND id != \'\''),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      title: row.title,
      project: row.project,
      goal: row.goal,
      content: row.content,
      filesAffected: row.files_affected,
      acceptanceCriteria: row.acceptance_criteria,
      dependencies: row.dependencies,
      promptRef: row.prompt_ref,
      status: row.status,
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

plansRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, file_name, title, project, goal, content,
              files_affected, acceptance_criteria, dependencies,
              prompt_ref, created_at, updated_at,
              COALESCE(derived_status, 'PLAN_CREATE') AS status
       FROM conduit.plan_status
       WHERE id = $1 AND id IS NOT NULL AND id != ''`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      fileName: row.file_name,
      title: row.title,
      project: row.project,
      goal: row.goal,
      content: row.content,
      filesAffected: row.files_affected,
      acceptanceCriteria: row.acceptance_criteria,
      dependencies: row.dependencies,
      promptRef: row.prompt_ref,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
