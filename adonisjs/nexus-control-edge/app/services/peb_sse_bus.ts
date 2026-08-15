import { EventEmitter } from 'node:events'

// Mirrors peb-srv/src/lib/sse-bus.js: minimal in-process SSE fan-out bus.
// Subscribers get notified whenever governance_events are written (via
// POST /api/peb/events/:receipt_id/replay) or whenever the poller sees a
// row newer than the last-seen cursor.

export const PEB_EVENTS = 'peb:event'

class SseBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(50)
  }

  push(eventType: string, payload: Record<string, unknown>): void {
    this.emit(PEB_EVENTS, {
      type: eventType,
      payload,
      emitted_at: new Date().toISOString(),
    })
  }
}

export const sseBus = new SseBus()

// Convert an SSE-resident event object into the wire format
// `event: <type>\ndata: <json>\n\n` per the SSE spec.
export function formatSseMessage(event: { type: string; payload?: unknown }): string {
  const data = JSON.stringify(event.payload ?? {})
  return `event: ${event.type}\ndata: ${data}\n\n`
}
