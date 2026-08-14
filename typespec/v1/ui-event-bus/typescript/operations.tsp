/**
 * ui-event-bus — TypeSpec Operations
 *
 * Reverse-engineered from typescript/ui-event-bus/src/index.ts.
 * In-memory Server-Sent Events (SSE) fan-out bus: UI clients publish named
 * events, which are broadcast to every connected SSE client except the sender
 * (self-event filtering).
 *
 * Convention (see typespec/v1/typescript-conventions.md):
 *   - one op per route
 *   - flat full-path `@route` decorators (no nesting — the reconciler does not
 *     concatenate nested routes)
 *   - Express `:param` mapped to TypeSpec `{param}`
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.uieventbus {

  // ========================================================================
  // Event publication
  // ========================================================================

  @route("/api/events")
  @post
  @doc("Publish a named UI event. Broadcast to all connected SSE clients except the sender (self-event filtering).")
  op publish(@body event: PublishEventRequest): PublishResult | ErrorResponse;

  // ========================================================================
  // SSE subscription
  // ========================================================================

  @route("/api/events/stream")
  @get
  @doc("Open a Server-Sent Events stream (text/event-stream). Optional ?sender= tags the connection for self-event filtering. Frames carry UiEvent JSON payloads.")
  op stream(@query sender?: string): UiEvent;

  // ========================================================================
  // Connected client registry (debug surface)
  // ========================================================================

  @route("/api/events/clients")
  @get
  @doc("List connected SSE clients (id, sender, connectedAt).")
  op listClients(): ClientListResponse;

  @route("/api/events/clients/{id}")
  @delete
  @doc("Disconnect a connected SSE client by id.")
  op disconnectClient(@path id: string): DisconnectResult | ErrorResponse;

  // ========================================================================
  // Health
  // ========================================================================

  @route("/health")
  @get
  @doc("Health check; reports status and the current connected-client count.")
  op health(): HealthResponse;
}
