import { Router } from 'express';
import { pool } from '../db.js';
import { NotFoundError } from '../errors.js';

export const candidatesRouter = Router();

candidatesRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          hc.id, hc.harvest_id, hc.title, hc.intent_description,
          hc.implementation_notes, hc.code_snippets, hc.open_questions,
          hc.tags, hc.status, hc.system_id, hc.subsystem_id, hc.feature_id,
          hc.work_request_id, hc.completed, hc.compilation_readiness,
          hc.created_at, hc.updated_at,
          h.source_filename
        FROM nebula.harvest_candidates hc
        LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
        ORDER BY hc.created_at DESC
        LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.harvest_candidates'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      harvestId: row.harvest_id,
      title: row.title,
      intentDescription: row.intent_description || null,
      implementationNotes: row.implementation_notes || {},
      codeSnippets: row.code_snippets || {},
      openQuestions: row.open_questions || {},
      tags: row.tags || [],
      status: row.status || null,
      systemId: row.system_id || null,
      subsystemId: row.subsystem_id || null,
      featureId: row.feature_id || null,
      workRequestId: row.work_request_id || null,
      completed: row.completed || false,
      compilationReadiness: row.compilation_readiness != null ? parseFloat(row.compilation_readiness) : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      harvestSourceFilename: row.source_filename || null,
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

candidatesRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        hc.id, hc.harvest_id, hc.title, hc.intent_description,
        hc.implementation_notes, hc.code_snippets, hc.open_questions,
        hc.tags, hc.status, hc.system_id, hc.subsystem_id, hc.feature_id,
        hc.work_request_id, hc.completed, hc.compilation_readiness,
        hc.created_at, hc.updated_at,
        h.source_filename
      FROM nebula.harvest_candidates hc
      LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
      WHERE hc.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Not found');
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      harvestId: row.harvest_id,
      title: row.title,
      intentDescription: row.intent_description || null,
      implementationNotes: row.implementation_notes || {},
      codeSnippets: row.code_snippets || {},
      openQuestions: row.open_questions || {},
      tags: row.tags || [],
      status: row.status || null,
      systemId: row.system_id || null,
      subsystemId: row.subsystem_id || null,
      featureId: row.feature_id || null,
      workRequestId: row.work_request_id || null,
      completed: row.completed || false,
      compilationReadiness: row.compilation_readiness != null ? parseFloat(row.compilation_readiness) : null,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      harvestSourceFilename: row.source_filename || null,
    });
  } catch (err) {
    next(err);
  }
});
