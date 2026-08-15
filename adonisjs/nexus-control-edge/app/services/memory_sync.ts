import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { Redis } from 'ioredis'
import env from '#start/env'

/**
 * role-memory-srv, re-homed onto the control-plane edge (Wave 1.2).
 *
 * Reads procedure cards (tackle.memory) + active role assignments
 * (tackle.role_memory) from PG and writes the procedure registry cache
 * into Redis under `mem:*` — the same key space the MCP tools read.
 *
 * Auto-heal on Redis ready, same as the prompt-sync port.
 */

export const KEY_PREFIX = 'mem:'
export const PROC_KEY = (slug: string) => `${KEY_PREFIX}proc:${slug}`
export const IDX_KEY = (role: string) => `${KEY_PREFIX}idx:${role}`
export const META_UPDATED_KEY = `${KEY_PREFIX}meta:last_updated`

export interface ProcedureIndexEntry {
  slug: string
  summary: string
  tags: string[]
}

export interface ProcedureCard {
  slug: string
  title: string
  summary: string
  body_md: string
  tags: string[]
  triggers: string[]
  mcp_tools: string[]
  roles: string[]
  updated_at: string
}

interface MemoryRow {
  id: string
  slug: string
  title: string
  summary: string
  body_md: string
  tags: string[]
  triggers: string[]
  mcp_tools: string[]
  updated_at: string
}

interface RoleMemoryRow {
  memory_id: string
  role: string
}

let redis: Redis | null = null
let healBound = false

export function getMemoryRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: env.get('REDIS_HOST'),
      port: env.get('REDIS_PORT'),
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    })
    redis.on('error', (err) => {
      logger.warn(`[memory-sync] redis error: ${err.message}`)
    })
    if (!healBound) {
      healBound = true
      redis.on('ready', () => {
        syncMemory()
          .then((r) => logger.info(`[memory-sync] auto-sync on Redis ready: ${r.procedures} procedures`))
          .catch((err: Error) => logger.warn(`[memory-sync] auto-sync on Redis ready failed: ${err.message}`))
      })
    }
  }
  return redis
}

export async function syncMemory(): Promise<{
  procedures: number
  roleIndices: number
  timestamp: string
}> {
  const r = getMemoryRedis()

  const procedures = await db.rawQuery<{ rows: MemoryRow[] }>(
    `SELECT * FROM tackle.memory ORDER BY slug`
  )
  const roleAssignments = await db.rawQuery<{ rows: RoleMemoryRow[] }>(
    `SELECT * FROM tackle.role_memory
     WHERE expiration_dt IS NULL
     ORDER BY role, as_of_dt DESC`
  )

  // memory_id → [role, ...]
  const roleMap = new Map<string, string[]>()
  for (const row of roleAssignments.rows) {
    const roles = roleMap.get(row.memory_id) || []
    roles.push(row.role)
    roleMap.set(row.memory_id, roles)
  }

  const now = new Date().toISOString()
  const pipeline = r.pipeline()
  const roleIdx = new Map<string, ProcedureIndexEntry[]>()

  for (const proc of procedures.rows) {
    const roles = roleMap.get(proc.id) || []
    const card: ProcedureCard = {
      slug: proc.slug,
      title: proc.title,
      summary: proc.summary,
      body_md: proc.body_md,
      tags: proc.tags,
      triggers: proc.triggers,
      mcp_tools: proc.mcp_tools,
      roles,
      updated_at: proc.updated_at,
    }
    pipeline.set(PROC_KEY(proc.slug), JSON.stringify(card))

    for (const role of roles) {
      const idx = roleIdx.get(role) || []
      idx.push({ slug: proc.slug, summary: proc.summary, tags: proc.tags })
      roleIdx.set(role, idx)
    }
  }

  for (const [role, entries] of roleIdx) {
    pipeline.set(IDX_KEY(role), JSON.stringify(entries))
  }

  pipeline.set(META_UPDATED_KEY, now)

  const results = await pipeline.exec()
  if (results) {
    const failures = results.filter(([err]) => err !== null)
    if (failures.length > 0) {
      const first = failures[0][0] as Error
      throw new Error(
        `Redis pipeline write failed: ${failures.length}/${results.length} commands failed. First error: ${first.message}`
      )
    }
  }

  return {
    procedures: procedures.rows.length,
    roleIndices: roleIdx.size,
    timestamp: now,
  }
}
