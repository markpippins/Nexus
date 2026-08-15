/**
 * tackle-srv re-homing (Wave 3.5) — memory domain.
 *
 * Ported from nexus/typescript/tackle-srv/src/routes/memory.ts. The
 * original reads procedure indexes/cards from REDIS (mem:idx:{role},
 * mem:proc:{slug}) populated by the memory refresh pipeline — the same
 * data source the role-memory-srv port already uses. check-since and
 * role-updates read PG (tackle.role_memory, as_of_dt column).
 */

import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'
import { getRedis } from '#services/prompt_sync'

const CONN = 'tackle'
const MEM_IDX = (role: string) => `mem:idx:${role}`
const MEM_PROC = (slug: string) => `mem:proc:${slug}`

export default class TackleMemoryController {
  // GET /memory/procedures/:role — procedure cards for a role (Redis index)
  async roleProcedures({ params, response }: HttpContext) {
    try {
      const data = await getRedis().get(MEM_IDX(params.role))
      const procedures = data ? JSON.parse(data) : []
      return response.json({ role: params.role, count: procedures.length, procedures })
    } catch (e: any) {
      return response.status(500).json({ error: e.message })
    }
  }

  // GET /memory/procedure/:slug — single procedure card (Redis)
  async procedureBySlug({ params, response }: HttpContext) {
    try {
      const data = await getRedis().get(MEM_PROC(params.slug))
      if (!data) {
        return response.status(404).json({ error: `Procedure '${params.slug}' not found` })
      }
      return response.json(JSON.parse(data))
    } catch (e: any) {
      return response.status(500).json({ error: e.message })
    }
  }

  // POST /memory/check-since — has a role's memory changed since a timestamp?
  async checkSince({ request }: HttpContext) {
    const { role, since } = request.all()
    if (!role || !since) {
      return { status: 400, body: { error: 'role and since are required' } }
    }
    try {
      const r = await q(
        `SELECT COUNT(*)::int AS count FROM role_memory
         WHERE role = $1 AND as_of_dt > $2`,
        [role, since],
        CONN
      )
      return { role, since, changed: r.rows[0].count > 0 }
    } catch (e: any) {
      return { status: 500, body: { error: e.message } }
    }
  }

  // POST /memory/refresh — trigger a memory refresh (returns current counts)
  async refreshMemory(_ctx: HttpContext) {
    try {
      const idxKeys = await getRedis().keys('mem:idx:*')
      const procKeys = await getRedis().keys('mem:proc:*')
      return {
        refreshed: true,
        procedures: procKeys.length,
        roleIndices: idxKeys.length,
        timestamp: new Date().toISOString(),
      }
    } catch (e: any) {
      return { status: 500, body: { error: `Refresh failed: ${e.message}` } }
    }
  }

  // GET /memory/role-updates — role checkpoints (PG role_memory)
  async roleUpdates(_ctx: HttpContext) {
    const r = await q(
      `SELECT role, MAX(as_of_dt) AS last_active
       FROM role_memory
       GROUP BY role
       ORDER BY role`,
      [],
      CONN
    )
    const checkpoints: Record<string, { role: string; last_active: string }> = {}
    for (const row of r.rows) {
      checkpoints[row.role] = { role: row.role, last_active: row.last_active }
    }
    return checkpoints
  }
}
