import { Router } from 'express';
import { pool } from '../db.js';
import { fetchNebula } from '../utils/fetchNebula.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ query: q, results: [] });
    }

    const escapeLike = (value) => value.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
    const pattern = `%${escapeLike(q)}%`;
    const limit = 20;

    // Delegate nebula-side search to nebula-srv
    const nebulaResponse = await fetchNebula('/search', { q });

    // Assembly-local searches: forums, threads (posts), comments
    const [forumResult, threadResult, commentResult] = await Promise.all([
      pool.query(
        `SELECT id, name, slug, description
         FROM assembly.forums
         WHERE (name ILIKE $1 ESCAPE '\\' OR description ILIKE $1 ESCAPE '\\' OR slug ILIKE $1 ESCAPE '\\')
           AND (expiration_dt = 'infinity'::timestamptz OR expiration_dt > now())
         LIMIT $2`,
        [pattern, limit]
      ),
       pool.query(
        `SELECT p.id, p.title, p.text AS body, f.slug AS forum_slug
         FROM assembly.posts p
         JOIN assembly.forums f ON f.id = p.forum_uuid
         WHERE (p.title ILIKE $1 ESCAPE '\\' OR p.text ILIKE $1 ESCAPE '\\')
           AND (p.expiration_dt = 'infinity'::timestamptz OR p.expiration_dt > now())
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT c.id, c.text AS body, p.id AS thread_id, p.title AS thread_title, f.slug AS forum_slug
         FROM assembly.comments c
         JOIN assembly.posts p ON p.id = c.post_id AND (p.expiration_dt = 'infinity'::timestamptz OR p.expiration_dt > now())
         JOIN assembly.forums f ON f.id = p.forum_uuid
         WHERE c.text ILIKE $1 ESCAPE '\\'
           AND (c.expiration_dt = 'infinity'::timestamptz OR c.expiration_dt > now())
         LIMIT $2`,
        [pattern, limit]
      ),
    ]);

    const assemblyResults = [
      ...forumResult.rows.map(row => ({
        type: 'forum',
        id: row.id,
        title: row.name,
        description: row.description || '',
        href: `/forums/${row.slug}`,
      })),
      ...threadResult.rows.map(row => ({
        type: 'post',
        id: row.id,
        title: row.title,
        description: row.body ? row.body.slice(0, 200) : '',
        href: `/forums/${row.forum_slug}/${row.id}`,
      })),
      ...commentResult.rows.map(row => ({
        type: 'post',
        id: row.id,
        title: row.thread_title,
        description: row.body ? row.body.slice(0, 200) : '',
        href: `/forums/${row.forum_slug}/${row.thread_id}`,
      })),
    ];

    // Merge nebula results with assembly-local results, cap at 100
    const allResults = [
      ...(nebulaResponse.results || []),
      ...assemblyResults,
    ].slice(0, 100);

    res.json({ query: q, results: allResults, total: allResults.length });
  } catch (err) {
    next(err);
  }
});
