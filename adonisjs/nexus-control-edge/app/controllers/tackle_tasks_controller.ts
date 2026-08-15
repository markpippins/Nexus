/**
 * tackle-srv re-homing (Wave 3.5) — tasks + prompts domain.
 *
 * Ported from nexus/typescript/tackle-srv/src/routes/{tasks,prompts}.ts.
 * Runs on the `tackle` named connection (search_path=tackle,public).
 */

import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'

const CONN = 'tackle'

export default class TackleTasksController {
  // ── tasks ──────────────────────────────────────────────────────
  // GET /tasks/inspector/dispatch — resolve the dispatch payload for the
  // inspector role with full prompt bodies.
  async inspectorDispatch(_ctx: HttpContext) {
    const tasks = await q(
      `SELECT id, role, task_slug, scope, acceptance_criteria,
              prompt_id, active, created_at, updated_at
       FROM tasks
       WHERE role = $1 AND active = TRUE
       ORDER BY task_slug`,
      ['inspector'],
      CONN
    )
    const enriched = await Promise.all(
      tasks.rows.map(async (t: any) => {
        const prompt = await q(
          `SELECT DISTINCT ON (role, slug)
                  id, role, slug, version, title, body_md,
                  parameter_schema, tags, created_at, updated_at
           FROM prompts
           WHERE role = (SELECT role FROM prompts WHERE id = $1)
             AND slug = (SELECT slug FROM prompts WHERE id = $1)
           ORDER BY role, slug, version DESC`,
          [t.prompt_id],
          CONN
        )
        const p = prompt.rows[0]
        return {
          ...t,
          prompt_role: p?.role ?? null,
          prompt_slug: p?.slug ?? null,
          prompt_version: p?.version ?? null,
          prompt_body_md: p?.body_md ?? null,
          prompt_title: p?.title ?? null,
          prompt_parameter_schema: p?.parameter_schema ?? null,
          prompt_tags: p?.tags ?? null,
        }
      })
    )
    return { tasks: enriched }
  }

