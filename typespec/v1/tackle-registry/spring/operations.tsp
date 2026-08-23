/**
 * tackle-registry — TypeSpec Operations (v1, implemented surface only)
 *
 * Scope boundary: registry READS + role resolution + HTTP inference.
 * Deliberately NOT in v1 (tracked as future scope, see D-2026-08-23-C):
 *   - tackle-srv write ops (POST/DELETE provider|model|harness|role|bundle,
 *     import, seed-defaults)
 *   - validate / verify / test-invoke session flow
 *   - prompts, tasks, scheduler, memory, projections, failure-recovery,
 *     logs, tool-access routers
 */
import "@typespec/http";
import "./models.tsp";

using Http;

namespace org.nexus.tackleregistry {

  @route("/config/providers")
  @get
  @doc("List AI providers from the tackle schema.")
  op listProviders(): Provider[];

  @route("/config/harnesses")
  @get
  @doc("List invocation harnesses.")
  op listHarnesses(): Harness[];

  @route("/config/models")
  @get
  @doc("List models.")
  op listModels(): ModelRow[];

  @route("/config/roles")
  @get
  @doc("List governance roles.")
  op listRoles(): RoleRow[];

  @route("/config/bundles")
  @get
  @doc("List all config bundles ordered by role and priority.")
  op listBundles(): ConfigBundle[];

  @route("/config/bundles/{role}")
  @get
  @doc("List config bundles for one role.")
  op listBundlesForRole(@path role: string): ConfigBundle[];

  @route("/config/resolve/{role}")
  @get
  @doc("Resolve the winning active bundle for a role (mirrors tackle-srv getResolvedRoleConfig).")
  op resolveRole(@path role: string): ResolvedRoleConfig | ErrorResponse;

  // ── Inference ─────────────────────────────────────────────────────

  @route("/ai/invoke")
  @post
  @doc("Run a prompt through the resolved bundle (role mode) or an explicit provider (direct mode). CLI-harness provider types are refused with 415.")
  op invoke(@body body: InvokeRequest): InvokeResponse | ErrorResponse;

  @route("/ai/invoke/capabilities")
  @get
  @doc("Which provider types this service can serve over HTTP.")
  op capabilities(): CapabilitiesResponse;

  // ── Diagnostics / hello-world ─────────────────────────────────────

  @route("/ai/ping")
  @get
  @doc("Liveness probe; never touches a model.")
  op ping(): PingResponse;

  @route("/ai/hello")
  @get
  @doc("Spring AI hello-world one-shot; degrades gracefully without configured providers.")
  op hello(@query name?: string): HelloResponse | ErrorResponse;

  @route("/ai/models")
  @get
  @doc("Introspect ChatModel beans auto-configured by Spring AI.")
  op aiModels(): ModelsResponse;
}
