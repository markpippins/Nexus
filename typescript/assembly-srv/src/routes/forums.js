import { Router } from 'express';
import { pool } from '../db.js';
import { BadRequestError, NotFoundError } from '../errors.js';

export const forumsRouter = Router();

forumsRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        f.id,
        f.name,
        f.slug,
        f.description,
        (SELECT COUNT(*) FROM assembly.posts p WHERE p.forum_uuid = f.id) AS thread_count,
        (SELECT COUNT(*) FROM assembly.comments c
          JOIN assembly.posts p ON p.id = c.post_id
          WHERE p.forum_uuid = f.id) AS comment_count
      FROM assembly.forums f
      WHERE f.expiration_dt = 'infinity'::timestamptz OR f.expiration_dt > now()
      ORDER BY f.name ASC
    `);

    const forums = result.rows.map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description || '',
      threadCount: parseInt(row.thread_count, 10),
      postCount: parseInt(row.comment_count, 10) + parseInt(row.thread_count, 10),
    }));

    res.json(forums);
  } catch (err) {
    next(err);
  }
});

forumsRouter.get('/:slug/threads', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        p.id AS post_id,
        p.title,
        p.created AS post_created,
        p.text,
        u.id AS user_id,
        u.alias,
        u.avatar_url,
        f.id AS forum_id,
        f.slug AS forum_slug,
        f.name AS forum_name,
        (SELECT COUNT(*) FROM assembly.comments c WHERE c.post_id = p.id) AS reply_count,
        (SELECT c2.created FROM assembly.comments c2 WHERE c2.post_id = p.id ORDER BY c2.created DESC LIMIT 1) AS last_reply_at,
        (SELECT u2.alias FROM assembly.comments c3
          JOIN assembly.users u2 ON u2.id = c3.posted_by_id
          WHERE c3.post_id = p.id ORDER BY c3.created DESC LIMIT 1) AS last_reply_user_alias
      FROM assembly.posts p
      JOIN assembly.forums f ON f.id = p.forum_uuid AND (f.expiration_dt = 'infinity'::timestamptz OR f.expiration_dt > now())
      JOIN assembly.users u ON u.id = p.posted_by_id
      WHERE f.slug = $1
      ORDER BY p.created DESC
    `, [req.params.slug]);

    const threads = result.rows.map(row => ({
      id: row.post_id,
      title: row.title || 'Untitled',
      body: row.text || '',
      createdAt: new Date(row.post_created).toISOString(),
      replyCount: parseInt(row.reply_count, 10),
      viewCount: 0,
      lastReplyAt: row.last_reply_at ? new Date(row.last_reply_at).toISOString() : null,
      lastReplyAuthor: row.last_reply_user_alias,
      author: {
        id: row.user_id,
        name: row.alias,
        avatar: row.avatar_url || '',
      },
      forum: {
        id: row.forum_id,
        slug: row.forum_slug,
        name: row.forum_name,
      },
    }));

    res.json(threads);
  } catch (err) {
    next(err);
  }
});

forumsRouter.post('/:slug/threads', async (req, res, next) => {
  try {
    const { title, body, postedById } = req.body;
    if (!title || !body) {
      throw new BadRequestError('Title and body are required');
    }

    const forumResult = await pool.query(
      'SELECT id FROM assembly.forums WHERE slug = $1 AND (expiration_dt = \'infinity\'::timestamptz OR expiration_dt > now()) LIMIT 1',
      [req.params.slug]
    );
    if (forumResult.rows.length === 0) {
      throw new NotFoundError('Forum not found');
    }

    const forumId = forumResult.rows[0].id;
    const userId = postedById;
    if (!userId) {
      throw new BadRequestError('postedById is required');
    }

    const result = await pool.query(
      `INSERT INTO assembly.posts (id, forum_uuid, posted_by_id, title, text, created)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
       RETURNING id, title`,
      [forumId, userId, String(title).slice(0, 500), String(body)]
    );

    res.status(201).json({ id: result.rows[0].id, title: result.rows[0].title });
  } catch (err) {
    next(err);
  }
});

