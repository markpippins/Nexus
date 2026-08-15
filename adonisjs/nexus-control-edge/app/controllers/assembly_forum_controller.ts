import type { HttpContext } from '@adonisjs/core/http'
import { q } from '../services/nebula_helpers.js'

/**
 * assembly-srv (Wave 3.2) — forums / feed / users domain.
 * Ported from nexus/typescript/assembly-srv/src/routes/{forums,feed,users}.js.
 * Queries the assembly.* schema directly (canonical assembly forum data).
 */

export default class AssemblyForumController {
  // ── FORUMS ─────────────────────────────────────────────────────────

  /** GET /api/forums */
  async listForums(_ctx: HttpContext) {
    const { rows } = await q(
      'SELECT id, name, slug, description, sort_order, thread_count, comment_count FROM assembly.forum_list_v'
    )
    return rows.map((row: any) => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description || '',
      sortOrder: row.sort_order ?? 0,
      threadCount: parseInt(row.thread_count, 10),
      postCount: parseInt(row.comment_count, 10) + parseInt(row.thread_count, 10),
    }))
  }

  /** GET /api/forums/:slug/threads */
  async listThreadsBySlug({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT * FROM assembly.thread_list_v WHERE forum_slug = $1',
        [request.params().slug]
      )
      return rows.map((row: any) => ({
        id: row.post_id,
        title: row.title || 'Untitled',
        body: row.text || '',
        role: row.role || null,
        model: row.model || null,
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
      }))
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/forums/:slug/threads */
  async createThreadBySlug({ request, response }: HttpContext) {
    try {
      const { title, body, postedById, source_url, role, model } = request.body()
      if (!title || !body) return response.status(400).json({ error: 'Title and body are required' })
      if (!postedById) return response.status(400).json({ error: 'postedById is required' })
      const { rows } = await q(
        'SELECT * FROM assembly.create_thread($1, $2, $3, $4, $5, $6, $7)',
        [request.params().slug, postedById, String(title).slice(0, 500), String(body), source_url || null, role || null, model || null]
      )
      return response.status(201).json({
        id: rows[0].id,
        title: rows[0].title,
        role: rows[0].role,
        model: rows[0].model,
      })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/forums/by-id/:forumId/threads */
  async createThreadByForumId({ request, response }: HttpContext) {
    try {
      const { title, body, postedById, source_url, role, model } = request.body()
      if (!title || !body) return response.status(400).json({ error: 'Title and body are required' })
      if (!postedById) return response.status(400).json({ error: 'postedById is required' })

      const forumCheck = await q(
        "SELECT id FROM assembly.forums WHERE id = $1 AND (expiration_dt = 'infinity'::timestamptz OR expiration_dt > now()) LIMIT 1",
        [request.params().forumId]
      )
      if (forumCheck.rows.length === 0) return response.status(404).json({ error: 'Forum not found' })

      const { rows } = await q(
        `INSERT INTO assembly.posts (id, forum_uuid, posted_by_id, title, text, source_url, role, model, created)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id, title, role, model`,
        [request.params().forumId, postedById, String(title).slice(0, 500), String(body), source_url || null, role || null, model || null]
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/forums/by-id/:forumId/threads */
  async listThreadsByForumId({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        `SELECT p.id, p.title, p.created, p.text, p.source_url, p.role, p.model,
                u.id AS user_id, u.alias, u.avatar_url,
                f.id AS forum_id, f.slug AS forum_slug, f.name AS forum_name
         FROM assembly.posts p
         JOIN assembly.forums f ON f.id = p.forum_uuid
         JOIN assembly.users u ON u.id = p.posted_by_id
         WHERE p.forum_uuid = $1 AND (p.expiration_dt = 'infinity'::timestamptz OR p.expiration_dt > now())
         ORDER BY p.created DESC`,
        [request.params().forumId]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/forums/threads/:threadId */
  async getThread({ request, response }: HttpContext) {
    try {
      const threadResult = await q(
        `SELECT
          p.id AS post_id, p.title, p.text, p.created AS post_created, p.role, p.model,
          u.id AS user_id, u.alias, u.avatar_url,
          f.id AS forum_id, f.slug AS forum_slug, f.name AS forum_name
         FROM assembly.posts p
         JOIN assembly.forums f ON f.id = p.forum_uuid AND (f.expiration_dt = 'infinity'::timestamptz OR f.expiration_dt > now())
         JOIN assembly.users u ON u.id = p.posted_by_id
         WHERE p.id = $1 AND (p.expiration_dt = 'infinity'::timestamptz OR p.expiration_dt > now())
         LIMIT 1`,
        [request.params().threadId]
      )
      if (threadResult.rows.length === 0) return response.status(404).json({ error: 'Thread not found' })

      const row = threadResult.rows[0]

      const commentsResult = await q(
        `WITH RECURSIVE comment_tree AS (
           SELECT c.*, 0 AS depth
           FROM assembly.comments c
           WHERE c.post_id = $1 AND (c.expiration_dt = 'infinity'::timestamptz OR c.expiration_dt > now())
           UNION ALL
           SELECT c.*, ct.depth + 1
           FROM assembly.comments c
           JOIN comment_tree ct ON c.parent_id = ct.id
           WHERE (c.expiration_dt = 'infinity'::timestamptz OR c.expiration_dt > now())
         )
         SELECT
           ct.id AS comment_id, ct.post_id, ct.parent_id, ct.text, ct.created AS comment_created,
           ct.role, ct.model,
           u.id AS user_id, u.alias, u.avatar_url
         FROM comment_tree ct
         JOIN assembly.users u ON u.id = ct.posted_by_id
         ORDER BY ct.depth ASC, ct.created ASC`,
        [request.params().threadId]
      )

      const comments = commentsResult.rows.map((c: any) => ({
        id: c.comment_id,
        body: c.text || '',
        role: c.role || null,
        model: c.model || null,
        createdAt: new Date(c.comment_created).toISOString(),
        parentId: c.parent_id || null,
        author: {
          id: c.user_id,
          name: c.alias,
          avatar: c.avatar_url || '',
        },
      }))

      return {
        thread: {
          id: row.post_id,
          title: row.title || 'Untitled',
          body: row.text || '',
          role: row.role || null,
          model: row.model || null,
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
      }
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/forums/threads/:threadId/comments */
  async addComment({ request, response }: HttpContext) {
    try {
      const { body, postedById, parentId, role, model } = request.body()
      if (!body || !postedById) return response.status(400).json({ error: 'Body and postedById are required' })

      const { rows } = await q(
        'SELECT * FROM assembly.add_comment($1, $2, $3, $4, $5, $6)',
        [request.params().threadId, postedById, String(body), parentId || null, role || null, model || null]
      )
      return response.status(201).json({ id: rows[0].id, role: rows[0].role, model: rows[0].model })
    } catch (err: any) {
      if (err.code === 'P0002') return response.status(404).json({ error: 'Thread not found' })
      if (err.code === 'P0001') return response.status(400).json({ error: 'Parent comment not found or does not belong to this thread' })
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/forums/by-slug/:slug */
  async getForumBySlug({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        "SELECT id, name, slug, description FROM assembly.forums WHERE slug = $1 AND (expiration_dt = 'infinity'::timestamptz OR expiration_dt > now()) LIMIT 1",
        [request.params().slug]
      )
      if (rows.length === 0) return response.status(404).json({ error: 'Forum not found' })
      return rows[0]
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/forums/by-id/:id */
  async getForumById({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT id, name, slug, description FROM assembly.forums WHERE id = $1',
        [request.params().id]
      )
      if (rows.length === 0) return response.status(404).json({ error: 'Forum not found' })
      return rows[0]
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/forums */
  async createForum({ request, response }: HttpContext) {
    try {
      const { name, slug, description } = request.body()
      if (!name) return response.status(400).json({ error: 'name is required' })
      const genSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      const { rows } = await q(
        'SELECT * FROM assembly.create_forum($1, $2, $3)',
        [name, genSlug, description || null]
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** PUT /api/forums/:id */
  async updateForum({ request, response }: HttpContext) {
    try {
      const { name, slug, description } = request.body()
      const sets: string[] = []
      const params: any[] = []
      let idx = 1
      if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name) }
      if (slug !== undefined) { sets.push(`slug = $${idx++}`); params.push(slug) }
      if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description) }
      if (sets.length === 0) {
        const r = await q('SELECT id, name, slug, description FROM assembly.forums WHERE id = $1', [request.params().id])
        if (r.rows.length === 0) return response.status(404).json({ error: 'Forum not found' })
        return r.rows[0]
      }
      params.push(request.params().id)
      const { rows } = await q(
        `UPDATE assembly.forums SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, slug, description`,
        params
      )
      if (rows.length === 0) return response.status(404).json({ error: 'Forum not found' })
      return rows[0]
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** DELETE /api/forums/:id */
  async deleteForum({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'UPDATE assembly.forums SET expiration_dt = now() WHERE id = $1 RETURNING id, name',
        [request.params().id]
      )
      if (rows.length === 0) return response.status(404).json({ error: 'Forum not found' })
      return { expired: true, forum_id: request.params().id, name: rows[0].name }
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** PUT /api/forums/reorder */
  async reorderForums({ request, response }: HttpContext) {
    try {
      const { orderedIds } = request.body()
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        return response.status(400).json({ error: 'orderedIds array is required' })
      }
      const { rows } = await q('SELECT assembly.reorder_forums($1::uuid[])', [orderedIds])
      const count = rows[0]?.reorder_forums ?? orderedIds.length
      return { reordered: true, count }
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/forums/move-thread */
  async moveThread({ request, response }: HttpContext) {
    try {
      const { post_id, forum_id } = request.body()
      if (!post_id || !forum_id) return response.status(400).json({ error: 'post_id and forum_id are required' })
      const { rows } = await q('SELECT * FROM assembly.move_thread($1, $2)', [post_id, forum_id])
      if (rows.length === 0) return response.status(404).json({ error: 'Post not found' })
      return rows[0]
    } catch (err: any) {
      if (err.code === 'P0002') return response.status(404).json({ error: 'Destination forum not found or post not found' })
      return response.status(500).json({ error: err.message })
    }
  }

  /** DELETE /api/forums/threads/:threadId */
  async deleteThread({ request, response }: HttpContext) {
    try {
      const result = await q('SELECT * FROM assembly.soft_delete_thread($1)', [request.params().threadId])
      if (result.rowCount === 0) return response.status(404).json({ error: 'Thread not found' })
      return { deleted: true, expired: true, thread_id: request.params().threadId }
    } catch (err: any) {
      if (err.code === 'P0002') return response.status(404).json({ error: 'Thread not found' })
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/forums/search/by-name */
  async searchForumsByName({ request, response }: HttpContext) {
    try {
      const name = String(request.qs().name || '')
      if (!name) return response.status(400).json({ error: 'name query parameter is required' })
      const { rows } = await q(
        'SELECT id, name, slug, description FROM assembly.forums WHERE name ILIKE $1 OR slug ILIKE $1 ORDER BY name ASC LIMIT 20',
        [`%${name}%`]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/forums/search/by-thread-title */
  async searchThreadsByTitle({ request, response }: HttpContext) {
    try {
      const title = String(request.qs().title || '')
      if (!title) return response.status(400).json({ error: 'title query parameter is required' })
      const { rows } = await q(
        'SELECT id, created, updated, text, url, rating, posted_by_id, forum_uuid, source_url, title FROM assembly.posts WHERE title ILIKE $1 ORDER BY created DESC LIMIT 20',
        [`%${title}%`]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/forums/comments/:id */
  async getComment({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT id, created, updated, text, url, rating, posted_by_id, post_id, parent_id FROM assembly.comments WHERE id = $1',
        [request.params().id]
      )
      if (rows.length === 0) return response.status(404).json({ error: 'Comment not found' })
      return rows[0]
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** DELETE /api/forums/comments/:id */
  async deleteComment({ request, response }: HttpContext) {
    try {
      const result = await q('SELECT * FROM assembly.soft_delete_comment($1)', [request.params().id])
      if (result.rowCount === 0) return response.status(404).json({ error: 'Comment not found' })
      return { deleted: true, expired: true, comment_id: request.params().id }
    } catch (err: any) {
      if (err.code === 'P0002') return response.status(404).json({ error: 'Comment not found' })
      return response.status(500).json({ error: err.message })
    }
  }

  // ── FEED ────────────────────────────────────────────────────────────

  /** GET /api/feed */
  async listFeed(_ctx: HttpContext) {
    const { rows } = await q(
      'SELECT post_id, text, created, user_id, alias, avatar_url, forum_id, forum_slug, forum_name, comment_count FROM assembly.feed_posts_v LIMIT 50'
    )
    return rows.map((row: any) => ({
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
    }))
  }

  /** DELETE /api/feed/:id */
  async deleteFeedPost({ request, response }: HttpContext) {
    try {
      const result = await q('SELECT * FROM assembly.soft_delete_thread($1)', [request.params().id])
      if (result.rowCount === 0) return response.status(404).json({ error: 'Post not found' })
      return { id: result.rows[0].id }
    } catch (err: any) {
      if (err.code === 'P0002') return response.status(404).json({ error: 'Post not found' })
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/feed */
  async createFeedPost({ request, response }: HttpContext) {
    try {
      const { text, postedById } = request.body()
      if (!text || !postedById) return response.status(400).json({ error: 'Text and postedById are required' })
      const { rows } = await q(
        `INSERT INTO assembly.posts (id, posted_by_id, title, text, created)
         VALUES (gen_random_uuid(), $1, $2, $3, NOW())
         RETURNING id`,
        [postedById, String(text).slice(0, 500), String(text)]
      )
      return response.status(201).json({ id: rows[0].id })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── USERS ───────────────────────────────────────────────────────────

  /** GET /api/users */
  async listUsers(_ctx: HttpContext) {
    const { rows } = await q('SELECT id, alias, email, avatar_url, created_at FROM assembly.user_list_v')
    return rows.map((row: any) => ({
      id: row.id,
      name: row.alias,
      email: row.email || null,
      avatar: row.avatar_url || '',
      createdAt: new Date(row.created_at).toISOString(),
    }))
  }

  /** GET /api/users/:id */
  async getUser({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT id, alias, email, avatar_url, created_at FROM assembly.user_by_id_v WHERE id = $1',
        [request.params().id]
      )
      if (rows.length === 0) return response.status(404).json({ error: 'Not found' })
      const row = rows[0]
      return {
        id: row.id,
        name: row.alias,
        email: row.email || null,
        avatar: row.avatar_url || '',
        createdAt: new Date(row.created_at).toISOString(),
      }
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/users/by-alias/:alias */
  async getUserByAlias({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT id, identifier, admin, alias, email, avatar_url FROM assembly.users WHERE alias = $1',
        [request.params().userAlias]
      )
      if (rows.length === 0) return response.status(404).json({ error: 'User not found' })
      return rows[0]
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** POST /api/users */
  async createUser({ request, response }: HttpContext) {
    try {
      const { alias, email, password, avatar_url, admin } = request.body()
      if (!alias || !email) return response.status(400).json({ error: 'alias and email are required' })
      const pwd = password || 'changeme'
      const { rows } = await q(
        'INSERT INTO assembly.users (id, alias, email, password, avatar_url, admin) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id, identifier, admin, alias, email, avatar_url',
        [alias, email, pwd, avatar_url || null, admin || false]
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }
}
