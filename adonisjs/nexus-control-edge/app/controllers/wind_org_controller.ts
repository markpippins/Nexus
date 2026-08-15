/**
 * wind-srv re-homing (Wave 3.4) — org domain.
 *
 * Ported from nexus/typescript/wind-srv/src/routes/{offices,titles,v-roles}.js.
 * All queries are explicitly `wind.*`-qualified so they run on the default
 * `pg` connection (search_path=knowledge,public) exactly as upstream.
 * $n placeholders are converted to knex ? via the q() helper.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'

// ── offices ────────────────────────────────────────────────────────────
export default class WindOrgController {
  // List all offices
  async listOffices({ response }: HttpContext) {
    const result = await q('SELECT id, name, description, created_at FROM wind.offices ORDER BY name')
    return response.json(result.rows)
  }

  // Get office by ID
  async getOffice({ params, response }: HttpContext) {
    const result = await q('SELECT id, name, description, created_at FROM wind.offices WHERE id = $1', [params.id])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Office not found' })
    return response.json(result.rows[0])
  }

  // Create office
  async createOffice({ request, response }: HttpContext) {
    const body = request.all()
    const { name, description } = body
    if (!name) return response.status(400).json({ error: 'name is required' })
    const result = await q(
      'INSERT INTO wind.offices (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
      [name, description || null]
    )
    return response.status(201).json(result.rows[0])
  }

  // Update office
  async updateOffice({ params, request, response }: HttpContext) {
    const body = request.all()
    const { name, description } = body
    const sets: string[] = []
    const vals: any[] = []
    let idx = 1
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name) }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description) }
    if (sets.length === 0) {
      const r = await q('SELECT id, name, description, created_at FROM wind.offices WHERE id = $1', [params.id])
      if (r.rows.length === 0) return response.status(404).json({ error: 'Office not found' })
      return response.json(r.rows[0])
    }
    vals.push(params.id)
    const result = await q(
      `UPDATE wind.offices SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, description, created_at`,
      vals
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Office not found' })
    return response.json(result.rows[0])
  }

  // Delete office (cascade deletes titles, tasks, outcomes)
  async deleteOffice({ params, response }: HttpContext) {
    const result = await q('DELETE FROM wind.offices WHERE id = $1 RETURNING id, name', [params.id])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Office not found' })
    return response.json({ deleted: true, id: result.rows[0].id, name: result.rows[0].name })
  }

  // ── titles ────────────────────────────────────────────────────────────

  // List titles (optionally filter by office)
  async listTitles({ request, response }: HttpContext) {
    const { office_id } = request.qs()
    let sql = `
      SELECT t.id, t.office_id, t.role_id, t.display_name, t.created_at,
             o.name AS office_name, r.name AS role_name
      FROM wind.titles t
      JOIN wind.offices o ON t.office_id = o.id
      JOIN nebula.roles r ON t.role_id = r.id
    `
    const vals: any[] = []
    if (office_id) {
      sql += ' WHERE t.office_id = $1'
      vals.push(office_id)
    }
    sql += ' ORDER BY o.name, t.display_name'
    const result = await q(sql, vals)
    return response.json(result.rows)
  }

  // Get title by ID
  async getTitle({ params, response }: HttpContext) {
    const result = await q(
      `SELECT t.id, t.office_id, t.role_id, t.display_name, t.created_at,
             o.name AS office_name, r.name AS role_name
       FROM wind.titles t
       JOIN wind.offices o ON t.office_id = o.id
       JOIN nebula.roles r ON t.role_id = r.id
       WHERE t.id = $1`,
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Title not found' })
    return response.json(result.rows[0])
  }

  // Create title
  async createTitle({ request, response }: HttpContext) {
    const { office_id, role_id, display_name } = request.all()
    if (!office_id || !role_id || !display_name) {
      return response.status(400).json({ error: 'office_id, role_id, and display_name are required' })
    }
    const office = await q('SELECT id FROM wind.offices WHERE id = $1', [office_id])
    if (office.rows.length === 0) return response.status(404).json({ error: 'Office not found' })
    const role = await q('SELECT id FROM nebula.roles WHERE id = $1', [role_id])
    if (role.rows.length === 0) return response.status(404).json({ error: 'Role not found' })

    const result = await q(
      'INSERT INTO wind.titles (office_id, role_id, display_name) VALUES ($1, $2, $3) RETURNING id, office_id, role_id, display_name, created_at',
      [office_id, role_id, display_name]
    )
    return response.status(201).json(result.rows[0])
  }

  // Update title
  async updateTitle({ params, request, response }: HttpContext) {
    const { role_id, display_name } = request.all()
    const sets: string[] = []
    const vals: any[] = []
    let idx = 1
    if (role_id !== undefined) { sets.push(`role_id = $${idx++}`); vals.push(role_id) }
    if (display_name !== undefined) { sets.push(`display_name = $${idx++}`); vals.push(display_name) }
    if (sets.length === 0) {
      const r = await q('SELECT id, office_id, role_id, display_name, created_at FROM wind.titles WHERE id = $1', [params.id])
      if (r.rows.length === 0) return response.status(404).json({ error: 'Title not found' })
      return response.json(r.rows[0])
    }
    vals.push(params.id)
    const result = await q(
      `UPDATE wind.titles SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, office_id, role_id, display_name, created_at`,
      vals
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Title not found' })
    return response.json(result.rows[0])
  }

  // Delete title
  async deleteTitle({ params, response }: HttpContext) {
    const result = await q('DELETE FROM wind.titles WHERE id = $1 RETURNING id, display_name', [params.id])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Title not found' })
    return response.json({ deleted: true, id: result.rows[0].id, display_name: result.rows[0].display_name })
  }

  // ── v-roles ───────────────────────────────────────────────────────────

  // List roles (from nebula.roles via wind.v_roles view)
  async listVRoles(_ctx: HttpContext) {
    const result = await q(
      'SELECT id, name, display_name, description, owns_domains, can_greenlight, can_create_questions, can_create_agendas, can_resolve_questions, can_verify_work_requests, max_open_questions, requires_approval_from, cron_enabled, cron_expression, cron_description, escalates_to, escalation_triggers, level_filter_primary, level_filter_allowed, visibility_scope, created_at, updated_at FROM wind.v_roles ORDER BY name'
    )
    return result.rows
  }

  // Get role by name
  async getVRole({ params, response }: HttpContext) {
    const result = await q(
      'SELECT id, name, display_name, description, owns_domains, can_greenlight, can_create_questions, can_create_agendas, can_resolve_questions, can_verify_work_requests, max_open_questions, requires_approval_from, cron_enabled, cron_expression, cron_description, escalates_to, escalation_triggers, level_filter_primary, level_filter_allowed, visibility_scope, created_at, updated_at FROM wind.v_roles WHERE name = $1',
      [params.name]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Role not found' })
    return response.json(result.rows[0])
  }
}
