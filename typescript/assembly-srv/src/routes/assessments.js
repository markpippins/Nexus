import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const assessmentsRouter = Router();

assessmentsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          a.id, a.observation_id, a.outcome, a.confidence, a.impact_scope,
          a.open_questions, a.agenda_id, a.auto_resolve_plan_id,
          a.forum_post_id, a.analysis_detail, a.created_at
        FROM nebula.assessments a
        ORDER BY a.created_at DESC
        LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.assessments'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      observationId: row.observation_id,
      outcome: row.outcome,
      confidence: row.confidence != null ? parseFloat(row.confidence) : null,
      impactScope: row.impact_scope || null,
      openQuestions: row.open_questions || null,
      agendaId: row.agenda_id || null,
      autoResolvePlanId: row.auto_resolve_plan_id || null,
      forumPostId: row.forum_post_id || null,
      analysisDetail: row.analysis_detail || null,
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

assessmentsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        id, observation_id, outcome, confidence, impact_scope,
        open_questions, agenda_id, auto_resolve_plan_id,
        forum_post_id, analysis_detail, created_at
      FROM nebula.assessments
      WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      observationId: row.observation_id,
      outcome: row.outcome,
      confidence: row.confidence != null ? parseFloat(row.confidence) : null,
      impactScope: row.impact_scope || null,
      openQuestions: row.open_questions || null,
      agendaId: row.agenda_id || null,
      autoResolvePlanId: row.auto_resolve_plan_id || null,
      forumPostId: row.forum_post_id || null,
      analysisDetail: row.analysis_detail || null,
      createdAt: new Date(row.created_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
