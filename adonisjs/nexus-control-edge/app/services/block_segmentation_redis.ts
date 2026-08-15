import { Redis } from 'ioredis'
import logger from '@adonisjs/core/services/logger'
import env from '#start/env'

/**
 * Block Segmentation — Redis Layer
 * Ported from nexus/typescript/nebula-srv/src/services/block-segmentation-redis.service.ts
 * (Wave 3.1). Volatile session-memory caching — all Redis state is
 * RECOMPUTABLE from Postgres, never a source of truth.
 *
 * Key patterns (from SPEC section 4):
 *   nebula:session:{conversation_id}                     → Hash
 *   nebula:snapshot:{id}:block:{block_id}                → Hash
 *   nebula:snapshot:{id}:segment_candidates              → Hash
 *   nebula:graph:{id}:out:{node_id}                      → SET
 *   nebula:graph:{id}:in:{node_id}                       → SET
 *   nebula:snapshot:{id}:bp_projection:{target}          → JSON string
 */

const KEY_SESSION = (convId: string) => `nebula:session:${convId}`
const KEY_BLOCK = (snapId: string, blockId: string) => `nebula:snapshot:${snapId}:block:${blockId}`
const KEY_CANDIDATES = (snapId: string) => `nebula:snapshot:${snapId}:segment_candidates`
const KEY_GRAPH_OUT = (snapId: string, nodeId: string) => `nebula:graph:${snapId}:out:${nodeId}`
const KEY_GRAPH_IN = (snapId: string, nodeId: string) => `nebula:graph:${snapId}:in:${nodeId}`
const KEY_PROJECTION = (snapId: string, target: string) => `nebula:snapshot:${snapId}:bp_projection:${target}`
const PATTERN_SNAPSHOT = (snapId: string) => `nebula:snapshot:${snapId}:*`
const KEY_INBOX_POINTER = (role: string) => `inbox:pointer:${role}`

let redis: Redis | null = null

export function initRedis(): Redis {
  if (redis) return redis
  redis = new Redis({
    host: env.get('REDIS_HOST'),
    port: env.get('REDIS_PORT'),
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      // Always retry with capped exponential backoff (same fix as the
      // original service — returning null permanently closes the client).
      return Math.min(times * 200, 2000)
    },
    lazyConnect: true,
  })
  redis.on('error', (err) => {
    logger.error(`[redis] block-segmentation error: ${err.message}`)
  })
  redis.connect().catch((err) => {
    logger.warn(`[redis] block-segmentation initial connect failed: ${err.message}`)
  })
  return redis
}

export function getRedis(): Redis {
  if (!redis) throw new Error('Redis not initialized. Call initRedis() first.')
  return redis
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit()
    redis = null
  }
}

// ── Inbox Pointer (per-role watermark for unread messages) ────────────

export async function getInboxPointer(role: string): Promise<string | null> {
  if (!redis) return null
  try {
    return await redis.get(KEY_INBOX_POINTER(role))
  } catch {
    return null
  }
}

export async function setInboxPointer(role: string, timestamp: string): Promise<void> {
  if (!redis) return
  await redis.set(KEY_INBOX_POINTER(role), timestamp)
}

export async function getAllInboxPointers(): Promise<Record<string, string | null>> {
  if (!redis) return {}
  const keys = await redis.keys('inbox:pointer:*')
  const result: Record<string, string | null> = {}
  for (const key of keys) {
    const role = key.replace('inbox:pointer:', '')
    result[role] = await redis.get(key)
  }
  return result
}

// ── Session Cache ─────────────────────────────────────────────────────

export interface SessionData {
  conversationId: string
  activeSnapshotId: string | null
  mode: 'view' | 'segment' | 'diff'
  userId: string
  updatedAt: string
}

export async function cacheSession(convId: string, data: Partial<SessionData>): Promise<void> {
  const r = getRedis()
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      fields[key] = typeof value === 'string' ? value : JSON.stringify(value)
    }
  }
  fields.updatedAt = new Date().toISOString()
  await r.hset(KEY_SESSION(convId), fields)
  await r.expire(KEY_SESSION(convId), 3600)
}

