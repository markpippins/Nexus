/**
 * tackle-srv re-homing (Wave 3.5) — ops domain.
 *
 * Ported from nexus/typescript/tackle-srv/src/routes/
 * {sessions,roles,scheduler,logs,health}.ts. Runs on the `tackle` named
 * connection (search_path=tackle,public).
 */

import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'
import os from 'node:os'

const CONN = 'tackle'

// ── Scheduler coercion helpers (mirror upstream db.ts) ──────────────
function toEnabledInt(v: unknown, dflt: number): number {
  if (v === undefined || v === null || v === '') return dflt
  if (v === true || v === 1 || v === '1' || v === 'true') return 1
  if (v === false || v === 0 || v === '0' || v === 'false') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : dflt
}

function toScheduleSeconds(v: unknown, dflt: number): number {
  if (v === undefined || v === null || v === '') return dflt
  if (typeof v === 'number') return Number.isFinite(v) && v >= 1 ? v : dflt
  const s = String(v).trim()
  const m = /^(\d+)(ms|s|m|h|d)?$/.exec(s)
  if (m) {
    const n = parseInt(m[1], 10)
    const mult: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, ms: 0.001 }
    const secs = n * (mult[m[2] || 's'])
    if (secs >= 1 && Number.isFinite(secs)) return Math.round(secs)
  }
  const n2 = Number(v)
  return Number.isFinite(n2) && n2 >= 1 ? n2 : dflt
}

export default class TackleOpsController {
  // ── sessions ────────────────────────────────────────────────────
  async listSessions(_ctx: HttpContext) {
    const r = await q('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 100', [], CONN)
    return r.rows
  }

  async killSession({ params, response }: HttpContext) {
    const { sessionId } = params
    if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return response.status(400).json({ error: 'Invalid session ID' })
    }
    const s = await q('SELECT * FROM sessions WHERE id = $1', [sessionId], CONN)
    const session = s.rows[0]
    if (!session) {
      return response.status(404).json({ error: `Session ${sessionId} not found` })
    }
    if (!session.is_running) {
      return response.status(400).json({ killed: false, error: 'Session is not running', sessionId })
    }
    const now = new Date().toISOString()
    const killedPids: number[] = []
    const errors: string[] = []

    if (session.pid && session.pid > 0) {
      try {
        process.kill(-session.pid, 'SIGKILL')
        killedPids.push(session.pid)
      } catch (e: any) {
        try {
          process.kill(session.pid, 'SIGKILL')
          killedPids.push(session.pid)
        } catch (e2: any) {
          errors.push(`PID ${session.pid}: ${e2.message}`)
        }
      }
    }

    await q(
      `UPDATE sessions SET end_iso = $1, exit_code = $2, is_running = 0 WHERE id = $3`,
      [now, 137, sessionId],
      CONN
    )

