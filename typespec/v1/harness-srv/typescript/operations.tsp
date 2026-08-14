/**
 * harness-srv — TypeSpec Operations
 *
 * Reverse-engineered from typescript/harness-srv/src/index.ts.
 * Generic execution harness: merges Tackle role context (prompt + tool ACL +
 * procedure cards) with Wind task context, then invokes an agent via the
 * configured harness (opencode CLI or ollama HTTP API).
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

namespace org.nexus.harnesssrv {

  // ========================================================================
  // Execution
  // ========================================================================

  @route("/run")
  @post
  @doc("Resolve Wind task context and execute an agent via the configured harness. Optionally dry-run with resolve_only=true.")
  op run(@body body: RunRequest): RunResponse | HarnessErrorResponse;

  @route("/run-direct")
  @post
  @doc("Run an agent with a raw, pre-assembled prompt — no Wind task resolution. Used by interactive conversation turns (Duality/Plurality).")
  op runDirect(@body body: RunDirectRequest): RunDirectResponse | HarnessErrorResponse;

  @route("/resolve-context")
  @post
  @doc("Resolve Wind task context without executing (dry run for debugging).")
  op resolveContext(@body body: ResolveContextRequest): ResolveContextResponse | HarnessErrorResponse;

  // ========================================================================
  // Observability
  // ========================================================================

  @route("/sessions")
  @get
  @doc("List active harness sessions tracked by the runaway watchdog.")
  op sessions(): SessionsResponse;

  @route("/health")
  @get
  @doc("Health check; verifies PostgreSQL and Redis connectivity.")
  op health(): HealthResponse | HarnessErrorResponse;
}