export async function getCachedSession(convId: string): Promise<Partial<SessionData> | null> {
  const r = getRedis()
  const raw = await r.hgetall(KEY_SESSION(convId))
  if (!raw || Object.keys(raw).length === 0) return null
  return {
    conversationId: raw.conversationId,
    activeSnapshotId: raw.activeSnapshotId || null,
    mode: (raw.mode as SessionData['mode']) || 'view',
    userId: raw.userId || 'unknown',
    updatedAt: raw.updatedAt || '',
  }
}

export async function invalidateSession(convId: string): Promise<void> {
  const r = getRedis()
  await r.del(KEY_SESSION(convId))
}

// ── Block Cache ───────────────────────────────────────────────────────

export async function cacheBlock(snapId: string, block: Record<string, any>): Promise<void> {
  const r = getRedis()
  const key = KEY_BLOCK(snapId, block.id || block.blockId)
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(block)) {
    if (v !== undefined && v !== null) {
      fields[k] = typeof v === 'string' ? v : String(v)
    }
  }
  await r.hset(key, fields)
  await r.expire(key, 7200)
}

export async function cacheBlocks(snapId: string, blocks: Record<string, any>[]): Promise<void> {
  const r = getRedis()
  const pipeline = r.pipeline()
  for (const block of blocks) {
    const key = KEY_BLOCK(snapId, block.id || block.blockId)
    const fields: Record<string, string> = {}
    for (const [k, v] of Object.entries(block)) {
      if (v !== undefined && v !== null) {
        fields[k] = typeof v === 'string' ? v : String(v)
      }
    }
    pipeline.hset(key, fields)
    pipeline.expire(key, 7200)
  }
  await pipeline.exec()
}

export async function getCachedBlock(snapId: string, blockId: string): Promise<Record<string, string> | null> {
  const r = getRedis()
  const raw = await r.hgetall(KEY_BLOCK(snapId, blockId))
  if (!raw || Object.keys(raw).length === 0) return null
  return raw
}

export async function invalidateBlocks(snapId: string): Promise<void> {
  const r = getRedis()
  let cursor = '0'
  do {
    const [nextCursor, keys] = await r.scan(cursor, 'MATCH', `nebula:snapshot:${snapId}:block:*`, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      await r.del(...keys)
    }
  } while (cursor !== '0')
}

// ── Segment Candidate Cache ───────────────────────────────────────────

export async function cacheCandidate(snapId: string, candidateId: string, data: Record<string, any>): Promise<void> {
  const r = getRedis()
  await r.hset(KEY_CANDIDATES(snapId), candidateId, JSON.stringify(data))
  await r.expire(KEY_CANDIDATES(snapId), 3600)
}

export async function getCachedCandidates(snapId: string): Promise<Record<string, any>> {
  const r = getRedis()
  const raw = await r.hgetall(KEY_CANDIDATES(snapId))
  if (!raw || Object.keys(raw).length === 0) return {}
  const result: Record<string, any> = {}
  for (const [id, json] of Object.entries(raw)) {
    try {
      result[id] = JSON.parse(json)
    } catch {
      result[id] = json
    }
  }
  return result
}

export async function removeCachedCandidate(snapId: string, candidateId: string): Promise<void> {
  const r = getRedis()
  await r.hdel(KEY_CANDIDATES(snapId), candidateId)
}

export async function invalidateCandidates(snapId: string): Promise<void> {
  const r = getRedis()
  await r.del(KEY_CANDIDATES(snapId))
}

// ── Graph Adjacency Cache ─────────────────────────────────────────────

