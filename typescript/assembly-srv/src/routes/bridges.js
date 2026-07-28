import { Router } from 'express';
import { pool } from '../db.js';
import { BadRequestError } from '../errors.js';

export const bridgesRouter = Router();

// ── Forum ↔ Agenda ──────────────────────────────────────────────────

bridgesRouter.post('/forum-agenda', async (req, res, next) => {
  try {
    const { forum_id, agenda_id, label } = req.body;
    if (!forum_id || !agenda_id) throw new BadRequestError('forum_id and agenda_id are required');
    const result = await pool.query(
      `INSERT INTO assembly.forum_agendas (forum_id, agenda_id, label)
       VALUES ($1, $2, $3)
       ON CONFLICT (forum_id, agenda_id) DO UPDATE SET label = EXCLUDED.label
       RETURNING forum_id, agenda_id, label, created_at`,
      [forum_id, agenda_id, label || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

bridgesRouter.delete('/forum-agenda', async (req, res, next) => {
  try {
    const { forum_id, agenda_id } = req.body;
    if (!forum_id || !agenda_id) throw new BadRequestError('forum_id and agenda_id are required');
    await pool.query('DELETE FROM assembly.forum_agendas WHERE forum_id = $1 AND agenda_id = $2', [forum_id, agenda_id]);
    res.json({ unlinked: true });
  } catch (err) { next(err); }
});

bridgesRouter.get('/forums-by-agenda/:agendaId', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.name, f.slug, f.description
       FROM assembly.forums f
       JOIN assembly.forum_agendas fa ON fa.forum_id = f.id
       WHERE fa.agenda_id = $1
       ORDER BY f.name ASC`,
      [req.params.agendaId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

bridgesRouter.get('/agendas-by-forum/:forumId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT agenda_id, label FROM assembly.forum_agendas WHERE forum_id = $1 ORDER BY created_at DESC',
      [req.params.forumId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── Post ↔ Artifact ─────────────────────────────────────────────────

bridgesRouter.post('/post-artifact', async (req, res, next) => {
  try {
    const { post_id, artifact_type, artifact_id, label } = req.body;
    if (!post_id || !artifact_type || !artifact_id) throw new BadRequestError('post_id, artifact_type, and artifact_id are required');
    const result = await pool.query(
      `INSERT INTO assembly.post_artifact_refs (post_id, artifact_type, artifact_id, label)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (post_id, artifact_type, artifact_id) DO UPDATE SET label = EXCLUDED.label
       RETURNING post_id, artifact_type, artifact_id, label, created_at`,
      [post_id, artifact_type, artifact_id, label || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

bridgesRouter.delete('/post-artifact', async (req, res, next) => {
  try {
    const { post_id, artifact_type, artifact_id } = req.body;
    if (!post_id || !artifact_type || !artifact_id) throw new BadRequestError('post_id, artifact_type, and artifact_id are required');
    await pool.query('DELETE FROM assembly.post_artifact_refs WHERE post_id = $1 AND artifact_type = $2 AND artifact_id = $3', [post_id, artifact_type, artifact_id]);
    res.json({ unlinked: true });
  } catch (err) { next(err); }
});

bridgesRouter.get('/artifact-threads/:type/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.created, p.updated, p.text, p.url, p.rating, p.posted_by_id,
              p.forum_uuid, p.source_url, p.title
       FROM assembly.posts p
       JOIN assembly.post_artifact_refs par ON par.post_id = p.id
       WHERE par.artifact_type = $1 AND par.artifact_id = $2
       ORDER BY p.created DESC`,
      [req.params.type, req.params.id]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

bridgesRouter.get('/artifact-refs/:postId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT post_id, artifact_type, artifact_id, label, created_at FROM assembly.post_artifact_refs WHERE post_id = $1 ORDER BY created_at DESC',
      [req.params.postId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── Supporting Refs ─────────────────────────────────────────────────

bridgesRouter.post('/supporting-refs', async (req, res, next) => {
  try {
    const { post_id, comment_id, ref_type, ref_value, metadata } = req.body;
    if (!post_id && !comment_id) throw new BadRequestError('Either post_id or comment_id is required');
    if (!ref_type || !ref_value) throw new BadRequestError('ref_type and ref_value are required');
    if (post_id) {
      await pool.query(
        'INSERT INTO assembly.post_supporting_refs (post_id, ref_type, ref_value, metadata) VALUES ($1, $2, $3, $4)',
        [post_id, ref_type, ref_value, JSON.stringify(metadata || {})]
      );
    } else {
      await pool.query(
        'INSERT INTO assembly.post_supporting_refs (comment_id, ref_type, ref_value, metadata) VALUES ($1, $2, $3, $4)',
        [comment_id, ref_type, ref_value, JSON.stringify(metadata || {})]
      );
    }
    res.status(201).json({ added: true });
  } catch (err) { next(err); }
});

bridgesRouter.get('/supporting-refs/post/:postId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, ref_type, ref_value, metadata, created_at FROM assembly.post_supporting_refs WHERE post_id = $1 ORDER BY created_at DESC',
      [req.params.postId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

bridgesRouter.get('/supporting-refs/comment/:commentId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, ref_type, ref_value, metadata, created_at FROM assembly.post_supporting_refs WHERE comment_id = $1 ORDER BY created_at DESC',
      [req.params.commentId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});
