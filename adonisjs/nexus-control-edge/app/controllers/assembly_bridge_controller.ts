import type { HttpContext } from '@adonisjs/core/http'
import { q } from '../services/nebula_helpers.js'

/**
 * assembly-srv (Wave 3.2) — bridges / duality domain.
 * Ported from nexus/typescript/assembly-srv/src/routes/{bridges,duality}.js.
 * Bridges: forum↔agenda and post↔artifact link management.
 * Duality: session watches for the interactive execution backend.
 */

export default class AssemblyBridgeController {
  // ── BRIDGES: Forum ↔ Agenda ────────────────────────────────────────

  /** POST /api/bridges/forum-agenda */
  async linkForumAgenda({ request, response }: HttpContext) {
    try {
      const { forum_id, agenda_id, label } = request.body()
      if (!forum_id || !agenda_id) return response.status(400).json({ error: 'forum_id and agenda_id are required' })
      const { rows } = await q(
        'SELECT * FROM assembly.link_forum_agenda($1, $2, $3)',
        [forum_id, agenda_id, label || null]
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** DELETE /api/bridges/forum-agenda */
  async unlinkForumAgenda({ request, response }: HttpContext) {
    try {
      const { forum_id, agenda_id } = request.body()
      if (!forum_id || !agenda_id) return response.status(400).json({ error: 'forum_id and agenda_id are required' })
      await q('SELECT assembly.unlink_forum_agenda($1, $2)', [forum_id, agenda_id])
      return { unlinked: true }
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/bridges/forums-by-agenda/:agendaId */
  async forumsByAgenda({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        `SELECT f.id, f.name, f.slug, f.description
         FROM assembly.forums f
         JOIN assembly.forum_agendas fa ON fa.forum_id = f.id AND (fa.expiration_dt = 'infinity'::timestamptz OR fa.expiration_dt > now())
         WHERE fa.agenda_id = $1
         ORDER BY f.name ASC`,
        [request.params().agendaId]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/bridges/agendas-by-forum/:forumId */
  async agendasByForum({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT agenda_id, label, created_at FROM assembly.forum_agendas_v WHERE forum_id = $1 ORDER BY created_at DESC',
        [request.params().forumId]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── BRIDGES: Post ↔ Artifact ───────────────────────────────────────

  /** POST /api/bridges/post-artifact */
  async linkPostArtifact({ request, response }: HttpContext) {
    try {
      const { post_id, artifact_type, artifact_id, label } = request.body()
      if (!post_id || !artifact_type || !artifact_id) {
        return response.status(400).json({ error: 'post_id, artifact_type, and artifact_id are required' })
      }
      const { rows } = await q(
        'SELECT * FROM assembly.link_post_artifact($1, $2, $3, $4)',
        [post_id, artifact_type, artifact_id, label || null]
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** DELETE /api/bridges/post-artifact */
  async unlinkPostArtifact({ request, response }: HttpContext) {
    try {
      const { post_id, artifact_type, artifact_id } = request.body()
      if (!post_id || !artifact_type || !artifact_id) {
        return response.status(400).json({ error: 'post_id, artifact_type, and artifact_id are required' })
      }
      await q('SELECT assembly.unlink_post_artifact($1, $2, $3)', [post_id, artifact_type, artifact_id])
      return { unlinked: true }
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/bridges/artifact-threads/:type/:id */
  async artifactThreads({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        `SELECT p.id, p.created, p.updated, p.text, p.url, p.rating, p.posted_by_id,
                p.forum_uuid, p.source_url, p.title
         FROM assembly.posts p
         JOIN assembly.post_artifact_refs par ON par.post_id = p.id AND (par.expiration_dt = 'infinity'::timestamptz OR par.expiration_dt > now())
         WHERE par.artifact_type = $1 AND par.artifact_id = $2 AND (p.expiration_dt = 'infinity'::timestamptz OR p.expiration_dt > now())
         ORDER BY p.created DESC`,
        [request.params().type, request.params().id]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/bridges/artifact-refs/:postId */
  async artifactRefs({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT post_id, artifact_type, artifact_id, label, created_at FROM assembly.artifact_refs_v WHERE post_id = $1 ORDER BY created_at DESC',
        [request.params().postId]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── BRIDGES: Supporting Refs ───────────────────────────────────────

  /** POST /api/bridges/supporting-refs */
  async addSupportingRef({ request, response }: HttpContext) {
    try {
      const { post_id, comment_id, ref_type, ref_value, metadata } = request.body()
      if (!post_id && !comment_id) return response.status(400).json({ error: 'Either post_id or comment_id is required' })
      if (!ref_type || !ref_value) return response.status(400).json({ error: 'ref_type and ref_value are required' })
      if (post_id) {
        await q(
          'INSERT INTO assembly.post_supporting_refs (post_id, ref_type, ref_value, metadata) VALUES ($1, $2, $3, $4)',
          [post_id, ref_type, ref_value, JSON.stringify(metadata || {})]
        )
      } else {
        await q(
          'INSERT INTO assembly.post_supporting_refs (comment_id, ref_type, ref_value, metadata) VALUES ($1, $2, $3, $4)',
          [comment_id, ref_type, ref_value, JSON.stringify(metadata || {})]
        )
      }
      return response.status(201).json({ added: true })
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/bridges/supporting-refs/post/:postId */
  async supportingRefsByPost({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT id, ref_type, ref_value, metadata, created_at FROM assembly.post_supporting_refs WHERE post_id = $1 ORDER BY created_at DESC',
        [request.params().postId]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/bridges/supporting-refs/comment/:commentId */
  async supportingRefsByComment({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        'SELECT id, ref_type, ref_value, metadata, created_at FROM assembly.post_supporting_refs WHERE comment_id = $1 ORDER BY created_at DESC',
        [request.params().commentId]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  // ── DUALITY: Session Watches ───────────────────────────────────────

  /** POST /api/duality/watches */
  async createWatch({ request, response }: HttpContext) {
    try {
      const { threadId, forumSlug, role, executionBackend, maxTurns, idleTimeoutMs, leaseId } = request.body()
      if (!threadId || !forumSlug || !role) {
        return response.status(400).json({ error: 'threadId, forumSlug, and role are required' })
      }
      if (leaseId !== undefined && leaseId !== null
          && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(leaseId))) {
        return response.status(400).json({ error: 'leaseId must be a UUID' })
      }
      const { rows } = await q(
        `INSERT INTO duality.session_watches
           (thread_id, forum_slug, role, execution_backend, max_turns, idle_timeout_ms,
            lease_id, turn_count, status, last_activity, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'active', now(), now(), now())
         ON CONFLICT (thread_id, role) DO UPDATE SET
           status = 'active',
           execution_backend = EXCLUDED.execution_backend,
           max_turns = EXCLUDED.max_turns,
           idle_timeout_ms = EXCLUDED.idle_timeout_ms,
           lease_id = COALESCE(EXCLUDED.lease_id, duality.session_watches.lease_id),
           turn_count = 0,
           last_activity = now(),
           updated_at = now()
         RETURNING id`,
        [
          threadId,
          forumSlug,
          role,
          executionBackend || 'freebuff',
          maxTurns ?? 20,
          idleTimeoutMs ?? 300_000,
          leaseId ?? null,
        ]
      )
      return response.status(201).json(rows[0])
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/duality/watches/active */
  async activeWatch({ request, response }: HttpContext) {
    try {
      const { role, forumSlug, execution_backend } = request.qs()
      if (!role || !forumSlug) {
        return response.status(400).json({ error: 'role and forumSlug query params are required' })
      }
      const params: any[] = [role, forumSlug]
      let backendClause = ''
      if (execution_backend) {
        params.push(String(execution_backend))
        backendClause = ` AND execution_backend = $${params.length}`
      }
      const { rows } = await q(
        `SELECT thread_id, role, execution_backend, status, last_activity
         FROM duality.session_watches
         WHERE role = $1 AND forum_slug = $2${backendClause}
         ORDER BY last_activity DESC
         LIMIT 1`,
        params
      )
      if (rows.length === 0) return { threadId: null }
      const threadCheck = await q('SELECT id FROM assembly.posts WHERE id = $1', [rows[0].thread_id])
      if (threadCheck.rows.length === 0) return { threadId: null }
      const row = rows[0]
      return {
        threadId: row.thread_id,
        role: row.role,
        status: row.status,
        execution_backend: row.execution_backend,
      }
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }

  /** GET /api/duality/watches/:threadId */
  async threadWatches({ request, response }: HttpContext) {
    try {
      const { rows } = await q(
        `SELECT id, thread_id, forum_slug, role, execution_backend, max_turns,
                turn_count, idle_timeout_ms, status, last_activity, created_at
         FROM duality.session_watches
         WHERE thread_id = $1 AND status = 'active'
         ORDER BY created_at DESC`,
        [request.params().threadId]
      )
      return rows
    } catch (err: any) {
      return response.status(500).json({ error: err.message })
    }
  }
}
