/**
 * wind-srv re-homing (Wave 3.4) — execution domain.
 *
 * Ported from nexus/typescript/wind-srv/src/routes/
 * {instances,tickets,receipts,validate}.js. Includes the harness-srv
 * integration (POST /run) for ticket execution and the full auto-run
 * loop. All queries are explicitly `wind.*`-qualified.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'

const HARNESS_URL = process.env.HARNESS_URL || 'http://127.0.0.1:3420'
const HARNESS_WORK_DIR = process.env.HARNESS_WORK_DIR || '/home/codex/dev'

/**
 * Call harness-srv to execute a task.
 * Returns the harness result (exit_code, stdout, stderr, role, task).
 */
async function callHarness(windTaskId: string | number, overrides: Record<string, any> = {}) {
  const resp = await fetch(`${HARNESS_URL}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ wind_task_id: windTaskId, ...overrides }),
  })
  if (!resp.ok) {
    const body = await resp.text()
    throw new Error(`Harness call failed (${resp.status}): ${body}`)
  }
  return resp.json() as Promise<any>
}

export default class WindExecutionController {
  // ── instances ─────────────────────────────────────────────────────────

  // List instances (optionally filter by status or workflow_id)
  async listInstances({ request, response }: HttpContext) {
    const { status, workflow_id } = request.qs()
    let sql = `
      SELECT wi.id, wi.workflow_version_id, wi.status, wi.created_at, wi.updated_at,
             w.name AS workflow_name, wv.version_number
      FROM wind.workflow_instances wi
      JOIN wind.workflow_versions wv ON wi.workflow_version_id = wv.id
      JOIN wind.workflows w ON wv.workflow_id = w.id
    `
    const conditions: string[] = []
    const vals: any[] = []
    let idx = 1
    if (status) { conditions.push(`wi.status = $${idx++}`); vals.push(status) }
    if (workflow_id) { conditions.push(`wv.workflow_id = $${idx++}`); vals.push(workflow_id) }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY wi.created_at DESC'
    const result = await q(sql, vals)
    return response.json(result.rows)
  }

  // Get instance by ID (with tickets)
  async getInstance({ params, response }: HttpContext) {
    const instResult = await q(
      `SELECT wi.id, wi.workflow_version_id, wi.status, wi.created_at, wi.updated_at,
             w.name AS workflow_name, wv.version_number
       FROM wind.workflow_instances wi
       JOIN wind.workflow_versions wv ON wi.workflow_version_id = wv.id
       JOIN wind.workflows w ON wv.workflow_id = w.id
       WHERE wi.id = $1`,
      [params.id]
    )
    if (instResult.rows.length === 0) return response.status(404).json({ error: 'Instance not found' })

    const ticketsResult = await q(
      `SELECT t.id, t.status, t.input_artifact_type, t.input_artifact_id, t.created_at, t.updated_at,
              n.name AS node_name, ti.display_name AS title_name
       FROM wind.tickets t
       JOIN wind.workflow_nodes n ON t.node_id = n.id
       JOIN wind.titles ti ON t.assigned_title_id = ti.id
       WHERE t.workflow_instance_id = $1
       ORDER BY t.created_at`,
      [params.id]
    )

    return response.json({ ...instResult.rows[0], tickets: ticketsResult.rows })
  }

  // Start a workflow instance (creates instance + tickets for entrypoint nodes)
  async startInstance({ request, response }: HttpContext) {
    const { workflow_version_id } = request.all()
    if (!workflow_version_id) return response.status(400).json({ error: 'workflow_version_id is required' })

    const verResult = await q('SELECT id, workflow_id FROM wind.workflow_versions WHERE id = $1', [workflow_version_id])
    if (verResult.rows.length === 0) return response.status(404).json({ error: 'Workflow version not found' })

    const instResult = await q(
      `INSERT INTO wind.workflow_instances (workflow_version_id, status)
       VALUES ($1, 'ACTIVE')
       RETURNING id, workflow_version_id, status, created_at, updated_at`,
      [workflow_version_id]
    )
    const instance = instResult.rows[0]

    const entryResult = await q(
      `SELECT id, task_id FROM wind.workflow_nodes
       WHERE workflow_version_id = $1 AND is_entrypoint = true`,
      [workflow_version_id]
    )

    if (entryResult.rows.length === 0) {
      await q(
        "UPDATE wind.workflow_instances SET status = 'FAILED', updated_at = clock_timestamp() WHERE id = $1",
        [instance.id]
      )
      return response.status(400).json({ error: 'No entrypoint node found in workflow version' })
    }

    const tickets = []
    for (const node of entryResult.rows) {
      const titleResult = await q('SELECT title_id FROM wind.tasks WHERE id = $1', [node.task_id])
      if (titleResult.rows.length === 0) continue

      const ticketResult = await q(
        `INSERT INTO wind.tickets
         (workflow_instance_id, workflow_version_id, node_id, node_task_id, assigned_title_id,
          input_artifact_type, input_artifact_id, status)
         VALUES ($1, $2, $3, $4, $5, 'workflow_start', $1, 'PENDING')
         RETURNING id, status, created_at`,
        [instance.id, workflow_version_id, node.id, node.task_id, titleResult.rows[0].title_id]
      )
      tickets.push(ticketResult.rows[0])
    }

    return response.status(201).json({ ...instance, tickets })
  }

  // Pause an instance
  async pauseInstance({ params, response }: HttpContext) {
    const result = await q(
      `UPDATE wind.workflow_instances
       SET status = 'PAUSED', updated_at = clock_timestamp()
       WHERE id = $1 AND status = 'ACTIVE'
       RETURNING id, status, updated_at`,
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Instance not found or not active' })
    return response.json(result.rows[0])
  }

  // Resume a paused instance
  async resumeInstance({ params, response }: HttpContext) {
    const result = await q(
      `UPDATE wind.workflow_instances
       SET status = 'ACTIVE', updated_at = clock_timestamp()
       WHERE id = $1 AND status = 'PAUSED'
       RETURNING id, status, updated_at`,
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Instance not found or not paused' })
    return response.json(result.rows[0])
  }

  // Stop (cancel) an instance
  async stopInstance({ params, response }: HttpContext) {
    const result = await q(
      `UPDATE wind.workflow_instances
       SET status = 'FAILED', updated_at = clock_timestamp()
       WHERE id = $1 AND status IN ('ACTIVE', 'PAUSED')
       RETURNING id, status, updated_at`,
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Instance not found or not stoppable' })
    return response.json(result.rows[0])
  }

  // Execute — run the harness for a ticket's task
  async executeInstance({ params, request, response }: HttpContext) {
    const { ticket_id, context } = request.all()
    if (!ticket_id) return response.status(400).json({ error: 'ticket_id is required' })

    const instResult = await q(
      "SELECT id, workflow_version_id FROM wind.workflow_instances WHERE id = $1 AND status = 'ACTIVE'",
      [params.id]
    )
    if (instResult.rows.length === 0) return response.status(404).json({ error: 'Instance not found or not active' })

    const ticketResult = await q(
      `SELECT t.id, t.node_id, t.node_task_id, t.status, t.input_artifact_id,
              n.name as node_name
       FROM wind.tickets t
       JOIN wind.workflow_nodes n ON t.node_id = n.id
       WHERE t.id = $1 AND t.workflow_instance_id = $2`,
      [ticket_id, params.id]
    )
    if (ticketResult.rows.length === 0) return response.status(404).json({ error: 'Ticket not found' })
    const ticket = ticketResult.rows[0]

    if (ticket.status !== 'PENDING') {
      return response.status(400).json({ error: `Ticket is ${ticket.status}, not PENDING` })
    }

    await q(
      "UPDATE wind.tickets SET status = 'IN_PROGRESS', updated_at = clock_timestamp() WHERE id = $1",
      [ticket_id]
    )

    const harnessResult = await callHarness(ticket.node_task_id, {
      context: context || {},
      work_dir: HARNESS_WORK_DIR,
    })

    return response.json({
      ticket_id,
      node_name: ticket.node_name,
      harness: {
        job_id: harnessResult.job_id,
        role: harnessResult.role,
        exit_code: harnessResult.exit_code,
        stdout: harnessResult.stdout,
        stderr: harnessResult.stderr,
        duration_ms: harnessResult.duration_ms,
      },
      outcome: harnessResult.outcome,
      outcomes: harnessResult.outcomes || [],
    })
  }

  // Advance — complete a ticket with an outcome, create next tickets
  async advanceInstance({ params, request, response }: HttpContext) {
    const { ticket_id, outcome_id } = request.all()
    if (!ticket_id || !outcome_id) return response.status(400).json({ error: 'ticket_id and outcome_id are required' })

    const instResult = await q(
      "SELECT id, workflow_version_id, status FROM wind.workflow_instances WHERE id = $1 AND status = 'ACTIVE'",
      [params.id]
    )
    if (instResult.rows.length === 0) return response.status(404).json({ error: 'Instance not found or not active' })
    const instance = instResult.rows[0]

    const ticketResult = await q(
      `SELECT id, node_id, node_task_id, status
       FROM wind.tickets
       WHERE id = $1 AND workflow_instance_id = $2 AND status IN ('PENDING', 'IN_PROGRESS')`,
      [ticket_id, params.id]
    )
    if (ticketResult.rows.length === 0) return response.status(404).json({ error: 'Ticket not found or not completable' })
    const ticket = ticketResult.rows[0]

    const outcomeResult = await q(
      'SELECT id, code FROM wind.task_outcomes WHERE id = $1 AND task_id = $2',
      [outcome_id, ticket.node_task_id]
    )
    if (outcomeResult.rows.length === 0) return response.status(404).json({ error: "Outcome not valid for this ticket's task" })
    const outcome = outcomeResult.rows[0]

    await q(
      "UPDATE wind.tickets SET status = 'COMPLETED', updated_at = clock_timestamp() WHERE id = $1",
      [ticket_id]
    )

    await q(
      `INSERT INTO wind.receipts (ticket_id, ticket_task_id, outcome_id, work_request_id)
       VALUES ($1, $2, $3, $4)`,
      [ticket.id, ticket.node_task_id, outcome_id, ticket_id]
    )

    const edgeResult = await q(
      `SELECT to_node_id FROM wind.workflow_edges
       WHERE workflow_version_id = $1 AND from_node_id = $2 AND outcome_id = $3`,
      [instance.workflow_version_id, ticket.node_id, outcome_id]
    )

    const newTickets = []

    if (edgeResult.rows.length === 0) {
      const nodeResult = await q('SELECT is_terminal FROM wind.workflow_nodes WHERE id = $1', [ticket.node_id])
      if (nodeResult.rows.length > 0 && nodeResult.rows[0].is_terminal) {
        const pendingResult = await q(
          `SELECT COUNT(*) AS pending
           FROM wind.tickets
           WHERE workflow_instance_id = $1 AND status IN ('PENDING', 'IN_PROGRESS')`,
          [params.id]
        )
        if (parseInt(pendingResult.rows[0].pending, 10) === 0) {
          await q(
            "UPDATE wind.workflow_instances SET status = 'COMPLETED', updated_at = clock_timestamp() WHERE id = $1",
            [params.id]
          )
        }
      }
    } else {
      for (const edge of edgeResult.rows) {
        const nodeResult = await q('SELECT task_id FROM wind.workflow_nodes WHERE id = $1', [edge.to_node_id])
        if (nodeResult.rows.length === 0) continue

        const titleResult = await q('SELECT title_id FROM wind.tasks WHERE id = $1', [nodeResult.rows[0].task_id])
        if (titleResult.rows.length === 0) continue

        const newTicketResult = await q(
          `INSERT INTO wind.tickets
           (workflow_instance_id, workflow_version_id, node_id, node_task_id, assigned_title_id,
            input_artifact_type, input_artifact_id, status)
           VALUES ($1, $2, $3, $4, $5, 'from_outcome', $6, 'PENDING')
           RETURNING id, status, created_at`,
          [instance.id, instance.workflow_version_id, edge.to_node_id, nodeResult.rows[0].task_id,
           titleResult.rows[0].title_id, ticket_id]
        )
        newTickets.push(newTicketResult.rows[0])
      }
    }

    return response.json({
      ticket_id,
      outcome: outcome.code,
      new_tickets: newTickets,
    })
  }

  // Run — fully automatic: execute → advance → execute → … until terminal
  async runInstance({ params, request, response }: HttpContext) {
    const body = request.all()
    const max_steps = body.max_steps !== undefined ? parseInt(String(body.max_steps), 10) : 10
    const timeout_ms = body.timeout_ms !== undefined ? parseInt(String(body.timeout_ms), 10) : 120_000
    const stepLog: any[] = []

    let instResult = await q(
      "SELECT id, workflow_version_id, status FROM wind.workflow_instances WHERE id = $1 AND status = 'ACTIVE'",
      [params.id]
    )
    if (instResult.rows.length === 0) return response.status(404).json({ error: 'Instance not found or not active' })
    const workflowVersionId = instResult.rows[0].workflow_version_id

    for (let step = 0; step < max_steps; step++) {
      instResult = await q('SELECT status FROM wind.workflow_instances WHERE id = $1', [params.id])
      if (instResult.rows[0].status !== 'ACTIVE') {
        stepLog.push({ step, action: 'instance_not_active', status: instResult.rows[0].status })
        break
      }

      const ticketResult = await q(
        `SELECT t.id, t.node_id, t.node_task_id, n.name as node_name
         FROM wind.tickets t
         JOIN wind.workflow_nodes n ON t.node_id = n.id
         WHERE t.workflow_instance_id = $1 AND t.status = 'PENDING'
         ORDER BY t.created_at ASC LIMIT 1`,
        [params.id]
      )

      if (ticketResult.rows.length === 0) {
        stepLog.push({ step, action: 'no_pending_tickets' })
        break
      }

      const ticket = ticketResult.rows[0]

      await q(
        "UPDATE wind.tickets SET status = 'IN_PROGRESS', updated_at = clock_timestamp() WHERE id = $1",
        [ticket.id]
      )

      const harnessResult = await callHarness(ticket.node_task_id, {
        work_dir: HARNESS_WORK_DIR,
        timeout_ms,
      })

      const outcome = harnessResult.outcome
      stepLog.push({
        step,
        action: 'execute',
        node_name: ticket.node_name,
        role: harnessResult.role,
        exit_code: harnessResult.exit_code,
        outcome: outcome ? outcome.code : null,
        confidence: outcome ? outcome.confidence : null,
        duration_ms: harnessResult.duration_ms,
      })

      if (!outcome) {
        await q(
          "UPDATE wind.tickets SET status = 'PENDING', updated_at = clock_timestamp() WHERE id = $1",
          [ticket.id]
        )
        stepLog.push({ step, action: 'blocked_no_outcome' })
        break
      }

      await q(
        "UPDATE wind.tickets SET status = 'COMPLETED', updated_at = clock_timestamp() WHERE id = $1",
        [ticket.id]
      )
      await q(
        `INSERT INTO wind.receipts (ticket_id, ticket_task_id, outcome_id, work_request_id)
         VALUES ($1, $2, $3, $4)`,
        [ticket.id, ticket.node_task_id, outcome.id, ticket.id]
      )

      const edgeResult = await q(
        `SELECT to_node_id FROM wind.workflow_edges
         WHERE workflow_version_id = $1 AND from_node_id = $2 AND outcome_id = $3`,
        [workflowVersionId, ticket.node_id, outcome.id]
      )

      const newTickets: any[] = []
      if (edgeResult.rows.length === 0) {
        const nodeResult = await q('SELECT is_terminal FROM wind.workflow_nodes WHERE id = $1', [ticket.node_id])
        if (nodeResult.rows.length > 0 && nodeResult.rows[0].is_terminal) {
          const pendingResult = await q(
            `SELECT COUNT(*) AS pending FROM wind.tickets
             WHERE workflow_instance_id = $1 AND status IN ('PENDING', 'IN_PROGRESS')`,
            [params.id]
          )
          if (parseInt(pendingResult.rows[0].pending, 10) === 0) {
            await q(
              "UPDATE wind.workflow_instances SET status = 'COMPLETED', updated_at = clock_timestamp() WHERE id = $1",
              [params.id]
            )
          }
        }
        stepLog.push({ step, action: 'terminal_or_no_edges' })
        break
      } else {
        for (const edge of edgeResult.rows) {
          const nodeResult = await q('SELECT task_id FROM wind.workflow_nodes WHERE id = $1', [edge.to_node_id])
          if (nodeResult.rows.length === 0) continue

          const titleResult = await q('SELECT title_id FROM wind.tasks WHERE id = $1', [nodeResult.rows[0].task_id])
          if (titleResult.rows.length === 0) continue

          const newTicketResult = await q(
            `INSERT INTO wind.tickets
             (workflow_instance_id, workflow_version_id, node_id, node_task_id, assigned_title_id,
              input_artifact_type, input_artifact_id, status)
             VALUES ($1, $2, $3, $4, $5, 'from_outcome', $6, 'PENDING')
             RETURNING id, status`,
            [params.id, workflowVersionId, edge.to_node_id,
             nodeResult.rows[0].task_id, titleResult.rows[0].title_id, ticket.id]
          )
          newTickets.push(newTicketResult.rows[0])
        }
        stepLog.push({ step, action: 'advance', outcome: outcome.code, new_tickets: newTickets.length })
      }
    }

    const finalResult = await q('SELECT status FROM wind.workflow_instances WHERE id = $1', [params.id])

    return response.json({
      instance_id: params.id,
      final_status: finalResult.rows[0].status,
      steps_executed: stepLog.length,
      steps: stepLog,
    })
  }

  // ── tickets ───────────────────────────────────────────────────────────

  // List tickets (optionally filter by instance, status, or title)
  async listTickets({ request, response }: HttpContext) {
    const { instance_id, status, title_id } = request.qs()
    let sql = `
      SELECT t.id, t.workflow_instance_id, t.workflow_version_id, t.node_id, t.node_task_id,
             t.assigned_title_id, t.status, t.input_artifact_type, t.input_artifact_id,
             t.created_at, t.updated_at,
             n.name AS node_name, ti.display_name AS title_name, task.name AS task_name
      FROM wind.tickets t
      JOIN wind.workflow_nodes n ON t.node_id = n.id
      JOIN wind.titles ti ON t.assigned_title_id = ti.id
      JOIN wind.tasks task ON t.node_task_id = task.id
    `
    const conditions: string[] = []
    const vals: any[] = []
    let idx = 1
    if (instance_id) { conditions.push(`t.workflow_instance_id = $${idx++}`); vals.push(instance_id) }
    if (status) { conditions.push(`t.status = $${idx++}`); vals.push(status) }
    if (title_id) { conditions.push(`t.assigned_title_id = $${idx++}`); vals.push(title_id) }
    if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ')
    sql += ' ORDER BY t.created_at DESC'
    const result = await q(sql, vals)
    return response.json(result.rows)
  }

  // Get ticket by ID
  async getTicket({ params, response }: HttpContext) {
    const result = await q(
      `SELECT t.id, t.workflow_instance_id, t.workflow_version_id, t.node_id, t.node_task_id,
              t.assigned_title_id, t.status, t.input_artifact_type, t.input_artifact_id,
              t.created_at, t.updated_at,
              n.name AS node_name, ti.display_name AS title_name, task.name AS task_name
       FROM wind.tickets t
       JOIN wind.workflow_nodes n ON t.node_id = n.id
       JOIN wind.titles ti ON t.assigned_title_id = ti.id
       JOIN wind.tasks task ON t.node_task_id = task.id
       WHERE t.id = $1`,
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Ticket not found' })
    return response.json(result.rows[0])
  }

  // Update ticket status (e.g., PENDING → IN_PROGRESS)
  async updateTicketStatus({ params, request, response }: HttpContext) {
    const { status } = request.all()
    if (!status) return response.status(400).json({ error: 'status is required' })
    const allowed = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
    if (!allowed.includes(status)) return response.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` })

    const result = await q(
      `UPDATE wind.tickets SET status = $1, updated_at = clock_timestamp()
       WHERE id = $2
       RETURNING id, status, updated_at`,
      [status, params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Ticket not found' })
    return response.json(result.rows[0])
  }

  // Cancel a ticket
  async cancelTicket({ params, response }: HttpContext) {
    const result = await q(
      `UPDATE wind.tickets SET status = 'CANCELLED', updated_at = clock_timestamp()
       WHERE id = $1 AND status IN ('PENDING', 'IN_PROGRESS')
       RETURNING id, status, updated_at`,
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Ticket not found or not cancellable' })
    return response.json(result.rows[0])
  }

  // ── receipts ──────────────────────────────────────────────────────────

  // List receipts (optionally filter by ticket)
  async listReceipts({ request, response }: HttpContext) {
    const { ticket_id } = request.qs()
    let sql = `
      SELECT r.id, r.ticket_id, r.ticket_task_id, r.outcome_id, r.work_request_id,
             r.output_artifact_type, r.output_artifact_id, r.completed_at, r.metadata,
             o.code AS outcome_code, task.name AS task_name
      FROM wind.receipts r
      JOIN wind.task_outcomes o ON r.outcome_id = o.id
      JOIN wind.tasks task ON r.ticket_task_id = task.id
    `
    const vals: any[] = []
    if (ticket_id) {
      sql += ' WHERE r.ticket_id = $1'
      vals.push(ticket_id)
    }
    sql += ' ORDER BY r.completed_at DESC'
    const result = await q(sql, vals)
    return response.json(result.rows)
  }

  // Get receipt by ID
  async getReceipt({ params, response }: HttpContext) {
    const result = await q(
      `SELECT r.id, r.ticket_id, r.ticket_task_id, r.outcome_id, r.work_request_id,
              r.output_artifact_type, r.output_artifact_id, r.completed_at, r.metadata,
              o.code AS outcome_code, task.name AS task_name
       FROM wind.receipts r
       JOIN wind.task_outcomes o ON r.outcome_id = o.id
       JOIN wind.tasks task ON r.ticket_task_id = task.id
       WHERE r.id = $1`,
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Receipt not found' })
    return response.json(result.rows[0])
  }

  // ── validate ──────────────────────────────────────────────────────────

  // Validate a workflow version's graph integrity (v_workflow_graph_validation view)
  async validateVersion({ params, response }: HttpContext) {
    const result = await q(
      `SELECT workflow_version_id, issue_type, node_id, details
       FROM wind.v_workflow_graph_validation
       WHERE workflow_version_id = $1
       ORDER BY issue_type, node_id`,
      [params.version_id]
    )

    const issues = result.rows
    const valid = issues.length === 0

    return response.json({
      version_id: params.version_id,
      valid,
      issue_count: issues.length,
      issues,
    })
  }

  // Validate a workflow version has required structure (entrypoint, terminal, edges)
  async validateStructure({ params, response }: HttpContext) {
    const versionId = params.version_id
    const checks: any[] = []

    const epResult = await q(
      'SELECT COUNT(*) AS cnt FROM wind.workflow_nodes WHERE workflow_version_id = $1 AND is_entrypoint = true',
      [versionId]
    )
    const entrypoints = parseInt(epResult.rows[0].cnt, 10)
    checks.push({
      check: 'has_entrypoint',
      pass: entrypoints === 1,
      detail: entrypoints === 0 ? 'No entrypoint found' : entrypoints === 1 ? 'OK' : `${entrypoints} entrypoints found (expected 1)`,
    })

    const termResult = await q(
      'SELECT COUNT(*) AS cnt FROM wind.workflow_nodes WHERE workflow_version_id = $1 AND is_terminal = true',
      [versionId]
    )
    const terminals = parseInt(termResult.rows[0].cnt, 10)
    checks.push({
      check: 'has_terminal',
      pass: terminals >= 1,
      detail: terminals === 0 ? 'No terminal node found' : `${terminals} terminal node(s)`,
    })

    const noEdgeResult = await q(
      `SELECT n.id, n.name
       FROM wind.workflow_nodes n
       WHERE n.workflow_version_id = $1
         AND n.is_terminal = false
         AND n.id NOT IN (SELECT from_node_id FROM wind.workflow_edges WHERE workflow_version_id = $1)`,
      [versionId]
    )
    checks.push({
      check: 'non_terminal_has_edges',
      pass: noEdgeResult.rows.length === 0,
      detail: noEdgeResult.rows.length === 0
        ? 'OK'
        : `Non-terminal nodes without outgoing edges: ${noEdgeResult.rows.map((r: any) => r.name).join(', ')}`,
    })

    const valid = checks.every((c) => c.pass)

    return response.json({ version_id: versionId, valid, checks })
  }
}
