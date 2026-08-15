/**
 * wind-srv re-homing (Wave 3.4) — workflow-definition domain.
 *
 * Ported from nexus/typescript/wind-srv/src/routes/
 * {workflows,versions,nodes,edges,tasks,outcomes}.js. All queries are
 * explicitly `wind.*`-qualified; $n placeholders via the q() helper.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'

export default class WindWorkflowController {
  // ── workflows ─────────────────────────────────────────────────────────

  // List all workflows
  async listWorkflows(_ctx: HttpContext) {
    const result = await q(`
      SELECT w.id, w.name, w.description, w.created_at,
             (SELECT COUNT(*) FROM wind.workflow_versions v WHERE v.workflow_id = w.id) AS version_count,
             (SELECT v2.version_number FROM wind.workflow_versions v2
              WHERE v2.workflow_id = w.id AND v2.is_active = true LIMIT 1) AS active_version
      FROM wind.workflows w
      ORDER BY w.name
    `)
    return result.rows
  }

  // Get workflow by ID (with versions)
  async getWorkflow({ params, response }: HttpContext) {
    const wfResult = await q('SELECT id, name, description, created_at FROM wind.workflows WHERE id = $1', [params.id])
    if (wfResult.rows.length === 0) return response.status(404).json({ error: 'Workflow not found' })

    const versionsResult = await q(
      'SELECT id, workflow_id, version_number, is_active, created_at FROM wind.workflow_versions WHERE workflow_id = $1 ORDER BY version_number',
      [params.id]
    )

    return response.json({ ...wfResult.rows[0], versions: versionsResult.rows })
  }

  // Create workflow
  async createWorkflow({ request, response }: HttpContext) {
    const { name, description } = request.all()
    if (!name) return response.status(400).json({ error: 'name is required' })
    const result = await q(
      'INSERT INTO wind.workflows (name, description) VALUES ($1, $2) RETURNING id, name, description, created_at',
      [name, description || null]
    )
    return response.status(201).json(result.rows[0])
  }

  // Update workflow
  async updateWorkflow({ params, request, response }: HttpContext) {
    const { name, description } = request.all()
    const sets: string[] = []
    const vals: any[] = []
    let idx = 1
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name) }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description) }
    if (sets.length === 0) {
      const r = await q('SELECT id, name, description, created_at FROM wind.workflows WHERE id = $1', [params.id])
      if (r.rows.length === 0) return response.status(404).json({ error: 'Workflow not found' })
      return response.json(r.rows[0])
    }
    vals.push(params.id)
    const result = await q(
      `UPDATE wind.workflows SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, name, description, created_at`,
      vals
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Workflow not found' })
    return response.json(result.rows[0])
  }

  // Delete workflow
  async deleteWorkflow({ params, response }: HttpContext) {
    const result = await q('DELETE FROM wind.workflows WHERE id = $1 RETURNING id, name', [params.id])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Workflow not found' })
    return response.json({ deleted: true, id: result.rows[0].id, name: result.rows[0].name })
  }

  // ── versions ──────────────────────────────────────────────────────────

  // List versions for a workflow
  async listVersions({ request, response }: HttpContext) {
    const { workflow_id } = request.qs()
    if (!workflow_id) return response.status(400).json({ error: 'workflow_id query parameter is required' })
    const result = await q(
      'SELECT id, workflow_id, version_number, is_active, created_at FROM wind.workflow_versions WHERE workflow_id = $1 ORDER BY version_number',
      [workflow_id]
    )
    return response.json(result.rows)
  }

  // Get version by ID (with nodes and edges)
  async getVersion({ params, response }: HttpContext) {
    const verResult = await q(
      'SELECT id, workflow_id, version_number, is_active, created_at FROM wind.workflow_versions WHERE id = $1',
      [params.id]
    )
    if (verResult.rows.length === 0) return response.status(404).json({ error: 'Version not found' })

    const nodesResult = await q(
      `SELECT n.id, n.workflow_version_id, n.task_id, n.name, n.is_entrypoint, n.is_terminal, n.created_at,
              t.name AS task_name
       FROM wind.workflow_nodes n
       JOIN wind.tasks t ON n.task_id = t.id
       WHERE n.workflow_version_id = $1
       ORDER BY n.name`,
      [params.id]
    )

    const edgesResult = await q(
      `SELECT e.id, e.workflow_version_id, e.from_node_id, e.from_task_id, e.outcome_id, e.to_node_id, e.created_at,
              nf.name AS from_node_name, nt.name AS to_node_name, o.code AS outcome_code
       FROM wind.workflow_edges e
       JOIN wind.workflow_nodes nf ON e.from_node_id = nf.id
       JOIN wind.workflow_nodes nt ON e.to_node_id = nt.id
       JOIN wind.task_outcomes o ON e.outcome_id = o.id
       WHERE e.workflow_version_id = $1
       ORDER BY nf.name, o.code`,
      [params.id]
    )

    return response.json({ ...verResult.rows[0], nodes: nodesResult.rows, edges: edgesResult.rows })
  }

  // Create version (auto-increments version_number)
  async createVersion({ request, response }: HttpContext) {
    const { workflow_id } = request.all()
    if (!workflow_id) return response.status(400).json({ error: 'workflow_id is required' })

    const maxResult = await q(
      'SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM wind.workflow_versions WHERE workflow_id = $1',
      [workflow_id]
    )
    const nextVer = maxResult.rows[0].max_ver + 1

    const result = await q(
      'INSERT INTO wind.workflow_versions (workflow_id, version_number) VALUES ($1, $2) RETURNING id, workflow_id, version_number, is_active, created_at',
      [workflow_id, nextVer]
    )
    return response.status(201).json(result.rows[0])
  }

  // Activate a version (deactivate all others for that workflow)
  async activateVersion({ params, response }: HttpContext) {
    const verResult = await q('SELECT id, workflow_id FROM wind.workflow_versions WHERE id = $1', [params.id])
    if (verResult.rows.length === 0) return response.status(404).json({ error: 'Version not found' })

    const wfId = verResult.rows[0].workflow_id

    await q('UPDATE wind.workflow_versions SET is_active = false WHERE workflow_id = $1', [wfId])

    const result = await q(
      'UPDATE wind.workflow_versions SET is_active = true WHERE id = $1 RETURNING id, workflow_id, version_number, is_active, created_at',
      [params.id]
    )
    return response.json(result.rows[0])
  }

  // Delete version
  async deleteVersion({ params, response }: HttpContext) {
    const result = await q(
      'DELETE FROM wind.workflow_versions WHERE id = $1 RETURNING id, version_number',
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Version not found' })
    return response.json({ deleted: true, id: result.rows[0].id, version_number: result.rows[0].version_number })
  }

  // ── nodes ─────────────────────────────────────────────────────────────

  // List nodes for a version
  async listNodes({ request, response }: HttpContext) {
    const { version_id } = request.qs()
    if (!version_id) return response.status(400).json({ error: 'version_id query parameter is required' })
    const result = await q(
      `SELECT n.id, n.workflow_version_id, n.task_id, n.name, n.is_entrypoint, n.is_terminal, n.created_at,
              t.name AS task_name
       FROM wind.workflow_nodes n
       JOIN wind.tasks t ON n.task_id = t.id
       WHERE n.workflow_version_id = $1
       ORDER BY n.name`,
      [version_id]
    )
    return response.json(result.rows)
  }

  // Get node by ID
  async getNode({ params, response }: HttpContext) {
    const result = await q(
      `SELECT n.id, n.workflow_version_id, n.task_id, n.name, n.is_entrypoint, n.is_terminal, n.created_at,
              t.name AS task_name, t.input_spec
       FROM wind.workflow_nodes n
       JOIN wind.tasks t ON n.task_id = t.id
       WHERE n.id = $1`,
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Node not found' })
    return response.json(result.rows[0])
  }

  // Create node
  async createNode({ request, response }: HttpContext) {
    const { workflow_version_id, task_id, name, is_entrypoint, is_terminal } = request.all()
    if (!workflow_version_id || !task_id || !name) {
      return response.status(400).json({ error: 'workflow_version_id, task_id, and name are required' })
    }
    const result = await q(
      `INSERT INTO wind.workflow_nodes (workflow_version_id, task_id, name, is_entrypoint, is_terminal)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, workflow_version_id, task_id, name, is_entrypoint, is_terminal, created_at`,
      [workflow_version_id, task_id, name, is_entrypoint || false, is_terminal || false]
    )
    return response.status(201).json(result.rows[0])
  }

  // Update node
  async updateNode({ params, request, response }: HttpContext) {
    const { name, is_entrypoint, is_terminal } = request.all()
    const sets: string[] = []
    const vals: any[] = []
    let idx = 1
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name) }
    if (is_entrypoint !== undefined) { sets.push(`is_entrypoint = $${idx++}`); vals.push(is_entrypoint) }
    if (is_terminal !== undefined) { sets.push(`is_terminal = $${idx++}`); vals.push(is_terminal) }
    if (sets.length === 0) {
      const r = await q('SELECT id, name, is_entrypoint, is_terminal FROM wind.workflow_nodes WHERE id = $1', [params.id])
      if (r.rows.length === 0) return response.status(404).json({ error: 'Node not found' })
      return response.json(r.rows[0])
    }
    vals.push(params.id)
    const result = await q(
      `UPDATE wind.workflow_nodes SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, workflow_version_id, task_id, name, is_entrypoint, is_terminal, created_at`,
      vals
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Node not found' })
    return response.json(result.rows[0])
  }

  // Delete node
  async deleteNode({ params, response }: HttpContext) {
    const result = await q('DELETE FROM wind.workflow_nodes WHERE id = $1 RETURNING id, name', [params.id])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Node not found' })
    return response.json({ deleted: true, id: result.rows[0].id, name: result.rows[0].name })
  }

  // ── edges ─────────────────────────────────────────────────────────────

  // List edges for a version
  async listEdges({ request, response }: HttpContext) {
    const { version_id } = request.qs()
    if (!version_id) return response.status(400).json({ error: 'version_id query parameter is required' })
    const result = await q(
      `SELECT e.id, e.workflow_version_id, e.from_node_id, e.from_task_id, e.outcome_id, e.to_node_id, e.created_at,
              nf.name AS from_node_name, nt.name AS to_node_name, o.code AS outcome_code
       FROM wind.workflow_edges e
       JOIN wind.workflow_nodes nf ON e.from_node_id = nf.id
       JOIN wind.workflow_nodes nt ON e.to_node_id = nt.id
       JOIN wind.task_outcomes o ON e.outcome_id = o.id
       WHERE e.workflow_version_id = $1
       ORDER BY nf.name, o.code`,
      [version_id]
    )
    return response.json(result.rows)
  }

  // Create edge
  async createEdge({ request, response }: HttpContext) {
    const { workflow_version_id, from_node_id, from_task_id, outcome_id, to_node_id } = request.all()
    if (!workflow_version_id || !from_node_id || !from_task_id || !outcome_id || !to_node_id) {
      return response.status(400).json({ error: 'workflow_version_id, from_node_id, from_task_id, outcome_id, and to_node_id are required' })
    }
    const result = await q(
      `INSERT INTO wind.workflow_edges (workflow_version_id, from_node_id, from_task_id, outcome_id, to_node_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, workflow_version_id, from_node_id, from_task_id, outcome_id, to_node_id, created_at`,
      [workflow_version_id, from_node_id, from_task_id, outcome_id, to_node_id]
    )
    return response.status(201).json(result.rows[0])
  }

  // Delete edge
  async deleteEdge({ params, response }: HttpContext) {
    const result = await q('DELETE FROM wind.workflow_edges WHERE id = $1 RETURNING id', [params.id])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Edge not found' })
    return response.json({ deleted: true, id: result.rows[0].id })
  }

  // ── tasks ─────────────────────────────────────────────────────────────

  // List tasks (optionally filter by office)
  async listTasks({ request, response }: HttpContext) {
    const { office_id } = request.qs()
    let sql = `
      SELECT t.id, t.office_id, t.title_id, t.tackle_task_id, t.name, t.description, t.input_spec, t.created_at,
             o.name AS office_name, ti.display_name AS title_name
      FROM wind.tasks t
      JOIN wind.offices o ON t.office_id = o.id
      JOIN wind.titles ti ON t.title_id = ti.id
    `
    const vals: any[] = []
    if (office_id) {
      sql += ' WHERE t.office_id = $1'
      vals.push(office_id)
    }
    sql += ' ORDER BY o.name, t.name'
    const result = await q(sql, vals)
    return response.json(result.rows)
  }

  // Get task by ID (with outcomes)
  async getTask({ params, response }: HttpContext) {
    const taskResult = await q(
      `SELECT t.id, t.office_id, t.title_id, t.tackle_task_id, t.name, t.description, t.input_spec, t.created_at,
             o.name AS office_name, ti.display_name AS title_name
       FROM wind.tasks t
       JOIN wind.offices o ON t.office_id = o.id
       JOIN wind.titles ti ON t.title_id = ti.id
       WHERE t.id = $1`,
      [params.id]
    )
    if (taskResult.rows.length === 0) return response.status(404).json({ error: 'Task not found' })

    const outcomesResult = await q(
      'SELECT id, code, description, output_spec, created_at FROM wind.task_outcomes WHERE task_id = $1 ORDER BY code',
      [params.id]
    )

    return response.json({ ...taskResult.rows[0], outcomes: outcomesResult.rows })
  }

  // Create task
  async createTask({ request, response }: HttpContext) {
    const { office_id, title_id, tackle_task_id, name, description, input_spec } = request.all()
    if (!office_id || !title_id || !name) {
      return response.status(400).json({ error: 'office_id, title_id, and name are required' })
    }
    const result = await q(
      `INSERT INTO wind.tasks (office_id, title_id, tackle_task_id, name, description, input_spec)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, office_id, title_id, tackle_task_id, name, description, input_spec, created_at`,
      [office_id, title_id, tackle_task_id || null, name, description || null, input_spec || {}]
    )
    return response.status(201).json(result.rows[0])
  }

  // Update task
  async updateTask({ params, request, response }: HttpContext) {
    const { name, description, input_spec, tackle_task_id } = request.all()
    const sets: string[] = []
    const vals: any[] = []
    let idx = 1
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name) }
    if (description !== undefined) { sets.push(`description = $${idx++}`); vals.push(description) }
    if (input_spec !== undefined) { sets.push(`input_spec = $${idx++}`); vals.push(input_spec) }
    if (tackle_task_id !== undefined) { sets.push(`tackle_task_id = $${idx++}`); vals.push(tackle_task_id) }
    if (sets.length === 0) {
      const r = await q('SELECT id, name, description, input_spec, tackle_task_id, created_at FROM wind.tasks WHERE id = $1', [params.id])
      if (r.rows.length === 0) return response.status(404).json({ error: 'Task not found' })
      return response.json(r.rows[0])
    }
    vals.push(params.id)
    const result = await q(
      `UPDATE wind.tasks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING id, office_id, title_id, tackle_task_id, name, description, input_spec, created_at`,
      vals
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Task not found' })
    return response.json(result.rows[0])
  }

  // Delete task
  async deleteTask({ params, response }: HttpContext) {
    const result = await q('DELETE FROM wind.tasks WHERE id = $1 RETURNING id, name', [params.id])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Task not found' })
    return response.json({ deleted: true, id: result.rows[0].id, name: result.rows[0].name })
  }

  // ── outcomes ──────────────────────────────────────────────────────────

  // List outcomes for a task
  async listOutcomes({ request, response }: HttpContext) {
    const { task_id } = request.qs()
    if (!task_id) return response.status(400).json({ error: 'task_id query parameter is required' })
    const result = await q(
      'SELECT id, task_id, code, description, output_spec, created_at FROM wind.task_outcomes WHERE task_id = $1 ORDER BY code',
      [task_id]
    )
    return response.json(result.rows)
  }

  // Get outcome by ID
  async getOutcome({ params, response }: HttpContext) {
    const result = await q(
      'SELECT id, task_id, code, description, output_spec, created_at FROM wind.task_outcomes WHERE id = $1',
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Outcome not found' })
    return response.json(result.rows[0])
  }

  // Create outcome
  async createOutcome({ request, response }: HttpContext) {
    const { task_id, code, description, output_spec } = request.all()
    if (!task_id || !code) return response.status(400).json({ error: 'task_id and code are required' })
    const result = await q(
      `INSERT INTO wind.task_outcomes (task_id, code, description, output_spec)
       VALUES ($1, $2, $3, $4)
       RETURNING id, task_id, code, description, output_spec, created_at`,
      [task_id, code, description || null, output_spec || {}]
    )
    return response.status(201).json(result.rows[0])
  }

  // Delete outcome
  async deleteOutcome({ params, response }: HttpContext) {
    const result = await q('DELETE FROM wind.task_outcomes WHERE id = $1 RETURNING id, code', [params.id])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Outcome not found' })
    return response.json({ deleted: true, id: result.rows[0].id, code: result.rows[0].code })
  }
}
