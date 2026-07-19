import { Router } from 'express';
import { pool } from '../db.js';

export const conversationsRouter = Router();

conversationsRouter.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize || '100'), 10)));
    const offset = (page - 1) * pageSize;

    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT
          cs.id, cs.conversation_id, cs.snapshot_index, cs.source_hash,
          cs.capture_mode, cs.block_count, cs.created_by, cs.created_at,
          h.source_filename
        FROM nebula.conversation_snapshots cs
        LEFT JOIN nebula.harvests h ON h.id = cs.conversation_id
        ORDER BY cs.created_at DESC
        LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
      pool.query('SELECT COUNT(*)::int AS total FROM nebula.conversation_snapshots'),
    ]);

    const items = dataResult.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      snapshotIndex: parseInt(row.snapshot_index, 10),
      sourceHash: row.source_hash || null,
      captureMode: row.capture_mode || null,
      blockCount: row.block_count != null ? parseInt(row.block_count, 10) : null,
      createdBy: row.created_by || null,
      createdAt: new Date(row.created_at).toISOString(),
      sourceFilename: row.source_filename || null,
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

conversationsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        cs.id, cs.conversation_id, cs.snapshot_index, cs.source_hash,
        cs.capture_mode, cs.block_count, cs.created_by, cs.created_at,
        h.source_filename
      FROM nebula.conversation_snapshots cs
      LEFT JOIN nebula.harvests h ON h.id = cs.conversation_id
      WHERE cs.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      conversationId: row.conversation_id,
      snapshotIndex: parseInt(row.snapshot_index, 10),
      sourceHash: row.source_hash || null,
      captureMode: row.capture_mode || null,
      blockCount: row.block_count != null ? parseInt(row.block_count, 10) : null,
      createdBy: row.created_by || null,
      createdAt: new Date(row.created_at).toISOString(),
      sourceFilename: row.source_filename || null,
    });
  } catch (err) {
    next(err);
  }
});

conversationsRouter.get('/:id/blocks', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, conversation_id, snapshot_id, block_index,
              parent_turn_id, parent_block_id, block_type,
              content_md, content_hash, role,
              dom_path, dom_fingerprint,
              first_line_no, last_line_no, created_at
       FROM nebula.conversation_blocks
       WHERE conversation_id = $1
       ORDER BY block_index ASC`,
      [req.params.id]
    );

    const blocks = result.rows.map(row => ({
      id: row.id,
      conversationId: row.conversation_id,
      snapshotId: row.snapshot_id,
      blockIndex: parseInt(row.block_index, 10),
      parentTurnId: row.parent_turn_id || null,
      parentBlockId: row.parent_block_id || null,
      blockType: row.block_type,
      contentMd: row.content_md || null,
      contentHash: row.content_hash || null,
      role: row.role || null,
      domPath: row.dom_path || null,
      domFingerprint: row.dom_fingerprint || null,
      firstLineNo: row.first_line_no != null ? parseInt(row.first_line_no, 10) : null,
      lastLineNo: row.last_line_no != null ? parseInt(row.last_line_no, 10) : null,
      createdAt: new Date(row.created_at).toISOString(),
    }));

    res.json(blocks);
  } catch (err) {
    next(err);
  }
});
