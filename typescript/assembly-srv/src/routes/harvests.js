import { Router } from 'express';
import { pool } from '../db.js';

export const harvestsRouter = Router();

harvestsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          h.id, h.source_path, h.source_filename, h.model, h.total_candidates,
          h.candidates, h.source_text, h.tags, h.metadata, h.created_at,
          h.level, h.visibility_scope, h.docklang, h.source_hash, h.file_size,
          h.version, h.run_metadata
        FROM nebula.harvests h
        ORDER BY h.created_at DESC
        LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.harvests'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      sourcePath: row.source_path || null,
      sourceFilename: row.source_filename || null,
      model: row.model || null,
      totalCandidates: row.total_candidates != null ? parseInt(row.total_candidates, 10) : null,
      candidates: row.candidates || null,
      sourceText: row.source_text || null,
      tags: row.tags || null,
      metadata: row.metadata || null,
      createdAt: new Date(row.created_at).toISOString(),
      level: row.level != null ? parseInt(row.level, 10) : null,
      visibilityScope: row.visibility_scope || null,
      docklang: row.docklang || null,
      sourceHash: row.source_hash || null,
      fileSize: row.file_size != null ? parseInt(row.file_size, 10) : null,
      version: row.version != null ? parseInt(row.version, 10) : null,
      runMetadata: row.run_metadata || null,
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

harvestsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        h.id, h.source_path, h.source_filename, h.model, h.total_candidates,
        h.candidates, h.source_text, h.tags, h.metadata, h.created_at,
        h.level, h.visibility_scope, h.docklang, h.source_hash, h.file_size,
        h.version, h.run_metadata
      FROM nebula.harvests h
      WHERE h.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      sourcePath: row.source_path || null,
      sourceFilename: row.source_filename || null,
      model: row.model || null,
      totalCandidates: row.total_candidates != null ? parseInt(row.total_candidates, 10) : null,
      candidates: row.candidates || null,
      sourceText: row.source_text || null,
      tags: row.tags || null,
      metadata: row.metadata || null,
      createdAt: new Date(row.created_at).toISOString(),
      level: row.level != null ? parseInt(row.level, 10) : null,
      visibilityScope: row.visibility_scope || null,
      docklang: row.docklang || null,
      sourceHash: row.source_hash || null,
      fileSize: row.file_size != null ? parseInt(row.file_size, 10) : null,
      version: row.version != null ? parseInt(row.version, 10) : null,
      runMetadata: row.run_metadata || null,
    });
  } catch (err) {
    next(err);
  }
});
