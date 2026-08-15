import { EventEmitter } from 'node:events'
import pg from 'pg'

const { Pool } = pg

// Mirrors kernel-srv/src/notify.ts: a dedicated pg client that LISTENs on
// kernel_transition_committed and re-emits events for SSE subscribers.
// LISTEN is multiplexed per-session, so multiple listeners coexist.

const CHANNEL = 'kernel_transition_committed'
const emitter = new EventEmitter()
emitter.setMaxListeners(100)

export interface KernelEvent {
  event_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string
  actor: string
  timestamp: string
}

// ── SSE subscriber registry (so /health can report it) ──
let subscriberCount = 0
export function incSubscriber(): number {
  subscriberCount++
  return subscriberCount
}
export function decSubscriber(): number {
  subscriberCount = Math.max(0, subscriberCount - 1)
  return subscriberCount
}
export function getSubscriberCount(): number {
  return subscriberCount
}

// Dedicated pool — one LISTEN connection, independent of the Lucid pools.
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'pguser',
  password: process.env.PG_PASSWORD || 'pgpass',
  database: process.env.PG_DB_NAME || 'nexus',
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

let client: pg.PoolClient | null = null
let reconnectTimer: NodeJS.Timeout | null = null
let alive = false

export function isNotifyAlive(): boolean {
  return alive
}

export function startNotifyListener(): void {
  connect()
}

function connect(): void {
  pool
    .connect()
    .then((c) => {
      client = c
      c.on('notification', (msg) => {
        if (!msg.payload) return
        try {
          const payload = JSON.parse(msg.payload) as KernelEvent
          emitter.emit('event', payload)
        } catch {
          // ignore malformed payloads
        }
      })
      c.on('error', () => {
        alive = false
        scheduleReconnect()
      })
      c.on('end', () => {
        alive = false
        scheduleReconnect()
      })
      c.query(`LISTEN ${CHANNEL}`)
        .then(() => {
          alive = true
        })
        .catch(() => {
          alive = false
          scheduleReconnect()
        })
    })
    .catch(() => {
      scheduleReconnect()
    })
}

function scheduleReconnect(): void {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    if (client) {
      try {
        client.release()
      } catch {
        // already released
      }
      client = null
    }
    connect()
  }, 5000)
}

export function stopNotifyListener(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (client) {
    try {
      client.release()
    } catch {
      // ignore
    }
    client = null
  }
  alive = false
  void pool.end().catch(() => {})
}

export function subscribe(fn: (evt: KernelEvent) => void): () => void {
  emitter.on('event', fn)
  return () => {
    emitter.off('event', fn)
  }
}
