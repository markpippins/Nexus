import { Router } from 'express';
import { pool } from '../db.js';
import { BadRequestError, NotFoundError } from '../errors.js';

export const forumsRouter = Router();

// ── Forum CRUD ──────────────────────────────────────────────────────

forumsRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        f.id,
        f.name,
        f.slug,
        f.description,
        f.sort_order,
        (SELECT COUNT(*) FROM assembly.posts p WHERE p.forum_uuid = f.id) AS thread_count,
        (SELECT COUNT(*) FROM assembly.comments c
          JOIN assembly.posts p ON p.id = c.post_id
          WHERE p.forum_uuid = f.id) AS comment_count
      FROM assembly.forums f
      WHERE f.expiration_dt = 'infinity'::timestamptz OR f.expiration_dt > now()
      ORDER BY COALESCE(f.sort_order, 0) ASC, f.name ASC
    `);

    const forums = result.rows.map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description || '',
      sortOrder: row.sort_order ?? 0,
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
    const { title, body, postedById, source_url } = req.body;
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
      `INSERT INTO assembly.posts (id, forum_uuid, posted_by_id, title, text, source_url, created)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING id, title`,
      [forumId, userId, String(title).slice(0, 500), String(body), source_url || null]
    );

    res.status(201).json({ id: result.rows[0].id, title: result.rows[0].title });
  } catch (err) {
    next(err);
  }
});

// ── UUID-based thread endpoints (avoids slug resolution round-trip) ──

forumsRouter.post('/by-id/:forumId/threads', async (req, res, next) => {
  try {
    const { title, body, postedById, source_url } = req.body;
    if (!title || !body) throw new BadRequestError('Title and body are required');
    if (!postedById) throw new BadRequestError('postedById is required');

    const forumCheck = await pool.query(
      'SELECT id FROM assembly.forums WHERE id = $1 AND (expiration_dt = \'infinity\'::timestamptz OR expiration_dt > now()) LIMIT 1',
      [req.params.forumId]
    );
    if (forumCheck.rows.length === 0) throw new NotFoundError('Forum not found');

    const result = await pool.query(
      `INSERT INTO assembly.posts (id, forum_uuid, posted_by_id, title, text, source_url, created)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
       RETURNING id, title`,
      [req.params.forumId, postedById, String(title).slice(0, 500), String(body), source_url || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

forumsRouter.get('/by-id/:forumId/threads', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.title, p.created, p.text, p.source_url,
              u.id AS user_id, u.alias, u.avatar_url,
              f.id AS forum_id, f.slug AS forum_slug, f.name AS forum_name
       FROM assembly.posts p
       JOIN assembly.forums f ON f.id = p.forum_uuid
       JOIN assembly.users u ON u.id = p.posted_by_id
       WHERE p.forum_uuid = $1
       ORDER BY p.created DESC`,
      [req.params.forumId]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
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

// ── Forum management (missing from original — migrated from assembly-mcp db.ts) ──

