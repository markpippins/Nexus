import { Router } from 'express';
import { pool } from '../db.js';
import { BadRequestError, NotFoundError } from '../errors.js';

export const openQuestionsRouter = Router();

function isUuid(value) {
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value);
}

function getLinkedEntitySql(extraWhereClause = '') {
  return `
    LEFT JOIN LATERAL (
      SELECT
        linked_qe.entity_type,
        linked_qe.entity_id,
        CASE
          WHEN linked_qe.entity_type = 'requirement' THEN (SELECT title FROM nebula.requirements WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'candidate' THEN (SELECT title FROM nebula.harvest_candidates WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'harvest' THEN (SELECT source_filename FROM nebula.harvests WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'conversation' THEN (SELECT h.source_filename FROM nebula.conversation_snapshots cs JOIN nebula.harvests h ON h.id = cs.conversation_id WHERE cs.id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'intent_record' THEN (SELECT title FROM nebula.intent_records WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'assessment' THEN (SELECT outcome FROM nebula.assessments WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'observation' THEN (SELECT trigger_type FROM nebula.observations WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type IN ('report', 'agent_record', 'agent') THEN (SELECT title FROM nebula.agent_records WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'specification' THEN ('Revision #' || (SELECT revision_number::text FROM nebula.specifications WHERE id = linked_qe.entity_id))
          WHEN linked_qe.entity_type = 'agenda' THEN (SELECT title FROM nebula.agendas WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'work_request' THEN (SELECT title FROM nebula.work_requests WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'plan' THEN (SELECT title FROM conduit.plans WHERE id = linked_qe.entity_id::text)
          WHEN linked_qe.entity_type = 'forum' THEN (SELECT name FROM assembly.forums WHERE id = linked_qe.entity_id)
          WHEN linked_qe.entity_type = 'open_question' THEN (SELECT title FROM nebula.open_questions WHERE id = linked_qe.entity_id)
          ELSE NULL
        END AS entity_title
      FROM nebula.open_question_entities linked_qe
      WHERE linked_qe.open_question_id = o.id
      ${extraWhereClause}
      ORDER BY linked_qe.entity_type
      LIMIT 1
    ) link ON true
  `;
}

openQuestionsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    let entityType = typeof req.query.entityType === 'string' ? req.query.entityType : null;
    let entityId = typeof req.query.entityId === 'string' ? req.query.entityId : null;
    const requirementId = typeof req.query.requirementId === 'string' ? req.query.requirementId : null;
    const resolvedOnly = req.query.resolved === 'true';

    if (requirementId && (!entityType || !entityId)) {
      entityType = 'requirement';
      entityId = requirementId;
    }

    if ((entityType && !entityId) || (!entityType && entityId)) {
      throw new BadRequestError('Both entityType and entityId are required');
    }

    // The open_question_entities junction table stores entity_id as uuid.
    // Plans (conduit.plans.id) are text, so they cannot be linked through the
    // junction table without a schema change. Return empty results for plan
    // entities to avoid a UUID cast error.
    if (entityType === 'plan') {
      return res.json({ items: [], total: 0, page, pageSize });
    }

    const hasFilter = Boolean(entityType && entityId);

    // Build extra conditions for the resolved filter (no params needed — literal SQL)
    const resolvedCondition = resolvedOnly ? 'o.resolution IS NOT NULL' : null;

    const joinClause = hasFilter
      ? 'JOIN nebula.open_question_entities qe ON qe.open_question_id = o.id'
      : '';

    // Data query: $1 = pageSize, $2 = offset, then entity params start at $3
    let dataWhereClause = '';
    const dataWhereParts = [];
    if (hasFilter) {
      dataWhereParts.push('qe.entity_type = $3 AND qe.entity_id = $4::uuid');
    }
    if (resolvedCondition) {
      dataWhereParts.push(resolvedCondition);
    }
    if (dataWhereParts.length > 0) {
      dataWhereClause = 'WHERE ' + dataWhereParts.join(' AND ');
    }
    const dataParams = hasFilter
      ? [pageSize, offset, entityType, entityId]
      : [pageSize, offset];

    // Count query: entity params start at $1 (no page/offset params)
    let countWhereClause = '';
    const countWhereParts = [];
    if (hasFilter) {
      countWhereParts.push('qe.entity_type = $1 AND qe.entity_id = $2::uuid');
    }
    if (resolvedCondition) {
      countWhereParts.push(resolvedCondition);
    }
    if (countWhereParts.length > 0) {
      countWhereClause = 'WHERE ' + countWhereParts.join(' AND ');
    }
    const countParams = hasFilter ? [entityType, entityId] : [];

    // Lateral filter uses the same param indices as data query
    const lateralFilter = hasFilter
      ? 'AND linked_qe.entity_type = $3 AND linked_qe.entity_id = $4::uuid'
      : '';

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          o.id, o.requirement_id, o.candidate_id, o.title, o.description,
          o.category, o.status, o.blocking, o.resolution, o.resolved_by, o.created_by,
          o.created_at,
          link.entity_type,
          link.entity_id,
          link.entity_title
        FROM nebula.open_questions o
        ${getLinkedEntitySql(lateralFilter)}
        ${joinClause}
        ${dataWhereClause}
        ORDER BY o.created_at DESC
        LIMIT $1::int OFFSET $2::int`,
        dataParams
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM nebula.open_questions o
         ${joinClause}
         ${countWhereClause}`,
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
      entityType: row.entity_type || null,
      entityId: row.entity_id || null,
      entityTitle: row.entity_title || null,
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
        o.id, o.requirement_id, o.candidate_id, o.title, o.description,
        o.category, o.status, o.blocking, o.resolution, o.resolved_by, o.created_by,
        o.created_at, o.resolved_at,
        link.entity_type,
        link.entity_id,
        link.entity_title
      FROM nebula.open_questions o
      ${getLinkedEntitySql()}
      WHERE o.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
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
      entityType: row.entity_type || null,
      entityId: row.entity_id || null,
      entityTitle: row.entity_title || null,
    });
  } catch (err) {
    next(err);
  }
});

openQuestionsRouter.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const {
      title,
      description,
      category,
      requirementId,
      candidateId,
      blocking,
      entityType,
      entityId,
    } = req.body;

    if ((entityType && !entityId) || (!entityType && entityId)) {
      throw new BadRequestError('Both entityType and entityId are required');
    }

    const VALID_CATEGORIES = ['AMBIGUITY', 'MISSING_INFO', 'CONFLICT', 'SCOPE', 'DEPENDENCY', 'DUPLICATE_CANDIDATE', 'WORK_COMPLETED'];
    if (!title || !VALID_CATEGORIES.includes(category)) {
      throw new BadRequestError('Title and valid category required');
    }

    // Normalize legacy IDs and new entityType/entityId into a single link.
    let linkEntityType = entityType || null;
    let linkEntityId = entityId || null;
    if (!linkEntityType && requirementId) {
      linkEntityType = 'requirement';
      linkEntityId = requirementId;
    }
    if (!linkEntityType && candidateId) {
      linkEntityType = 'candidate';
      linkEntityId = candidateId;
    }

    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO nebula.open_questions
       (id, requirement_id, candidate_id, title, description, category, status, blocking, created_by, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'OPEN', $6, $7, NOW())
       RETURNING id`,
      [
        linkEntityType === 'requirement' ? linkEntityId : (requirementId || null),
        linkEntityType === 'candidate' ? linkEntityId : (candidateId || null),
        title,
        description || null,
        category,
        blocking || false,
        req.body.createdBy || null,
      ]
    );

    if (linkEntityType && linkEntityId && isUuid(linkEntityId)) {
      await client.query(
        `INSERT INTO nebula.open_question_entities (open_question_id, entity_type, entity_id)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [result.rows[0].id, linkEntityType, linkEntityId]
      );
    }

    await client.query('COMMIT');

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
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
      throw new NotFoundError('Not found');
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
