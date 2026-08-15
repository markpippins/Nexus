import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { q, camelCaseRow, parsePagination, isUuid } from '../services/nebula_helpers.js'
import * as bs from '../services/block_segmentation.js'
import * as bsRedis from '../services/block_segmentation_redis.js'

/**
 * nebula-srv (Wave 3.1) — block segmentation domain.
 * Ported from nexus/typescript/nebula-srv/src/routes.ts section:
 * BLOCK SEGMENTATION.
 */

function err(e: any, status = 500) {
  return { status, body: { error: e?.message ?? String(e) } }
}

export default class NebulaSegmentationController {
  /** GET /api/conversations/by-snapshot/:snapshotId */
  async conversationBySnapshot({ request, response }: HttpContext) {
    try {
      const snapshotId = request.params().snapshotId as string
      if (!isUuid(snapshotId)) {
        response.status(400).json({ error: 'snapshotId must be a UUID' })
        return
      }
      const { rows } = await q(
        `SELECT cs.id, cs.conversation_id, cs.snapshot_index, cs.source_hash,
                cs.capture_mode, cs.block_count, cs.created_by, cs.created_at,
                h.source_filename
         FROM nebula.conversation_snapshots cs
         LEFT JOIN nebula.harvests h ON h.id = cs.conversation_id
         WHERE cs.id = ?`,
        [snapshotId]
      )
      if (rows.length === 0) {
        response.status(404).json({ error: 'Snapshot not found' })
        return
      }
      response.json(camelCaseRow(rows[0]))
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/conversations */
  async listConversations({ request, response }: HttpContext) {
    try {
      const { offset, limit, page, pageSize } = parsePagination(request.qs())
      const [dataResult, countResult] = await Promise.all([
        q(
          `SELECT cs.id, cs.conversation_id, cs.snapshot_index, cs.source_hash,
                  cs.capture_mode, cs.block_count, cs.created_by, cs.created_at,
                  h.source_filename
           FROM nebula.conversation_snapshots cs
           LEFT JOIN nebula.harvests h ON h.id = cs.conversation_id
           ORDER BY cs.created_at DESC
           LIMIT ? OFFSET ?`,
          [pageSize, offset]
        ),
        q('SELECT COUNT(*)::int AS total FROM nebula.conversation_snapshots'),
      ])
      response.json({
        items: dataResult.rows.map((r: any) => camelCaseRow(r)),
        total: parseInt(countResult.rows[0].total, 10),
        page,
        pageSize,
      })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/conversations/:id/snapshots */
  async conversationSnapshots({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const result = await bs.listSnapshots(id as string)
      response.json(result)
      try {
        bsRedis.initRedis()
        await bsRedis.cacheSession(id as string, {
          conversationId: id as string,
          activeSnapshotId: result.snapshots[0]?.id || null,
          mode: 'view',
          userId: 'unknown',
        })
      } catch (_) { /* Redis unavailable — non-fatal */ }
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/snapshots/:id/blocks */
  async snapshotBlocks({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const dq = request.qs().diffFrom
      const diffFrom = typeof dq === 'string' ? dq : undefined
      const result = await bs.listBlocks(id as string, diffFrom)
      response.json(result)
      if (!diffFrom) {
        try {
          bsRedis.initRedis()
          await bsRedis.cacheBlocks(id as string, result.blocks)
        } catch (_) { /* non-fatal */ }
      }
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/conversations/:id/blocks */
  async conversationBlocks({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const snapResult = await q(
        `SELECT id FROM nebula.conversation_snapshots
         WHERE conversation_id = ? ORDER BY snapshot_index DESC LIMIT 1`,
        [id]
      )
      if (snapResult.rows.length === 0) {
        response.status(404).json({ error: 'No snapshots found for this conversation' })
        return
      }
      const snapshotId = snapResult.rows[0].id
      const result = await bs.listBlocks(snapshotId)
      response.json(result)
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/conversations/by-snapshot/:snapshotId/blocks */
  async conversationBySnapshotBlocks({ request, response }: HttpContext) {
    try {
      const snapshotId = request.params().snapshotId as string
      if (!isUuid(snapshotId)) {
        response.status(400).json({ error: 'snapshotId must be a UUID' })
        return
      }
      const snapResult = await q(
        `SELECT id, conversation_id, snapshot_index
         FROM nebula.conversation_snapshots
         WHERE id = ?`,
        [snapshotId]
      )
      if (snapResult.rows.length === 0) {
        response.status(404).json({ error: 'Snapshot not found' })
        return
      }
      const result = await bs.listBlocks(snapshotId)
      response.json({
        ...result,
        conversationId: snapResult.rows[0].conversation_id,
        snapshotIndex: snapResult.rows[0].snapshot_index,
      })
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** POST /api/snapshots */
  async createSnapshot({ request, response }: HttpContext) {
    const trx = await db.transaction()
    try {
      const body = request.body()
      const { conversationId, snapshotIndex, sourceHash, captureMode, blockCount, createdBy, blocks } = body
      if (!conversationId || snapshotIndex === undefined || !sourceHash) {
        await trx.rollback()
        response.status(400).json({ error: 'conversationId, snapshotIndex, and sourceHash are required' })
        return
      }
      const result = await bs.createSnapshot(trx, {
        conversationId, snapshotIndex, sourceHash, captureMode, blockCount, createdBy, blocks,
      })
      await trx.commit()
      try {
        bsRedis.initRedis()
        await bsRedis.cacheBlocks(result.snapshot.id, blocks || [])
        await bsRedis.invalidateProjection(result.snapshot.id)
      } catch (_) { /* non-fatal */ }
      response.status(201).json(result)
    } catch (e: any) {
      await trx.rollback().catch(() => {})
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** POST /api/segments */
  async createSegment({ request, response }: HttpContext) {
    try {
      const body = request.body()
      const { conversationId, snapshotId, startBlockId, endBlockId, startBlockIndex, endBlockIndex, segmentType, source, title, notesMd, createdBy } = body
      if (!conversationId || !snapshotId || !startBlockId || !endBlockId || startBlockIndex === undefined || endBlockIndex === undefined) {
        response.status(400).json({ error: 'conversationId, snapshotId, startBlockId, endBlockId, startBlockIndex, and endBlockIndex are required' })
        return
      }
      try {
        bsRedis.initRedis()
        await bsRedis.invalidateCandidates(body.snapshotId)
        await bsRedis.invalidateProjection(body.snapshotId)
        await bsRedis.invalidateGraph(body.snapshotId)
      } catch (_) { /* non-fatal */ }
      const segment = await bs.createSegment({
        conversationId, snapshotId, startBlockId, endBlockId, startBlockIndex, endBlockIndex, segmentType, source, title, notesMd, createdBy,
      })
      response.status(201).json(segment)
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** PATCH /api/segments/:id */
  async updateSegment({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const body = request.body()
      const { segmentType, state, title, notesMd } = body
      const segment = await bs.updateSegment(id as string, { segmentType, state, title, notesMd })
      if (!segment) {
        response.status(404).json({ error: 'Segment not found' })
        return
      }
      response.json(segment)
      try {
        bsRedis.initRedis()
        await bsRedis.invalidateProjection(segment.snapshot_id)
      } catch (_) { /* non-fatal */ }
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** DELETE /api/segments/:id */
  async deleteSegment({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const result = await bs.supersedeSegment(id as string)
      response.json(result)
      try {
        const { rows } = await q(
          `SELECT snapshot_id FROM nebula.segments_history WHERE id = ? AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
          [id]
        )
        if (rows.length > 0) {
          bsRedis.initRedis()
          await bsRedis.invalidateProjection(rows[0].snapshot_id)
          await bsRedis.invalidateGraph(rows[0].snapshot_id)
        }
      } catch (_) { /* non-fatal */ }
    } catch (e: any) {
      const status = e.message === 'Segment not found' ? 404 : 500
      const { status: s, body } = err(e, status)
      response.status(s).json(body)
    }
  }

  /** POST /api/projection-overrides */
  async createProjectionOverride({ request, response }: HttpContext) {
    try {
      const body = request.body()
      const { conversationId, snapshotId, targetType, targetId, projectionTarget, overrideType, reasonCode, notesMd, source, createdBy } = body
      if (!conversationId || !snapshotId || !targetId) {
        response.status(400).json({ error: 'conversationId, snapshotId, and targetId are required' })
        return
      }
      try {
        bsRedis.initRedis()
        await bsRedis.invalidateProjection(body.snapshotId, body.projectionTarget || 'BP')
      } catch (_) { /* non-fatal */ }
      const override = await bs.createProjectionOverride({
        conversationId, snapshotId, targetType, targetId, projectionTarget, overrideType, reasonCode, notesMd, source, createdBy,
      })
      response.status(201).json(override)
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** DELETE /api/projection-overrides/:id */
  async deleteProjectionOverride({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const result = await bs.removeProjectionOverride(id as string)
      response.json(result)
      try {
        const { rows } = await q(
          `SELECT snapshot_id, projection_target FROM nebula.projection_overrides_history WHERE id = ? AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
          [id]
        )
        if (rows.length > 0) {
          bsRedis.initRedis()
          await bsRedis.invalidateProjection(rows[0].snapshot_id, rows[0].projection_target)
        }
      } catch (_) { /* non-fatal */ }
    } catch (e: any) {
      const status = e.message === 'Override not found' ? 404 : 500
      const { status: s, body } = err(e, status)
      response.status(s).json(body)
    }
  }

  /** GET /api/snapshots/:id/projection */
  async snapshotProjection({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const tq = request.qs().target
      const target = (typeof tq === 'string' ? tq : undefined) || 'BP'
      try {
        bsRedis.initRedis()
        const cached = await bsRedis.getCachedProjection(id as string, target)
        if (cached) {
          response.json(cached)
          return
        }
      } catch (_) { /* cache miss — fall through to PG */ }
      const result = await bs.getProjection(id as string, target)
      response.json(result)
      try {
        await bsRedis.cacheProjection(id as string, target, result)
      } catch (_) { /* non-fatal */ }
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }

  /** GET /api/snapshots/:id/references */
  async snapshotReferences({ request, response }: HttpContext) {
    try {
      const { id } = request.params()
      const qs = request.qs()
      const sq = qs.state
      const eq = qs.edgeType
      const state = typeof sq === 'string' ? sq : undefined
      const edgeType = typeof eq === 'string' ? eq : undefined
      const mq = qs.minConfidence
      const minConfidence = typeof mq === 'string' ? parseFloat(mq) : undefined
      const result = await bs.listReferences(id as string, { state, edgeType, minConfidence })
      response.json(result)
    } catch (e: any) {
      const { status, body } = err(e)
      response.status(status).json(body)
    }
  }
}
