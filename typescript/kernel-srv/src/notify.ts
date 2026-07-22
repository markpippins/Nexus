import type { Pool } from 'pg';
import { EventEmitter } from 'events';

// Dedicated pg client that LISTENs to the kernel_transition_committed
// pg_notify channel and re-emits events locally for SSE subscribers.
//
// Conduit already uses this same channel name; we add a second listener.
// LISTEN is multiplexed per-session, so adding subscribers does not
// affect kernel write throughput.

const CHANNEL = 'kernel_transition_committed';
const emitter = new EventEmitter();
emitter.setMaxListeners(100);

export interface KernelEvent {
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor: string;
  timestamp: string;
}

let client: import('pg').PoolClient | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;
let alive = false;

export function isNotifyAlive(): boolean {
  return alive;
}

export function startNotifyListener(pool: Pool): void {
  connect(pool);
}

function connect(pool: Pool): void {
  pool
    .connect()
    .then((c) => {
      client = c;
      c.on('notification', (msg) => {
        if (!msg.payload) return;
        try {
          const payload = JSON.parse(msg.payload) as KernelEvent;
          emitter.emit('event', payload);
        } catch {
          // ignore malformed payloads
        }
      });
      c.on('error', () => {
        alive = false;
        scheduleReconnect(pool);
      });
      c.on('end', () => {
        alive = false;
        scheduleReconnect(pool);
      });
      c.query(`LISTEN ${CHANNEL}`)
        .then(() => {
          alive = true;
        })
        .catch(() => {
          alive = false;
          scheduleReconnect(pool);
        });
    })
    .catch(() => {
      alive = false;
      scheduleReconnect(pool);
    });
}

function scheduleReconnect(pool: Pool): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect(pool);
  }, 2000);
}

export function subscribe(cb: (evt: KernelEvent) => void): () => void {
  emitter.on('event', cb);
  return () => emitter.off('event', cb);
}

export async function stopNotifyListener(): Promise<void> {
  if (client) {
    try {
      client.release();
    } catch {
      // ignore
    }
    client = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  alive = false;
}