    return response.json({
      killed: true,
      sessionId,
      pids: killedPids,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: now,
    })
  }

  // ── roles ──────────────────────────────────────────────────────
  async listRoles(_ctx: HttpContext) {
    const r = await q('SELECT * FROM roles ORDER BY name', [], CONN)
    return { count: r.rows.length, roles: r.rows }
  }

  async getRole({ params, response }: HttpContext) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    let r
    if (uuidPattern.test(params.id)) {
      r = await q('SELECT * FROM roles WHERE id = $1', [params.id], CONN)
      if (r.rows.length > 0) return response.json(r.rows[0])
    }
    r = await q('SELECT * FROM roles WHERE name = $1', [params.id], CONN)
    if (r.rows.length === 0) return response.status(404).json({ error: 'Role not found' })
    return response.json(r.rows[0])
  }

  async upsertRole({ request, response }: HttpContext) {
    const { id, name, description } = request.all()
    if (!name) return response.status(400).json({ error: 'name is required' })
    const now = new Date().toISOString()
    const hasId = !!id
    const r = hasId
      ? await q(
          `INSERT INTO roles (id, name, description, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $4)
           ON CONFLICT (name) DO UPDATE SET
             description = EXCLUDED.description, updated_at = EXCLUDED.updated_at
           RETURNING *`,
          [id, name, description ?? '', now],
          CONN
        )
      : await q(
          `INSERT INTO roles (name, description, created_at, updated_at)
           VALUES ($1, $2, $3, $3)
           ON CONFLICT (name) DO UPDATE SET
             description = EXCLUDED.description, updated_at = EXCLUDED.updated_at
           RETURNING *`,
          [name, description ?? '', now],
          CONN
        )
    return response.json({ saved: true, role: r.rows[0] })
  }

  async deleteRole({ params, response }: HttpContext) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    let changes = 0
    if (uuidPattern.test(params.id)) {
      const r = await q('DELETE FROM roles WHERE id = $1', [params.id], CONN)
      changes = r.rowCount
    }
    if (changes === 0) {
      const r = await q('DELETE FROM roles WHERE name = $1', [params.id], CONN)
      changes = r.rowCount
    }
    return response.json({ deleted: changes > 0, id: params.id })
  }

  // ── scheduler ──────────────────────────────────────────────────
  async listScheduler(_ctx: HttpContext) {
    const r = await q('SELECT * FROM agent_scheduler ORDER BY role, id ASC', [], CONN)
    return { count: r.rows.length, entries: r.rows }
  }

  async listSchedulerDue(_ctx: HttpContext) {
    const rows = await q(
      `SELECT * FROM agent_scheduler
       WHERE enabled = 1
         AND schedule_type <> 'manual'
         AND (
           last_run_at IS NULL
           OR (
             schedule_type = 'interval'
             AND EXTRACT(EPOCH FROM NOW() - last_run_at) >= schedule_value
           )
         )
       ORDER BY last_run_at ASC NULLS FIRST`,
      [],
      CONN
    )
    // enrich with prompt bodies (mirror resolveSchedulerPrompt)
    const enriched = await Promise.all(
      rows.rows.map(async (row: any) => {
        const persona = await q(
          `SELECT id, role, slug, version, title, body_md, parameter_schema, tags, created_at, updated_at
           FROM prompts WHERE role = $1 AND slug = $2
           ORDER BY version DESC LIMIT 1`,
          [row.role, 'opencode-persona'],
          CONN
        )
        const base = persona.rows[0]?.body_md ?? null
        let taskBody: string | null = null
        if (row.task_slug) {
          const task = await q(
            `SELECT t.id, t.role, t.task_slug, t.scope, t.acceptance_criteria,
                    t.prompt_id, t.active, t.created_at, t.updated_at,
                    p.role AS prompt_role, p.slug AS prompt_slug, p.version AS prompt_version
             FROM tasks t
             LEFT JOIN prompts p ON p.id = t.prompt_id
             WHERE t.task_slug = $1
             ORDER BY t.active DESC, t.updated_at DESC
             LIMIT 1`,
            [row.task_slug],
            CONN
          )
          const t = task.rows[0]
          if (t?.prompt_role && t?.prompt_slug) {
            const p = await q(
              `SELECT body_md FROM prompts WHERE role = $1 AND slug = $2 ORDER BY version DESC LIMIT 1`,
              [t.prompt_role, t.prompt_slug],
              CONN
            )
            taskBody = p.rows[0]?.body_md ?? null
          }
        }
        let assembled: string | null = base
        if (taskBody) {
          assembled = base
            ? `${base}\n\n---\n\n## Attached Task: ${row.task_slug}\n\n${taskBody}`
            : `## Attached Task: ${row.task_slug}\n\n${taskBody}`
        }
        return { ...row, base_prompt_body: base, task_prompt_body: taskBody, assembled_prompt: assembled }
      })
    )
    return { count: enriched.length, entries: enriched }
  }

  async getSchedulerEntry({ params, response }: HttpContext) {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) return response.status(400).json({ error: 'Invalid id' })
    const r = await q('SELECT * FROM agent_scheduler WHERE id = $1', [id], CONN)
    if (r.rows.length === 0) return response.status(404).json({ error: 'Not found' })
    return response.json(r.rows[0])
  }

  async createSchedulerEntry({ request, response }: HttpContext) {
    const { role, model_id, harness, agent_config, schedule_type, schedule_value, cron_expr, event_criteria, project_dir, task_slug, enabled } = request.all()
    if (!role) return response.status(400).json({ error: 'role is required' })
    const now = new Date().toISOString()
    const r = await q(
      `INSERT INTO agent_scheduler (role, model_id, harness, agent_config, schedule_type, schedule_value, cron_expr, event_criteria, project_dir, task_slug, enabled, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, '{}', $12, $12)
       RETURNING *`,
      [role, model_id ?? null, harness ?? 'opencode', agent_config ?? '{}',
       schedule_type ?? 'interval', toScheduleSeconds(schedule_value, 3600),
       cron_expr ?? null,
       event_criteria == null ? null : typeof event_criteria === 'string' ? event_criteria : JSON.stringify(event_criteria),
       project_dir ?? '/home/codex/dev', task_slug ?? null, toEnabledInt(enabled, 1), now],
      CONN
    )
    return response.json({ created: true, entry: r.rows[0] })
  }

  async updateSchedulerEntry({ params, request, response }: HttpContext) {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) return response.status(400).json({ error: 'Invalid id' })
    const data = request.all()
    const now = new Date().toISOString()
    const sets: string[] = ['updated_at = $2']
    const vals: any[] = [id, now]
    let idx = 3
    const fields = ['role', 'model_id', 'harness', 'agent_config', 'schedule_type',
      'schedule_value', 'cron_expr', 'event_criteria', 'project_dir', 'task_slug', 'enabled', 'last_run_at', 'last_run_status', 'metadata']
    for (const f of fields) {
      if (data[f] !== undefined) {
        sets.push(`${f} = $${idx++}`)
        vals.push(
          f === 'enabled' ? toEnabledInt(data[f], 1)
          : f === 'schedule_value' ? toScheduleSeconds(data[f], 3600)
          : f === 'event_criteria' && data[f] != null
            ? typeof data[f] === 'string' ? data[f] : JSON.stringify(data[f])
            : data[f]
        )
      }
    }
    const r = await q(
      `UPDATE agent_scheduler SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      vals,
      CONN
    )
    if (r.rows.length === 0) return response.status(404).json({ error: 'Not found' })
    return response.json({ updated: true, entry: r.rows[0] })
  }

  async deleteSchedulerEntry({ params, response }: HttpContext) {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) return response.status(400).json({ error: 'Invalid id' })
    const r = await q('DELETE FROM agent_scheduler WHERE id = $1', [id], CONN)
    return response.json({ deleted: r.rowCount > 0, id })
  }

  // ── logs ───────────────────────────────────────────────────────
  async listLogs({ request, response }: HttpContext) {
    const { level, category, search, since, limit } = request.qs()
    const conditions: string[] = []
    const vals: any[] = []
    let idx = 1

    if (level && level !== 'ALL') {
      const levels = String(level).toUpperCase().split(',')
      const placeholders = levels.map(() => `$${idx++}`).join(', ')
      conditions.push(`level = ANY(ARRAY[${placeholders}])`)
      vals.push(...levels)
    }
    if (category && category !== 'ALL') {
      const cats = String(category).toUpperCase().split(',')
      const placeholders = cats.map(() => `$${idx++}`).join(', ')
      conditions.push(`category = ANY(ARRAY[${placeholders}])`)
      vals.push(...cats)
    }
    if (search) {
      vals.push(`%${String(search).toLowerCase()}%`)
      conditions.push(`(LOWER(message) LIKE $${idx++} OR LOWER(category) LIKE $${idx - 1} OR LOWER(COALESCE(source,'')) LIKE $${idx - 1})`)
    }
    if (since) {
      vals.push(String(since))
      conditions.push(`timestamp > $${idx++}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const limitNum = Math.min(Math.max(1, parseInt(String(limit), 10) || 100), 500)

    const total = await q('SELECT COUNT(*)::int AS count FROM system_logs', [], CONN)
    const filtered = await q(`SELECT COUNT(*)::int AS count FROM system_logs ${where}`, vals, CONN)
    const logs = await q(`SELECT * FROM system_logs ${where} ORDER BY timestamp DESC LIMIT $${idx}`, [...vals, limitNum], CONN)

    const categories = Array.from(new Set(logs.rows.map((l: any) => l.category)))
    return response.json({
      total: total.rows[0]?.count || 0,
      filtered_count: filtered.rows[0]?.count || 0,
      count: logs.rows.length,
      categories,
      levels: ['INFO', 'WARN', 'ERROR', 'DEBUG'],
      logs: logs.rows,
      last_polled_at: new Date().toISOString(),
    })
  }

  async emitLog({ request, response }: HttpContext) {
    const { level = 'INFO', category = 'SYSTEM', message, source, details } = request.all()
    if (!message) return response.status(400).json({ error: 'message is required' })
    await q(
      `INSERT INTO system_logs (level, category, message, source, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [level, category, message, source ?? null, details ?? null],
      CONN
    )
    return response.json({
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      level, category, message, source, details,
    })
  }

  async clearLogs(_ctx: HttpContext) {
    await q('DELETE FROM system_logs', [], CONN)
    await q(
      `INSERT INTO system_logs (level, category, message) VALUES ($1, $2, $3)`,
      ['INFO', 'SYSTEM', 'System log buffer cleared by operator action'],
      CONN
    )
    return { cleared: true, timestamp: new Date().toISOString() }
  }

  // ── health ─────────────────────────────────────────────────────
  // In-memory metric history (last 60 snapshots, one per minute) — the
  // upstream health router maintained this in-process state; mirrored here.
  private metricsHistory: any[] = []

  constructor() {
    this.metricsHistory.push(this.collectMetrics())
    setInterval(() => {
      this.metricsHistory.push(this.collectMetrics())
      if (this.metricsHistory.length > 60) this.metricsHistory.shift()
    }, 60_000).unref?.()
  }

  private collectMetrics() {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const usedMem = totalMem - freeMem
    const loadAvg = os.loadavg()[0]
    const cpuCount = os.cpus().length
    const cpuPercent = Math.round((loadAvg / cpuCount) * 100 * 10) / 10
    return {
      timestamp: new Date().toISOString(),
      cpu_percent: Math.max(0, Math.min(100, cpuPercent)),
      memory_percent: Math.round((usedMem / totalMem) * 1000) / 10,
      memory_used_mb: Math.round((usedMem / (1024 * 1024)) * 10) / 10,
      memory_total_mb: Math.round((totalMem / (1024 * 1024)) * 10) / 10,
      active_requests: 0,
      latency_avg_ms: 0,
    }
  }

  private getSystemHealth() {
    const latest = this.metricsHistory[this.metricsHistory.length - 1]
    const loadAvg = os.loadavg()
    const cpuCount = os.cpus().length
    return {
      status: loadAvg[0] > cpuCount * 0.9 ? 'degraded' : 'ok',
      port: parseInt(process.env.TACKLE_SRV_PORT || '3410', 10),
      pid: process.pid,
      timestamp: new Date().toISOString(),
      uptime_seconds: Math.round(os.uptime()),
      cpu: {
        usage_percent: latest.cpu_percent,
        cores: cpuCount,
        load_average: [Math.round(loadAvg[0] * 100) / 100, Math.round(loadAvg[1] * 100) / 100, Math.round(loadAvg[2] * 100) / 100],
      },
      memory: {
        used_mb: latest.memory_used_mb,
        total_mb: latest.memory_total_mb,
        usage_percent: latest.memory_percent,
        free_mb: Math.round((os.freemem() / (1024 * 1024)) * 10) / 10,
        heap_used_mb: Math.round((process.memoryUsage().heapUsed / (1024 * 1024)) * 10) / 10,
        heap_total_mb: Math.round((process.memoryUsage().heapTotal / (1024 * 1024)) * 10) / 10,
      },
      history: this.metricsHistory,
    }
  }

  async healthHistory(_ctx: HttpContext) {
    const health = this.getSystemHealth()
    return {
      status: health.status,
      timestamp: health.timestamp,
      count: health.history.length,
      history: health.history,
    }
  }

  async healthMetrics(_ctx: HttpContext) {
    return this.getSystemHealth()
  }

  async simulateLoad(_ctx: HttpContext) {
    return this.getSystemHealth()
  }
}
