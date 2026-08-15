import db from '@adonisjs/lucid/services/db'
import logger from '@adonisjs/core/services/logger'
import { Redis } from 'ioredis'
import env from '#start/env'

/**
 * tackle-prompt-sync-srv, re-homed onto the control-plane edge (Wave 1.1).
 *
 * Reads the latest prompt per (role, slug) + active tasks from PG
 * (tackle.prompts / tackle.tasks) and writes the prompt/task cache into
 * Redis. Key space (`prompt:*`, `task:*`) is disjoint from the procedure
 * registry's `mem:*` space.
 *
 * Auto-heal: ioredis emits "ready" on initial connect AND every reconnect,
 * so the cache repopulates without human intervention after an outage.
 */

export const KEY_PREFIX = 'prompt:'
export const PROC_KEY = (role: string, slug: string) => `${KEY_PREFIX}proc:${role}::${slug}`
export const IDX_KEY = (role: string) => `${KEY_PREFIX}idx:${role}`
export const META_UPDATED_KEY = `${KEY_PREFIX}meta:last_updated`
export const TASK_IDX_KEY = (role: string) => `task:idx:${role}`

export interface PromptIndexEntry {
  slug: string
  title: string
  version: number
  tags: string[]
  updated_at: string
}

export interface TaskIndexEntry {
  task_slug: string
  scope: string
  acceptance_criteria: string[]
  prompt_id: string
  prompt_slug: string
  updated_at: string
}

export interface PromptCard {
  id: string
  role: string
  slug: string
  version: number
  title: string
  body_md: string
  parameter_schema: Record<string, any>
  tags: string[]
  created_at: string
  updated_at: string
}

interface PromptRow extends PromptCard {}
interface TaskRow {
  id: string
  role: string
  task_slug: string
  scope: string
  acceptance_criteria: string[]
  prompt_id: string
  active: boolean
  created_at: string
  updated_at: string
}

let redis: Redis | null = null
let healBound = false

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis({
      host: env.get('REDIS_HOST'),
      port: env.get('REDIS_PORT'),
      maxRetriesPerRequest: 2,
      lazyConnect: false,
    })
    redis.on('error', (err) => {
      logger.warn(`[prompt-sync] redis error: ${err.message}`)
    })
    if (!healBound) {
      healBound = true
      redis.on('ready', () => {
        syncAll()
          .then((r) => logger.info(`[prompt-sync] auto-sync on Redis ready: ${r.prompts} prompts, ${r.tasks} tasks`))
          .catch((err: Error) => logger.warn(`[prompt-sync] auto-sync on Redis ready failed: ${err.message}`))
      })
    }
  }
  return redis
}

/**
 * Full sync: read the latest prompt for each (role, slug) and all active
 * tasks from PG, write to Redis. Called on startup, on Redis ready, and on
 * POST /refresh.
 */
export async function syncAll(): Promise<{
  prompts: number
  rolePromptIndices: number
  tasks: number
  roleTaskIndices: number
  timestamp: string
}> {
  const r = getRedis()
  const [prompts, tasks] = await Promise.all([fetchLatestPrompts(), fetchActiveTasks()])

  const now = new Date().toISOString()
  const pipeline = r.pipeline()

  // ── 1. Per-prompt cards + per-role prompt indices ──────────────────
  const rolePromptIdx = new Map<string, PromptIndexEntry[]>()

  for (const p of prompts) {
    const card: PromptCard = {
      id: p.id,
      role: p.role,
      slug: p.slug,
      version: p.version,
      title: p.title,
      body_md: p.body_md,
      parameter_schema: p.parameter_schema,
      tags: p.tags,
      created_at: p.created_at,
      updated_at: p.updated_at,
    }
    pipeline.set(PROC_KEY(p.role, p.slug), JSON.stringify(card))

    const idx = rolePromptIdx.get(p.role) || []
    idx.push({ slug: p.slug, title: p.title, version: p.version, tags: p.tags, updated_at: p.updated_at })
    rolePromptIdx.set(p.role, idx)
  }

  for (const [role, entries] of rolePromptIdx) {
    pipeline.set(IDX_KEY(role), JSON.stringify(entries))
  }

  // ── 2. Per-role task indices ──────────────────────────────────────
  const promptIdToSlug = new Map<string, string>()
  for (const p of prompts) promptIdToSlug.set(p.id, p.slug)

  const roleTaskIdx = new Map<string, TaskIndexEntry[]>()
  for (const t of tasks) {
    const entry: TaskIndexEntry = {
      task_slug: t.task_slug,
      scope: t.scope,
      acceptance_criteria: t.acceptance_criteria,
      prompt_id: t.prompt_id,
      prompt_slug: promptIdToSlug.get(t.prompt_id) ?? '',
      updated_at: t.updated_at,
    }
    const idx = roleTaskIdx.get(t.role) || []
    idx.push(entry)
    roleTaskIdx.set(t.role, idx)
  }

  for (const [role, entries] of roleTaskIdx) {
    pipeline.set(TASK_IDX_KEY(role), JSON.stringify(entries))
  }

  pipeline.set(META_UPDATED_KEY, now)
  await pipeline.exec()

  return {
    prompts: prompts.length,
    rolePromptIndices: rolePromptIdx.size,
    tasks: tasks.length,
    roleTaskIndices: roleTaskIdx.size,
    timestamp: now,
  }
}

/** Latest version of each prompt template per (role, slug). */
async function fetchLatestPrompts(): Promise<PromptRow[]> {
  const result = await db.rawQuery<{ rows: PromptRow[] }>(
    `SELECT DISTINCT ON (role, slug)
            id, role, slug, version, title, body_md,
            parameter_schema, tags, created_at, updated_at
     FROM tackle.prompts
     ORDER BY role, slug, version DESC`
  )
  return result.rows
}

/** All active tasks. */
async function fetchActiveTasks(): Promise<TaskRow[]> {
  const result = await db.rawQuery<{ rows: TaskRow[] }>(
    `SELECT id, role, task_slug, scope, acceptance_criteria,
            prompt_id, active, created_at, updated_at
     FROM tackle.tasks
     WHERE active = TRUE
     ORDER BY role, task_slug`
  )
  return result.rows
}
