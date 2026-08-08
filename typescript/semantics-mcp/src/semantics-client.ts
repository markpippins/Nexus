/**
 * semantics-client.ts — HTTP client for delegating semantics operations to
 * semantics-srv REST API (default port 3160). semantics-mcp has ZERO direct
 * pg dependencies — it is a pure MCP facade over the REST service.
 */

const BASE = process.env.SEMANTICS_SRV_URL || "http://localhost:3160";

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}/api/${path}`, { headers: { Accept: "application/json" } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`semantics-srv GET /api/${path} → ${res.status}`);
  return res.json();
}

async function post(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`semantics-srv POST /api/${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

async function patch(path: string, body: Record<string, any>): Promise<any> {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`semantics-srv PATCH /api/${path} → ${res.status}: ${errText}`);
  }
  return res.json();
}

async function del(path: string): Promise<any> {
  const res = await fetch(`${BASE}/api/${path}`, {
    method: "DELETE",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`semantics-srv DELETE /api/${path} → ${res.status}`);
  return res.json();
}

// ── Generic row operations ───────────────────────────────────────────

export async function listRows(table: string, limit?: number, includeExpired?: boolean) {
  const q = new URLSearchParams();
  if (limit) q.set("limit", String(limit));
  if (includeExpired) q.set("includeExpired", "true");
  const qs = q.toString();
  return get(`${table}${qs ? `?${qs}` : ""}`);
}

export async function getRow(table: string, id: string) {
  return get(`${table}/${encodeURIComponent(id)}`);
}

export async function addRow(table: string, body: Record<string, any>) {
  return post(table, body);
}

export async function updateRow(table: string, id: string, body: Record<string, any>) {
  return patch(`${table}/${encodeURIComponent(id)}`, body);
}

export async function softDeleteRow(table: string, id: string) {
  return del(`${table}/${encodeURIComponent(id)}`);
}

// ── Drift lifecycle ──────────────────────────────────────────────────

export async function resolveDriftFinding(id: string, resolvedAt?: string) {
  return post(`drift_finding/${encodeURIComponent(id)}/resolve`, {
    p_resolved_at: resolvedAt ?? null,
  });
}

// ── Meta ─────────────────────────────────────────────────────────────

export async function meta() {
  return get("meta");
}