forumsRouter.get('/threads/:threadId', async (req, res, next) => {
  try {
    const threadResult = await pool.query(`
      SELECT
        p.id AS post_id,
        p.title,
        p.text,
        p.created AS post_created,
        u.id AS user_id,
        u.alias,
        u.avatar_url,
        f.id AS forum_id,
        f.slug AS forum_slug,
        f.name AS forum_name
      FROM assembly.posts p
      JOIN assembly.forums f ON f.id = p.forum_uuid AND (f.expiration_dt = 'infinity'::timestamptz OR f.expiration_dt > now())
      JOIN assembly.users u ON u.id = p.posted_by_id
      WHERE p.id = $1
      LIMIT 1
    `, [req.params.threadId]);

    if (threadResult.rows.length === 0) {
      throw new NotFoundError('Thread not found');
    }

    const row = threadResult.rows[0];

    const commentsResult = await pool.query(`
      WITH RECURSIVE comment_tree AS (
        SELECT c.*, 0 AS depth
        FROM assembly.comments c
        WHERE c.post_id = $1
        UNION ALL
        SELECT c.*, ct.depth + 1
        FROM assembly.comments c
        JOIN comment_tree ct ON c.parent_id = ct.id
      )
      SELECT
        ct.id AS comment_id,
        ct.post_id,
        ct.parent_id,
        ct.text,
        ct.created AS comment_created,
        u.id AS user_id,
        u.alias,
        u.avatar_url
      FROM comment_tree ct
      JOIN assembly.users u ON u.id = ct.posted_by_id
      ORDER BY ct.depth ASC, ct.created ASC
    `, [req.params.threadId]);

    const comments = commentsResult.rows.map(c => ({
      id: c.comment_id,
      body: c.text || '',
      createdAt: new Date(c.comment_created).toISOString(),
      parentId: c.parent_id || null,
      author: {
        id: c.user_id,
        name: c.alias,
        avatar: c.avatar_url || '',
      },
    }));

    res.json({
      thread: {
        id: row.post_id,
        title: row.title || 'Untitled',
        body: row.text || '',
        createdAt: new Date(row.post_created).toISOString(),
        author: {
          id: row.user_id,
          name: row.alias,
          avatar: row.avatar_url || '',
        },
        forum: {
          id: row.forum_id,
          slug: row.forum_slug,
          name: row.forum_name,
        },
      },
      comments,
    });
  } catch (err) {
    next(err);
  }
});

forumsRouter.post('/threads/:threadId/comments', async (req, res, next) => {
  try {
    const { body, postedById, parentId } = req.body;
    if (!body || !postedById) {
      throw new BadRequestError('Body and postedById are required');
    }

    const threadResult = await pool.query(
      `SELECT p.id AS post_id, f.slug AS forum_slug
       FROM assembly.posts p
       JOIN assembly.forums f ON f.id = p.forum_uuid AND (f.expiration_dt = 'infinity'::timestamptz OR f.expiration_dt > now())
       WHERE p.id = $1
       LIMIT 1`,
      [req.params.threadId]
    );

    if (threadResult.rows.length === 0) {
      throw new NotFoundError('Thread not found');
    }

    let postId = threadResult.rows[0].post_id;

    if (parentId) {
      const parentResult = await pool.query(
        `WITH RECURSIVE chain AS (
           SELECT id, parent_id, post_id FROM assembly.comments WHERE id = $1
           UNION ALL
           SELECT c.id, c.parent_id, c.post_id
           FROM assembly.comments c
           JOIN chain cc ON c.id = cc.parent_id
         )
         SELECT post_id FROM chain WHERE post_id IS NOT NULL LIMIT 1`,
        [parentId]
      );
      if (parentResult.rows.length === 0 || parentResult.rows[0].post_id !== postId) {
        throw new BadRequestError('Parent comment not found or does not belong to this thread');
      }
      postId = null;
    }

    const result = await pool.query(
      `INSERT INTO assembly.comments (id, post_id, parent_id, text, posted_by_id, created)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW())
       RETURNING id`,
      [postId, parentId || null, String(body), postedById]
    );

    res.status(201).json({ id: result.rows[0].id });
  } catch (err) {
    next(err);
  }
});
