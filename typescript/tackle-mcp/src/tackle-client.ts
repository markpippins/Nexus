/**
 * tackle-client.ts — HTTP REST client for tackle-srv (port 3410).
 *
 * All SQL has been extracted from tackle-mcp into tackle-srv. This client
 * wraps every tackle-srv REST endpoint so that tackle-mcp tools.ts handlers
 * can call tackle-srv without any direct pg dependency.
 */

const TACKLE_SRV = process.env.TACKLE_SRV_URL || "http://localhost:3410";

// ── HTTP helpers ─────────────────────────────────────────────────

async function get(path: string): Promise<any> {
  const res = await fetch(`${TACKLE_SRV}${path}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`tackle-srv GET ${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

async function post(path: string, body?: Record<string, any>): Promise<any> {
  const res = await fetch(`${TACKLE_SRV}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`tackle-srv POST ${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

async function patch(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${TACKLE_SRV}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`tackle-srv PATCH ${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

async function del(path: string): Promise<any> {
  const res = await fetch(`${TACKLE_SRV}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`tackle-srv DELETE ${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

// ── AI Config Snapshot ──────────────────────────────────────────

export async function getAIConfigSnapshot(): Promise<any> {
  return get("/config/ai");
}

export async function validateAIConfig(): Promise<{ valid: boolean; warnings: string[] }> {
  return get("/config/ai/validate");
}

export async function seedDefaultAIConfig(force: boolean): Promise<any> {
  return post("/config/ai/seed-defaults", { force });
}

export async function importAIConfig(data: {
  providers: any[];
  harnesses: any[];
  models: any[];
  roles: any[];
  bundles: any[];
}): Promise<any> {
  return post("/config/ai/import", data);
}

// ── Providers ──────────────────────────────────────────────────

export async function getAIProviders(): Promise<any[]> {
  return get("/config/ai/providers");
}

export async function getAIProvider(id: string): Promise<any> {
  return get(`/config/ai/provider/${encodeURIComponent(id)}`);
}

export async function upsertAIProvider(args: {
  id: string; name: string; type: string;
  endpoint_url?: string; api_key?: string; config_json?: string;
}): Promise<any> {
  return post("/config/ai/provider", args);
}

export async function deleteAIProvider(id: string): Promise<any> {
  return del(`/config/ai/provider/${encodeURIComponent(id)}`);
}

// ── Harnesses ──────────────────────────────────────────────────

export async function getAIHarnesses(): Promise<any[]> {
  return get("/config/ai/harnesses");
}

export async function getAIHarness(id: string): Promise<any> {
  return get(`/config/ai/harness/${encodeURIComponent(id)}`);
}

export async function upsertAIHarness(args: {
  id: string; name: string; invocation_semantics?: string;
}): Promise<any> {
  return post("/config/ai/harness", args);
}

export async function deleteAIHarness(id: string): Promise<any> {
  return del(`/config/ai/harness/${encodeURIComponent(id)}`);
}

// ── Models ─────────────────────────────────────────────────────

export async function getAIModels(): Promise<any[]> {
  return get("/config/ai/models");
}

export async function getAIModel(id: string): Promise<any> {
  return get(`/config/ai/model/${encodeURIComponent(id)}`);
}

export async function upsertAIModel(args: {
  id: string; name: string; harness_id: string;
  provider_id?: string; model_identifier: string;
}): Promise<any> {
  return post("/config/ai/model", args);
}

export async function deleteAIModel(id: string): Promise<any> {
  return del(`/config/ai/model/${encodeURIComponent(id)}`);
}

// ── Role Configs ───────────────────────────────────────────────

export async function getAIRoleConfigs(): Promise<any[]> {
  return get("/config/ai/roles");
}

export async function getAIRoleConfig(role: string): Promise<any> {
  return get(`/config/ai/role/${encodeURIComponent(role)}`);
}

export async function upsertAIRoleConfig(args: {
  id: string; role: string; provider_id: string;
  harness_id: string; model_id: string;
  extra_params?: string; bundles?: any[];
}): Promise<any> {
  return post("/config/ai/role", args);
}

export async function deleteAIRoleConfig(role: string): Promise<any> {
  return del(`/config/ai/role/${encodeURIComponent(role)}`);
}

// ── Config Bundles ─────────────────────────────────────────────

export async function getAllConfigBundles(): Promise<any[]> {
  return get("/config/ai/bundles");
}

export async function getConfigBundles(role: string): Promise<any[]> {
  return get(`/config/ai/bundles/${encodeURIComponent(role)}`);
}

export async function getConfigBundle(id: string): Promise<any> {
  return get(`/config/ai/bundle/${encodeURIComponent(id)}`);
}

export async function upsertConfigBundle(args: {
  id: string; name: string; role: string; model_id: string;
  provider_id?: string; harness_id?: string; priority?: number;
  invocation_mode?: string; command?: string; endpoint_url?: string;
  timeout_ms?: number; valid_from?: string; valid_to?: string;
  is_active?: number; metadata?: string;
}): Promise<any> {
  return post("/config/ai/bundle", args);
}

export async function upsertConfigBundles(role: string, bundles: any[]): Promise<any> {
  return post(`/config/ai/bundles/${encodeURIComponent(role)}`, { bundles });
}

export async function deleteConfigBundle(id: string): Promise<any> {
  return del(`/config/ai/bundle/${encodeURIComponent(id)}`);
}

// ── Resolved Config ────────────────────────────────────────────

export async function getResolvedRoleConfig(role: string): Promise<any> {
  return get(`/config/ai/resolve/${encodeURIComponent(role)}`);
}

// ── Failure Recovery ───────────────────────────────────────────

export async function getBreaker(): Promise<any> {
  return get("/config/failure-recovery");
}

export async function saveFailureRecoveryConfig(args: {
  max_retries_per_model?: number;
  retry_delay_seconds?: number;
  max_fallbacks?: number;
  push_back_to_pending?: boolean;
  circuit_breaker_retry_after?: number;
}): Promise<any> {
  return post("/config/failure-recovery", args);
}

// ── Roles Registry ─────────────────────────────────────────────

export async function getRoles(): Promise<any[]> {
  return get("/roles");
}

export async function getRole(id: string): Promise<any> {
  return get(`/roles/${encodeURIComponent(id)}`);
}

export async function upsertRole(args: { id?: string; name: string; description?: string }): Promise<any> {
  return post("/roles", args);
}

export async function deleteRole(id: string): Promise<any> {
  return del(`/roles/${encodeURIComponent(id)}`);
}

// ── Sessions ───────────────────────────────────────────────────

// Note: session management (list/kill) is handled by tackle-srv REST.
// tackle-mcp only serves the SSE log streaming endpoint directly.

// ── Agent Scheduler ────────────────────────────────────────────

export async function listSchedulerEntries(): Promise<any[]> {
  return get("/scheduler");
}

export async function getSchedulerEntry(id: number): Promise<any> {
  return get(`/scheduler/${id}`);
}

export async function getDueSchedulerEntries(): Promise<any[]> {
  return get("/scheduler/due");
}

export async function createSchedulerEntry(args: {
  role: string; model_id?: string; harness?: string;
  agent_config?: string; schedule_type?: string; schedule_value?: number;
  project_dir?: string; enabled?: number;
}): Promise<any> {
  return post("/scheduler", args);
}

export async function updateSchedulerEntry(id: number, fields: Record<string, any>): Promise<any> {
  return patch(`/scheduler/${id}`, fields);
}

export async function deleteSchedulerEntry(id: number): Promise<any> {
  return del(`/scheduler/${id}`);
}

// ── Memory Procedure Registry ──────────────────────────────────

export async function getProceduresForRole(role: string): Promise<any> {
  return get(`/memory/procedures/${encodeURIComponent(role)}`);
}

export async function getProcedureBySlug(slug: string): Promise<any> {
  return get(`/memory/procedure/${encodeURIComponent(slug)}`);
}

export async function checkMemorySince(role: string, since: string): Promise<any> {
  return post("/memory/check-since", { role, since });
}

export async function triggerMemoryRefresh(): Promise<any> {
  return post("/memory/refresh");
}
