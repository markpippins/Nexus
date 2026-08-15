/**
 * ui-tools — TypeSpec Operations
 *
 * Reverse-engineered from typescript/ui-tools/src/index.ts + src/routes.ts.
 * Navigation-link CRUD for the UI (throttler.links table). The links router is
 * mounted at `/api` (`app.use('/api', createRoutes(pool))`), so link routes are
 * served under `/api/links`.
 *
 * Convention (see typespec/v1/typescript-conventions.md):
 *   - one op per route
 *   - flat full-path `@route` decorators
 *   - Express `:param` mapped to TypeSpec `{param}`
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.uitools {

  // ========================================================================
  // Navigation links
  // ========================================================================

  @route("/api/links")
  @get
  @doc("List all navigation links ordered by sort_order ascending.")
  op listLinks(): Link[];

  @route("/api/links")
  @post
  @doc("Create a navigation link. Requires address + imagename when type=link.")
  op createLink(@body body: LinkCreateRequest): Link | ErrorResponse;

  @route("/api/links/reorder")
  @patch
  @doc("Re-order navigation links transactionally. Returns the updated ordered list.")
  op reorderLinks(@body body: ReorderRequest): Link[] | ErrorResponse;

  @route("/api/links/{id}")
  @patch
  @doc("Update a navigation link by id (partial update).")
  op updateLink(@path id: string, @body body: LinkUpdateRequest): Link | OkResponse | ErrorResponse;

  @route("/api/links/{id}")
  @delete
  @doc("Delete a navigation link by id.")
  op deleteLink(@path id: string): OkResponse | ErrorResponse;

  // ========================================================================
  // Health
  // ========================================================================

  @route("/health")
  @get
  @doc("Health check; verifies PostgreSQL connectivity.")
  op health(): HealthResponse | ErrorResponse;
}
