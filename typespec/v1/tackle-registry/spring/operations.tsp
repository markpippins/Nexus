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

  // ── Consumer-compat aliases (D-C step 2, analysis thread 6d97277a) ──
  // tackle-srv mounts its ai-config router at /config/ai/*. Each read op above
  // is ALSO served under /config/ai/* so existing consumers (tackle-ui,
  // tackle-mcp) can repoint at this service without rewriting URL prefixes.
  // Serialization parity (snake_case) is a separate opt-in mode documented in
  // the service README / application.properties.

  @route("/config/ai/providers")
  @get
  @doc("Alias of /config/providers (tackle-srv mount parity).")
  op listProvidersAlias(): Provider[];

  @route("/config/ai/harnesses")
  @get
  @doc("Alias of /config/harnesses (tackle-srv mount parity).")
  op listHarnessesAlias(): Harness[];

  @route("/config/ai/models")
  @get
  @doc("Alias of /config/models (tackle-srv mount parity).")
  op listModelsAlias(): ModelRow[];

  @route("/config/ai/roles")
  @get
  @doc("Alias of /config/roles (tackle-srv mount parity).")
  op listRolesAlias(): RoleRow[];

  @route("/config/ai/bundles")
  @get
  @doc("Alias of /config/bundles (tackle-srv mount parity).")
  op listBundlesAlias(): ConfigBundle[];

  @route("/config/ai/bundles/{role}")
  @get
  @doc("Alias of /config/bundles/{role} (tackle-srv mount parity).")
  op listBundlesForRoleAlias(@path role: string): ConfigBundle[];

  @route("/config/ai/resolve/{role}")
  @get
  @doc("Alias of /config/resolve/{role} (tackle-srv mount parity).")
  op resolveRoleAlias(@path role: string): ResolvedRoleConfig | ErrorResponse;

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
