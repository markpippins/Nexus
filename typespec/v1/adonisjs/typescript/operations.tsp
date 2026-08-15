/**
 * adonisjs — TypeSpec Operations
 *
 * Reverse-engineered from adonisjs/broker-gateway-proxy/start/routes.ts +
 * app/controllers/proxy_controller.ts.
 * AdonisJS HTTP edge: public-facing reverse proxy in front of the Spring
 * Broker Gateway. Registers with the service registry on startup with
 * periodic heartbeats; forwards all non-health traffic transparently.
 *
 * Convention (see typespec/v1/typescript-conventions.md):
 *   - one op per route
 *   - flat full-path `@route` decorators
 *   - AdonisJS catch-all `router.any('/*')` maps to `@route("/{path}")`
 */
import "@typespec/http";
import "@typespec/rest";
import "./models.tsp";

using Http;
using Rest;

namespace org.nexus.adonisjs {

  // ========================================================================
  // Health
  // ========================================================================

  @route("/health")
  @get
  @doc("Health check for the proxy itself.")
  op health(): ProxyHealthResponse;

  // ========================================================================
  // Transparent proxy (catch-all)
  // ========================================================================

  @route("/{path}")
  @post
  @doc("Transparent proxy: forwards any request to the upstream broker-gateway, preserving method, query, body, and headers.")
  op proxy(@path path: string): unknown;
}
