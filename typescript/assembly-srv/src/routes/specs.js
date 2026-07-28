import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const specsRouter = Router();

specsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          id, agenda_id, source_type, source_id, title, body,
          decisions, open_questions, supporting_refs, included,
          planner_note, item_created_at, item_updated_at,
          agenda_title, agenda_status
        FROM nebula.specs
        ORDER BY item_created_at DESC
        LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.specs'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      agendaId: row.agenda_id,
      sourceType: row.source_type || null,
      sourceId: row.source_id || null,
      title: row.title,
      body: row.body || null,
      decisions: row.decisions || null,
      openQuestions: row.open_questions || null,
      supportingRefs: row.supporting_refs || null,
      included: row.included != null ? row.included : null,
      plannerNote: row.planner_note || null,
      agendaTitle: row.agenda_title || null,
      agendaStatus: row.agenda_status || null,
      createdAt: new Date(row.item_created_at).toISOString(),
      updatedAt: new Date(row.item_updated_at).toISOString(),
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

specsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        id, agenda_id, source_type, source_id, title, body,
        decisions, open_questions, supporting_refs, included,
        planner_note, item_created_at, item_updated_at,
        agenda_title, agenda_status
      FROM nebula.specs
      WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError(`Spec item not found: ${req.params.id}`);
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      agendaId: row.agenda_id,
      sourceType: row.source_type || null,
      sourceId: row.source_id || null,
      title: row.title,
      body: row.body || null,
      decisions: row.decisions || null,
      openQuestions: row.open_questions || null,
      supportingRefs: row.supporting_refs || null,
      included: row.included != null ? row.included : null,
      plannerNote: row.planner_note || null,
      agendaTitle: row.agenda_title || null,
      agendaStatus: row.agenda_status || null,
      createdAt: new Date(row.item_created_at).toISOString(),
      updatedAt: new Date(row.item_updated_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
