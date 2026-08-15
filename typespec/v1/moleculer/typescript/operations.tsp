/**
 * moleculer — TypeSpec Operations
 *
 * Reverse-engineered from moleculer/search/services/api.service.ts +
 * google-search.service.ts.
 * Moleculer service bus: the search API gateway (moleculer-web) exposes the
 * modular search providers (Google Custom Search) as REST endpoints under
 * /api, and registers with the Spring Service Registry with heartbeats.
 *
 * Convention (see typespec/v1/typescript-conventions.md):
 *   - one op per route
 *   - flat full-path `@route` decorators (moleculer `path` prefix + alias
 *     sub-path are concatenated by the reconciler)
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.moleculer {

  // ========================================================================
  // Search
  // ========================================================================

  @route("/api/search/simple")
  @post
  @doc("Execute a Google Custom Search query. Pagination via the page/size params.")
  op simpleSearch(@body body: SearchRequest): SearchResponse;

  // ========================================================================
  // Health
  // ========================================================================

  @route("/api/health")
  @get
  @doc("Health check for the Moleculer API gateway.")
  op health(): MoleculerHealthResponse;
}
