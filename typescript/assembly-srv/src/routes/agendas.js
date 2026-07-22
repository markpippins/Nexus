import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const agendasRouter = Router();

agendasRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, title, scope, status, cohesion_score, source_count,
                planner_analysis, planner_conflicts, planner_gaps,
                created_at, updated_at
         FROM nebula.agendas
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.agendas'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      title: row.title,
      scope: row.scope || null,
      status: row.status,
      cohesionScore: row.cohesion_score != null ? parseFloat(row.cohesion_score) : null,
      sourceCount: row.source_count != null ? parseInt(row.source_count, 10) : null,
      plannerAnalysis: row.planner_analysis || null,
      plannerConflicts: row.planner_conflicts || null,
      plannerGaps: row.planner_gaps || null,
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

agendasRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, title, scope, status, cohesion_score, source_count,
              planner_analysis, planner_conflicts, planner_gaps,
              created_at, updated_at
       FROM nebula.agendas WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      title: row.title,
      scope: row.scope || null,
      status: row.status,
      cohesionScore: row.cohesion_score != null ? parseFloat(row.cohesion_score) : null,
      sourceCount: row.source_count != null ? parseInt(row.source_count, 10) : null,
      plannerAnalysis: row.planner_analysis || null,
      plannerConflicts: row.planner_conflicts || null,
      plannerGaps: row.planner_gaps || null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

agendasRouter.get('/:id/items', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        id, agenda_id, source_type, source_id, title, body,
        decisions, open_questions, supporting_refs, included,
        planner_note, created_at, updated_at
      FROM nebula.agenda_items
      WHERE agenda_id = $1
      ORDER BY created_at DESC`,
      [req.params.id]
    );

    const items = result.rows.map(row => ({
      id: row.id,
      agendaId: row.agenda_id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      title: row.title,
      body: row.body || null,
      decisions: row.decisions || null,
      openQuestions: row.open_questions || null,
      supportingRefs: row.supporting_refs || null,
      included: row.included != null ? row.included : null,
      plannerNote: row.planner_note || null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    }));

    res.json(items);
  } catch (err) {
    next(err);
  }
});
