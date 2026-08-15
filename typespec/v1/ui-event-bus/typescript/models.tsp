/**
 * ui-event-bus — TypeSpec Models
 *
 * Reverse-engineered from typescript/ui-event-bus/src/index.ts.
 * Domain models for the in-memory SSE fan-out bus. No route or verb decorators
 * live here; the reconciler scans this file and must find none.
 */
namespace org.nexus.uieventbus {

  /** A UI event published by a client and broadcast to SSE subscribers. */
  model UiEvent {
    /** Client or subsystem that emitted the event. */
    sender: string;
    /** Event name (e.g. "navigate", "selection-changed"). */
    eventName: string;
    /** Arbitrary event payload. */
    eventValue?: unknown;
  }

  /** Request body for POST /api/events. */
  model PublishEventRequest {
    /** Client or subsystem that emitted the event (required). */
    sender: string;
    /** Event name (required). */
    eventName: string;
    /** Arbitrary event payload. */
    eventValue?: unknown;
  }

  /** Success response for POST /api/events. */
  model PublishResult {
    /** Always true on success. */
    ok: boolean;
    /** Number of clients the event was broadcast to (sender excluded). */
    sent: int32;
  }

  /** A connected SSE client as reported by GET /api/events/clients. */
  model SseClientInfo {
    /** Randomly assigned client id. */
    @format("uuid")
    id: string;
    /** The ?sender= tag the client connected with (or "unknown"). */
    sender: string;
    /** When the client connected. */
    connectedAt: utcDateTime;
  }

  /** Response for GET /api/events/clients. */
  model ClientListResponse {
    /** Number of connected clients. */
    count: int32;
    /** Connected client details. */
    clients: SseClientInfo[];
  }

  /** Success response for DELETE /api/events/clients/{id}. */
  model DisconnectResult {
    /** Always true on success. */
    ok: boolean;
  }

  /** Response for GET /health. */
  model HealthResponse {
    /** Health status, normally "ok". */
    status: string;
    /** Current connected-client count. */
    connectedClients: int32;
  }

  /** Error body returned for malformed requests or unknown clients. */
  model ErrorResponse {
    /** Human-readable error message. */
    error: string;
  }
}