export async function cacheGraphFromReferences(
  snapId: string,
  references: Array<{
    id: string
    source_block_id?: string | null
    source_segment_id?: string | null
    target_block_id?: string | null
    target_segment_id?: string | null
  }>,
): Promise<void> {
  const r = getRedis()
  const pipeline = r.pipeline()

  const nodeIds = new Set<string>()
  const edges: Array<{ source: string; target: string; edgeId: string }> = []

  for (const ref of references) {
    const sourceId = ref.source_block_id || ref.source_segment_id
    const targetId = ref.target_block_id || ref.target_segment_id
    if (!sourceId || !targetId) continue

    nodeIds.add(sourceId)
    nodeIds.add(targetId)
    edges.push({ source: sourceId, target: targetId, edgeId: ref.id })
  }

  let cursor = '0'
  do {
    const [nextCursor, keys] = await r.scan(cursor, 'MATCH', `nebula:graph:${snapId}:*`, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      pipeline.del(...keys)
    }
  } while (cursor !== '0')

  const outEdges = new Map<string, string[]>()
  const inEdges = new Map<string, string[]>()

  for (const edge of edges) {
    if (!outEdges.has(edge.source)) outEdges.set(edge.source, [])
    outEdges.get(edge.source)!.push(edge.edgeId)

    if (!inEdges.has(edge.target)) inEdges.set(edge.target, [])
    inEdges.get(edge.target)!.push(edge.edgeId)
  }

  for (const [nodeId, edgeIds] of outEdges) {
    if (edgeIds.length > 0) {
      pipeline.sadd(KEY_GRAPH_OUT(snapId, nodeId), ...edgeIds)
    }
  }
  for (const [nodeId, edgeIds] of inEdges) {
    if (edgeIds.length > 0) {
      pipeline.sadd(KEY_GRAPH_IN(snapId, nodeId), ...edgeIds)
    }
  }

  await pipeline.exec()
}

export async function getCachedGraphOutEdges(snapId: string, nodeId: string): Promise<string[]> {
  const r = getRedis()
  return await r.smembers(KEY_GRAPH_OUT(snapId, nodeId))
}

export async function getCachedGraphInEdges(snapId: string, nodeId: string): Promise<string[]> {
  const r = getRedis()
  return await r.smembers(KEY_GRAPH_IN(snapId, nodeId))
}

export async function invalidateGraph(snapId: string): Promise<void> {
  const r = getRedis()
  let cursor = '0'
  do {
    const [nextCursor, keys] = await r.scan(cursor, 'MATCH', `nebula:graph:${snapId}:*`, 'COUNT', 100)
    cursor = nextCursor
    if (keys.length > 0) {
      await r.del(...keys)
    }
  } while (cursor !== '0')
}

// ── BP Projection Cache ───────────────────────────────────────────────

export async function cacheProjection(snapId: string, target: string, data: any): Promise<void> {
  const r = getRedis()
  const key = KEY_PROJECTION(snapId, target)
  await r.set(key, JSON.stringify(data), 'EX', 3600)
}

export async function getCachedProjection(snapId: string, target: string = 'BP'): Promise<any | null> {
  const r = getRedis()
  const raw = await r.get(KEY_PROJECTION(snapId, target))
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export async function invalidateProjection(snapId: string, target?: string): Promise<void> {
  const r = getRedis()
  if (target) {
    await r.del(KEY_PROJECTION(snapId, target))
  } else {
    let cursor = '0'
    do {
      const [nextCursor, keys] = await r.scan(cursor, 'MATCH', `nebula:snapshot:${snapId}:bp_projection:*`, 'COUNT', 100)
      cursor = nextCursor
      if (keys.length > 0) {
        await r.del(...keys)
      }
    } while (cursor !== '0')
  }
}

// ── Bulk Invalidation ─────────────────────────────────────────────────

export async function invalidateSnapshot(snapId: string): Promise<void> {
  const r = getRedis()
  let cursor = '0'
  do {
    const [nextCursor, keys] = await r.scan(cursor, 'MATCH', PATTERN_SNAPSHOT(snapId), 'COUNT', 200)
    cursor = nextCursor
    if (keys.length > 0) {
      await r.del(...keys)
    }
  } while (cursor !== '0')
  await invalidateGraph(snapId)
}

export async function invalidateConversation(convId: string, snapshotIds: string[]): Promise<void> {
  await invalidateSession(convId)
  for (const snapId of snapshotIds) {
    await invalidateSnapshot(snapId)
  }
}
