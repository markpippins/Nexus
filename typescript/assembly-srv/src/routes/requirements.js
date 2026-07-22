import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const requirementsRouter = Router();

requirementsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, system_id, subsystem_id, feature_id, title, description,
                status, priority, req_type, acceptance_criteria,
                parent_id, candidate_id, conduit_plan_id,
                start_date, completion_date, created_at
         FROM nebula.requirements
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.requirements'),
    ]);

    const ids = dataResult.rows.map(row => row.id);
    const countsResult = await pool.query(
      `SELECT
         requirement_id,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
         COUNT(*) FILTER (WHERE blocking = true AND status NOT IN ('RESOLVED', 'WONT_FIX'))::int AS blocking_count
       FROM nebula.open_questions
       WHERE requirement_id = ANY($1::uuid[])
       GROUP BY requirement_id`,
      [ids]
    );
    const countsById = new Map(countsResult.rows.map(row => [row.requirement_id, {
      total: row.total,
      openCount: row.open_count,
      blockingCount: row.blocking_count,
    }]));

    const items = dataResult.rows.map(row => ({
      id: row.id,
      systemId: row.system_id || null,
      subsystemId: row.subsystem_id || null,
      featureId: row.feature_id || null,
      title: row.title || null,
      description: row.description || null,
      status: row.status || null,
      priority: row.priority || null,
      reqType: row.req_type || null,
      acceptanceCriteria: row.acceptance_criteria || null,
      parentId: row.parent_id || null,
      candidateId: row.candidate_id || null,
      conduitPlanId: row.conduit_plan_id || null,
      startDate: row.start_date || null,
      completionDate: row.completion_date || null,
      createdAt: new Date(row.created_at).toISOString(),
      questionCounts: countsById.get(row.id) || { total: 0, openCount: 0, blockingCount: 0 },
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

requirementsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, system_id, subsystem_id, feature_id, title, description,
              status, priority, req_type, acceptance_criteria,
              parent_id, candidate_id, conduit_plan_id,
              start_date, completion_date, created_at
       FROM nebula.requirements WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    const countsResult = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'OPEN')::int AS open_count,
         COUNT(*) FILTER (WHERE blocking = true AND status NOT IN ('RESOLVED', 'WONT_FIX'))::int AS blocking_count
       FROM nebula.open_questions
       WHERE requirement_id = $1`,
      [req.params.id]
    );
    const countsRow = countsResult.rows[0];
    res.json({
      id: row.id,
      systemId: row.system_id || null,
      subsystemId: row.subsystem_id || null,
      featureId: row.feature_id || null,
      title: row.title || null,
      description: row.description || null,
      status: row.status || null,
      priority: row.priority || null,
      reqType: row.req_type || null,
      acceptanceCriteria: row.acceptance_criteria || null,
      parentId: row.parent_id || null,
      candidateId: row.candidate_id || null,
      conduitPlanId: row.conduit_plan_id || null,
      startDate: row.start_date || null,
      completionDate: row.completion_date || null,
      createdAt: new Date(row.created_at).toISOString(),
      questionCounts: {
        total: countsRow.total,
        openCount: countsRow.open_count,
        blockingCount: countsRow.blocking_count,
      },
    });
  } catch (err) {
    next(err);
  }
});
