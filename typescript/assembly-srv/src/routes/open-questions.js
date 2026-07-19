import { Router } from 'express';
import { pool } from '../db.js';

export const openQuestionsRouter = Router();

const ENTITY_COLUMN_MAP = {
  requirement: 'requirement_id',
  candidate: 'candidate_id',
};

openQuestionsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    let entityType = typeof req.query.entityType === 'string' ? req.query.entityType : null;
    let entityId = typeof req.query.entityId === 'string' ? req.query.entityId : null;
    const requirementId = typeof req.query.requirementId === 'string' ? req.query.requirementId : null;

    if (requirementId && (!entityType || !entityId)) {
      entityType = 'requirement';
      entityId = requirementId;
    }

    const column = entityType ? ENTITY_COLUMN_MAP[entityType] : null;

    if (entityType && !column) {
      return res.json({ items: [], total: 0, page, pageSize });
    }

    const whereClause = column && entityId ? `WHERE ${column} = $3` : '';
    const dataParams = column && entityId ? [pageSize, offset, entityId] : [pageSize, offset];
    const countParams = column && entityId ? [entityId] : [];

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          id, requirement_id, candidate_id, title, description,
          category, status, blocking, resolution, resolved_by, created_by,
          created_at
        FROM nebula.open_questions
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $1 OFFSET $2`,
        dataParams
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM nebula.open_questions ${whereClause}`,
        countParams
      ),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      requirementId: row.requirement_id || null,
      candidateId: row.candidate_id || null,
      title: row.title,
      description: row.description || null,
      category: row.category,
      status: row.status,
      blocking: row.blocking || false,
      resolution: row.resolution || null,
      createdBy: row.created_by || null,
      createdAt: new Date(row.created_at).toISOString(),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
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

openQuestionsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        id, requirement_id, candidate_id, title, description,
        category, status, blocking, resolution, resolved_by, created_by,
        created_at, resolved_at
      FROM nebula.open_questions
      WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      requirementId: row.requirement_id || null,
      candidateId: row.candidate_id || null,
      title: row.title,
      description: row.description || null,
      category: row.category,
      status: row.status,
      blocking: row.blocking || false,
      resolution: row.resolution || null,
      createdBy: row.created_by || null,
      createdAt: new Date(row.created_at).toISOString(),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    });
  } catch (err) {
    next(err);
  }
});

openQuestionsRouter.post('/', async (req, res, next) => {
  try {
    const { title, description, category, requirementId, candidateId, blocking } = req.body;
    const VALID_CATEGORIES = ['AMBIGUITY', 'MISSING_INFO', 'CONFLICT', 'SCOPE', 'DEPENDENCY', 'DUPLICATE_CANDIDATE', 'WORK_COMPLETED'];
    if (!title || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Title and valid category required' });
    }

    const result = await pool.query(
      `INSERT INTO nebula.open_questions
       (id, requirement_id, candidate_id, title, description, category, status, blocking, created_by, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'OPEN', $6, $7, NOW())
       RETURNING id`,
      [requirementId || null, candidateId || null, title, description || null, category, blocking || false, req.body.createdBy || null]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});

openQuestionsRouter.get('/:id/timeline', async (req, res, next) => {
  try {
    const questionResult = await pool.query(
      `SELECT id, title, status, blocking, resolution, resolved_by, created_by, created_at, resolved_at
       FROM nebula.open_questions
       WHERE id = $1`,
      [req.params.id]
    );

    if (questionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const q = questionResult.rows[0];
    const events = [];

    events.push({
      type: 'created',
      label: 'Question created',
      description: q.title,
      timestamp: new Date(q.created_at).toISOString(),
      actor: q.created_by,
      icon: 'Circle',
    });

    events.push({
      type: 'status_change',
      label: `Status: ${q.status}`,
      description: q.blocking ? 'Blocking' : 'Non-blocking',
      timestamp: new Date(q.created_at).toISOString(),
      actor: null,
      icon: 'RefreshCw',
    });

    if (q.resolved_at) {
      events.push({
        type: 'resolved',
        label: 'Question resolved',
        description: q.resolution,
        timestamp: new Date(q.resolved_at).toISOString(),
        actor: q.resolved_by,
        icon: 'CheckCircle2',
      });
    }

    const recordsResult = await pool.query(
      `SELECT record_type, role, title, created_at
       FROM nebula.agent_records
       WHERE content ILIKE $1 OR title ILIKE $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [`%${req.params.id}%`]
    );

    for (const row of recordsResult.rows) {
      events.push({
        type: 'note',
        label: `${row.record_type} by ${row.role}`,
        description: row.title,
        timestamp: new Date(row.created_at).toISOString(),
        actor: row.role,
        icon: 'FileText',
      });
    }

    events.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    res.json(events);
  } catch (err) {
    next(err);
  }
});
