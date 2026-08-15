/**
 * wind-srv re-homing (Wave 3.4) — events domain.
 *
 * Ported from nexus/typescript/wind-srv/src/routes/{events,event-types}.js.
 * Event creation broadcasts to NATS (`nexus.wind.v1.events.*`) for
 * real-time subscribers, matching the original nats-listener behavior.
 * NATS is part of the consolidated stack and is live on :4222.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { q } from '#services/nebula_helpers'

const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222'
let nc: any = null

/** Lazily connect to NATS (singleton); returns null if unavailable. */
async function getNatsConnection() {
  if (nc) return nc
  try {
    const { connect } = await import('nats')
    nc = await connect({ servers: NATS_URL, name: 'nexus-control-edge' })
    return nc
  } catch (err: any) {
    console.warn('[wind-events] Cannot connect to NATS:', err.message)
    return null
  }
}

/** Publish an event payload to a NATS subject; no-op fallback if unavailable. */
async function publishToNats(subject: string, payload: Record<string, any>) {
  try {
    const conn = await getNatsConnection()
    if (!conn) {
      console.log(`[wind-events] [STUB] ${subject}:`, JSON.stringify(payload).slice(0, 200))
      return false
    }
    const { JSONCodec } = await import('nats')
    const jc = JSONCodec()
    conn.publish(subject, jc.encode(payload))
    await conn.flush()
    return true
  } catch (err: any) {
    console.warn('[wind-events] Publish error:', err.message)
    return false
  }
}

export default class WindEventController {
  // ── events ────────────────────────────────────────────────────────────

  // List events (with optional filters)
  async listEvents({ request, response }: HttpContext) {
    const { event_type, consumed, limit = 50 } = request.qs()
    let sql = 'SELECT id, event_type, subject, payload, source, created_at, consumed_at, metadata FROM wind.events WHERE 1=1'
    const vals: any[] = []
    let idx = 1

    if (event_type) {
      sql += ` AND event_type = $${idx++}`
      vals.push(event_type)
    }
    if (consumed === 'false') {
      sql += ' AND consumed_at IS NULL'
    } else if (consumed === 'true') {
      sql += ' AND consumed_at IS NOT NULL'
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + idx
    vals.push(parseInt(String(limit), 10) || 50)

    const result = await q(sql, vals)
    return response.json(result.rows)
  }

  // Get single event
  async getEvent({ params, response }: HttpContext) {
    const result = await q(
      'SELECT id, event_type, subject, payload, source, created_at, consumed_at, metadata FROM wind.events WHERE id = $1',
      [params.id]
    )
    if (result.rows.length === 0) return response.status(404).json({ error: 'Event not found' })
    return response.json(result.rows[0])
  }

  // Create event (and broadcast to NATS)
  async createEvent({ request, response }: HttpContext) {
    const { event_type, subject, payload, source } = request.all()
    if (!event_type) return response.status(400).json({ error: 'event_type is required' })

    const result = await q(
      `INSERT INTO wind.events (event_type, subject, payload, source)
       VALUES ($1, $2, $3::jsonb, $4)
       RETURNING id, event_type, subject, payload, source, created_at`,
      [event_type, subject || `nexus.wind.v1.events.${event_type.replace(/\./g, '.')}`, JSON.stringify(payload || {}), source || 'api']
    )
    const event = result.rows[0]

    await publishToNats(event.subject, {
      event_id: event.id,
      event_type: event.event_type,
      source: event.source,
      payload: event.payload,
    })

    return response.status(201).json(event)
  }

  // Poll unconsumed events (FOR UPDATE SKIP LOCKED)
  async pollEvents({ request, response }: HttpContext) {
    const { limit = 10 } = request.all()
    const result = await q(
      `SELECT id, event_type, subject, payload, source, created_at
       FROM wind.events
       WHERE consumed_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [Math.min(parseInt(String(limit), 10) || 10, 100)]
    )
    return response.json(result.rows)
  }

  // ── event-types ───────────────────────────────────────────────────────

  // List event types
  async listEventTypes(_ctx: HttpContext) {
    const result = await q(
      `SELECT et.event_type, et.description, et.schema, et.workflow_id, et.dedup_key_template, et.enabled, et.created_at,
              w.name AS workflow_name
       FROM wind.event_types et
       LEFT JOIN wind.workflows w ON et.workflow_id = w.id
       ORDER BY et.event_type`
    )
    return result.rows
  }

  // Get single event type
  async getEventType({ params, response }: HttpContext) {
    const result = await q('SELECT * FROM wind.event_types WHERE event_type = $1', [params.eventType])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Event type not found' })
    return response.json(result.rows[0])
  }

  // Register a new event type
  async createEventType({ request, response }: HttpContext) {
    const { event_type, description, schema, workflow_id, dedup_key_template, enabled } = request.all()
    if (!event_type) return response.status(400).json({ error: 'event_type is required' })

    const result = await q(
      `INSERT INTO wind.event_types (event_type, description, schema, workflow_id, dedup_key_template, enabled)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6)
       RETURNING *`,
      [event_type, description || '', schema ? JSON.stringify(schema) : null, workflow_id || null, dedup_key_template || null, enabled !== false]
    )
    return response.status(201).json(result.rows[0])
  }

  // Delete event type
  async deleteEventType({ params, response }: HttpContext) {
    const result = await q('DELETE FROM wind.event_types WHERE event_type = $1 RETURNING event_type', [params.eventType])
    if (result.rows.length === 0) return response.status(404).json({ error: 'Event type not found' })
    return response.json({ deleted: result.rows[0].event_type })
  }
}
