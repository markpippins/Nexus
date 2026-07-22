import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const agentRecordsRouter = Router();

agentRecordsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT id, record_type, role, title, content, source_path,
                metadata, tags, system_id, subsystem_id, feature_id,
                plan_ref, level, visibility_scope, created_at
         FROM nebula.agent_records
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.agent_records'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      recordType: row.record_type || null,
      role: row.role || null,
      title: row.title || null,
      content: row.content || null,
      sourcePath: row.source_path || null,
      metadata: row.metadata || null,
      tags: row.tags || null,
      systemId: row.system_id || null,
      subsystemId: row.subsystem_id || null,
      featureId: row.feature_id || null,
      planRef: row.plan_ref || null,
      level: row.level != null ? parseInt(row.level, 10) : null,
      visibilityScope: row.visibility_scope || null,
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

agentRecordsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, record_type, role, title, content, source_path,
              metadata, tags, system_id, subsystem_id, feature_id,
              plan_ref, level, visibility_scope, created_at
       FROM nebula.agent_records
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      recordType: row.record_type || null,
      role: row.role || null,
      title: row.title || null,
      content: row.content || null,
      sourcePath: row.source_path || null,
      metadata: row.metadata || null,
      tags: row.tags || null,
      systemId: row.system_id || null,
      subsystemId: row.subsystem_id || null,
      featureId: row.feature_id || null,
      planRef: row.plan_ref || null,
      level: row.level != null ? parseInt(row.level, 10) : null,
      visibilityScope: row.visibility_scope || null,
      createdAt: new Date(row.created_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