forumsRouter.get('/by-slug/:slug', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, slug, description FROM assembly.forums WHERE slug = $1 AND (expiration_dt = \'infinity\'::timestamptz OR expiration_dt > now()) LIMIT 1',
      [req.params.slug]
    );
    if (result.rows.length === 0) throw new NotFoundError('Forum not found');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

forumsRouter.get('/by-id/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, name, slug, description FROM assembly.forums WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Forum not found');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

forumsRouter.post('/', async (req, res, next) => {
  try {
    const { name, slug, description } = req.body;
    if (!name) throw new BadRequestError('name is required');
    const genSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // Assign sort_order to the end of the list
    const maxResult = await pool.query("SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM assembly.forums WHERE expiration_dt = 'infinity'::timestamptz OR expiration_dt > now()");
    const nextOrder = maxResult.rows[0]?.next_order ?? 0;
    const result = await pool.query(
      'INSERT INTO assembly.forums (id, name, slug, description, sort_order) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id, name, slug, description, sort_order',
      [name, genSlug, description || null, nextOrder]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

forumsRouter.put('/:id', async (req, res, next) => {
  try {
    const { name, slug, description } = req.body;
    const sets = [];
    const params = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
    if (slug !== undefined) { sets.push(`slug = $${idx++}`); params.push(slug); }
    if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
    if (sets.length === 0) {
      const r = await pool.query('SELECT id, name, slug, description FROM assembly.forums WHERE id = $1', [req.params.id]);
      if (r.rows.length === 0) throw new NotFoundError('Forum not found');
      return res.json(r.rows[0]);
    }
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE assembly.forums SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, slug, description`,
      params
    );
    if (result.rows.length === 0) throw new NotFoundError('Forum not found');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

forumsRouter.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'UPDATE assembly.forums SET expiration_dt = now() WHERE id = $1 RETURNING id, name',
      [req.params.id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Forum not found');
    res.json({ expired: true, forum_id: req.params.id, name: result.rows[0].name });
  } catch (err) { next(err); }
});

// ── Reorder ───────────────────────────────────────────────────────────

forumsRouter.put('/reorder', async (req, res, next) => {
  try {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
      throw new BadRequestError('orderedIds array is required');
    }
    const values = [];
    const params = [];
    const placeholders = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const idx = i * 2;
      params.push(orderedIds[i], i);
      placeholders.push(`($${idx + 1}::uuid, $${idx + 2}::integer)`);
    }
    await pool.query(
      `UPDATE assembly.forums AS f
       SET sort_order = v.sort_order
       FROM (VALUES ${placeholders.join(', ')}) AS v(id, sort_order)
       WHERE f.id = v.id::uuid`,
      params
    );
    res.json({ reordered: true, count: orderedIds.length });
  } catch (err) { next(err); }
});

// ── Thread management ───────────────────────────────────────────────

forumsRouter.post('/move-thread', async (req, res, next) => {
  try {
    const { post_id, forum_id } = req.body;
    if (!post_id || !forum_id) throw new BadRequestError('post_id and forum_id are required');
    const forumCheck = await pool.query('SELECT id FROM assembly.forums WHERE id = $1 AND (expiration_dt = \'infinity\'::timestamptz OR expiration_dt > now())', [forum_id]);
    if (forumCheck.rows.length === 0) throw new NotFoundError('Destination forum not found');
    const result = await pool.query(
      'UPDATE assembly.posts SET forum_uuid = $1, updated = now() WHERE id = $2 RETURNING id, title, forum_uuid, created, updated, text, url, rating, posted_by_id, source_url',
      [forum_id, post_id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Post not found');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

forumsRouter.delete('/threads/:threadId', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM assembly.posts WHERE id = $1', [req.params.threadId]);
    if (result.rowCount === 0) throw new NotFoundError('Thread not found');
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// ── Search ──────────────────────────────────────────────────────────

forumsRouter.get('/search/by-name', async (req, res, next) => {
  try {
    const { name } = req.query;
    if (!name) throw new BadRequestError('name query parameter is required');
    const result = await pool.query(
      'SELECT id, name, slug, description FROM assembly.forums WHERE name ILIKE $1 OR slug ILIKE $1 ORDER BY name ASC LIMIT 20',
      [`%${name}%`]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

forumsRouter.get('/search/by-thread-title', async (req, res, next) => {
  try {
    const { title } = req.query;
    if (!title) throw new BadRequestError('title query parameter is required');
    const result = await pool.query(
      'SELECT id, created, updated, text, url, rating, posted_by_id, forum_uuid, source_url, title FROM assembly.posts WHERE title ILIKE $1 ORDER BY created DESC LIMIT 20',
      [`%${title}%`]
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// ── Comment management ──────────────────────────────────────────────

forumsRouter.get('/comments/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id, created, updated, text, url, rating, posted_by_id, post_id, parent_id FROM assembly.comments WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Comment not found');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

forumsRouter.delete('/comments/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM assembly.comments WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) throw new NotFoundError('Comment not found');
    res.json({ deleted: true });
  } catch (err) { next(err); }
});