  // GET /tasks — list tasks (?role=, ?all=true)
  async listTasks({ request, response }: HttpContext) {
    const { role, all } = request.qs()
    const conditions: string[] = []
    const vals: any[] = []
    let idx = 1
    if (all !== 'true') conditions.push('active = TRUE')
    if (role) {
      conditions.push(`role = $${idx++}`)
      vals.push(role)
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
    const r = await q(
      `SELECT id, role, task_slug, scope, acceptance_criteria,
              prompt_id, active, created_at, updated_at
       FROM tasks
       ${where}
       ORDER BY role, task_slug`,
      vals,
      CONN
    )
    return response.json({ count: r.rows.length, tasks: r.rows })
  }

  // GET /tasks/:task_slug — fetch one task with joined prompt reference
  async getTask({ params, response }: HttpContext) {
    const r = await q(
      `SELECT t.id, t.role, t.task_slug, t.scope, t.acceptance_criteria,
              t.prompt_id, t.active, t.created_at, t.updated_at,
              p.role AS prompt_role,
              p.slug AS prompt_slug,
              p.version AS prompt_version
       FROM tasks t
       LEFT JOIN prompts p ON p.id = t.prompt_id
       WHERE t.task_slug = $1
       ORDER BY t.active DESC, t.updated_at DESC
       LIMIT 1`,
      [params.task_slug],
      CONN
    )
    if (r.rows.length === 0) return response.status(404).json({ error: 'Task not found' })
    return response.json(r.rows[0])
  }

  // POST /tasks — upsert task
  async createTask({ request, response }: HttpContext) {
    const { role, task_slug, scope, acceptance_criteria, prompt_id, active } = request.all()
    if (!role || !task_slug || !prompt_id) {
      return response.status(400).json({ error: 'role, task_slug, and prompt_id are required' })
    }
    const r = await q(
      `INSERT INTO tasks (role, task_slug, scope, acceptance_criteria, prompt_id, active)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (role, task_slug) DO UPDATE
       SET scope = EXCLUDED.scope, acceptance_criteria = EXCLUDED.acceptance_criteria,
           prompt_id = EXCLUDED.prompt_id, active = EXCLUDED.active, updated_at = NOW()
       RETURNING *`,
      [role, task_slug, scope || '', acceptance_criteria || [], prompt_id, active !== false],
      CONN
    )
    return response.json({ saved: true, task: r.rows[0] })
  }

  // DELETE /tasks/:task_slug — delete by slug (optionally scoped by role)
  async deleteTask({ params, request, response }: HttpContext) {
    const { role } = request.qs()
    if (role) {
      await q(
        'UPDATE agent_scheduler SET task_slug = NULL WHERE task_slug = $1 AND role = $2',
        [params.task_slug, role],
        CONN
      )
    } else {
      await q('UPDATE agent_scheduler SET task_slug = NULL WHERE task_slug = $1', [params.task_slug], CONN)
    }
    const vals: any[] = [params.task_slug]
    let where = 'task_slug = $1'
    if (role) {
      vals.push(role)
      where += ' AND role = $2'
    }
    const r = await q(`DELETE FROM tasks WHERE ${where}`, vals, CONN)
    if (r.rowCount === 0) return response.status(404).json({ error: 'Task not found' })
    return response.json({ deleted: true, task_slug: params.task_slug, role: role ?? null })
  }

  // ── prompts ────────────────────────────────────────────────────
  // GET /prompts — list all prompts (?role=)
  async listPrompts({ request, response }: HttpContext) {
    const { role } = request.qs()
    const r = role
      ? await q(
          `SELECT id, role, slug, version, title, body_md, parameter_schema, tags, created_at, updated_at
           FROM prompts WHERE role = $1 ORDER BY role, slug, version DESC`,
          [role],
          CONN
        )
      : await q(
          `SELECT id, role, slug, version, title, body_md, parameter_schema, tags, created_at, updated_at
           FROM prompts ORDER BY role, slug, version DESC`,
          [],
          CONN
        )
    return response.json({ count: r.rows.length, prompts: r.rows })
  }

  // POST /prompts — upsert prompt
  async createPrompt({ request, response }: HttpContext) {
    const { id, role, slug, version, title, body_md, parameter_schema, tags } = request.all()
    if (!role || !slug || !title || !body_md) {
      return response.status(400).json({ error: 'role, slug, title, and body_md are required' })
    }
    // Resolve next version when not provided
    let nextVersion = version
    if (nextVersion === undefined) {
      const latest = await q(
        'SELECT version FROM prompts WHERE role = $1 AND slug = $2 ORDER BY version DESC LIMIT 1',
        [role, slug],
        CONN
      )
      nextVersion = latest.rows.length > 0 ? latest.rows[0].version + 1 : 1
    }
    const now = new Date().toISOString()
    const r = await q(
      `INSERT INTO prompts (id, role, slug, version, title, body_md, parameter_schema, tags, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT (id) DO UPDATE SET
         role = EXCLUDED.role, slug = EXCLUDED.slug, version = EXCLUDED.version,
         title = EXCLUDED.title, body_md = EXCLUDED.body_md,
         parameter_schema = EXCLUDED.parameter_schema, tags = EXCLUDED.tags,
         updated_at = EXCLUDED.updated_at
       RETURNING *`,
      [id ?? `prompt-${now}-${Math.random().toString(36).slice(2, 8)}`, role, slug, nextVersion, title, body_md,
       parameter_schema ?? {}, tags ?? [], now],
      CONN
    )
    return response.json({ saved: true, ...r.rows[0] })
  }

  // GET /prompts/:role — list prompts for a role (tackle-srv shape {count, prompts})
  async listRolePrompts({ params }: HttpContext) {
    const r = await q(
      `SELECT id, role, slug, version, title, body_md, parameter_schema, tags, created_at, updated_at
       FROM prompts WHERE role = $1 ORDER BY role, slug, version DESC`,
      [params.role],
      CONN
    )
    return { count: r.rows.length, prompts: r.rows }
  }

  // GET /prompts/:role/:slug — single prompt by role+slug
  async getRolePrompt({ params, response }: HttpContext) {
    const r = await q(
      `SELECT id, role, slug, version, title, body_md, parameter_schema, tags, created_at, updated_at
       FROM prompts WHERE role = $1 AND slug = $2
       ORDER BY version DESC LIMIT 1`,
      [params.role, params.slug],
      CONN
    )
    if (r.rows.length === 0) return response.status(404).json({ error: 'Prompt not found' })
    return response.json(r.rows[0])
  }
}
