import { Router } from 'express';
import { pool } from '../db.js';

export const feedRouter = Router();

feedRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id AS post_id,
        p.text,
        p.created,
        u.id AS user_id,
        u.alias,
        u.avatar_url,
        f.id AS forum_id,
        f.slug AS forum_slug,
        f.name AS forum_name,
        (
          WITH RECURSIVE tree AS (
            SELECT id FROM assembly.comments WHERE post_id = p.id
            UNION ALL
            SELECT c.id FROM assembly.comments c
            JOIN tree t ON c.parent_id = t.id
          )
          SELECT COUNT(*) FROM tree
        ) AS comment_count
      FROM assembly.posts p
      JOIN assembly.users u ON u.id = p.posted_by_id
      LEFT JOIN assembly.forums f ON f.id = p.forum_uuid AND (f.expiration_dt = 'infinity'::timestamptz OR f.expiration_dt > now())
      ORDER BY p.created DESC
      LIMIT 50
    `);

    const posts = result.rows.map(row => ({
      id: row.post_id,
      title: row.text ? row.text.split('\n')[0].slice(0, 120) : 'Untitled',
      content: row.text || '',
      createdAt: new Date(row.created).toISOString(),
      comments: parseInt(row.comment_count, 10),
      author: {
        id: row.user_id,
        name: row.alias,
        avatar: row.avatar_url || '',
      },
      forum: row.forum_id
        ? { id: row.forum_id, slug: row.forum_slug, name: row.forum_name }
        : null,
    }));

    res.json(posts);
  } catch (err) {
    next(err);
  }
});

feedRouter.post('/', async (req, res, next) => {
  try {
    const { text, postedById } = req.body;
    if (!text || !postedById) {
      return res.status(400).json({ error: 'Text and postedById are required' });
    }

    const result = await pool.query(
      `INSERT INTO assembly.posts (id, posted_by_id, title, text, created)
       VALUES (gen_random_uuid(), $1, $2, $3, NOW())
       RETURNING id`,
      [postedById, String(text).slice(0, 500), String(text)]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});
