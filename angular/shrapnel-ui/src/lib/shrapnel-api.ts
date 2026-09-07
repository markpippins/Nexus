const STORAGE_KEY = "shrapnel.baseUrl";

// The environment-selected endpoint is authoritative. VITE_SHRAPNEL_SRV_URL
// (set in .env or by the deployment) points at the live shrapnel-srv:3118;
// the old hardcoded default pointed at execution-srv:3110, which made the UI
// display execution data as shrapnel data.
export const DEFAULT_BASE_URL =
  (import.meta.env["VITE_SHRAPNEL_SRV_URL"] as string | undefined) ?? "http://localhost:3118";

// Endpoint overrides are gated: the localStorage override only applies when a
// deployment explicitly opts in via VITE_SHRAPNEL_ALLOW_OVERRIDE=true. Without
// that flag a stale saved URL can never silently mask the .env-selected
// backend (the acceptance requirement).
const ALLOW_OVERRIDE =
  (import.meta.env["VITE_SHRAPNEL_ALLOW_OVERRIDE"] as string | undefined) === "true";

export function getBaseUrl(): string {
  if (typeof window === "undefined") return DEFAULT_BASE_URL;
  if (!ALLOW_OVERRIDE) return DEFAULT_BASE_URL;
  return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_BASE_URL;
}

export function setBaseUrl(url: string) {
  if (typeof window === "undefined") return;
  if (!ALLOW_OVERRIDE) return;
  window.localStorage.setItem(STORAGE_KEY, url.replace(/\/+$/, ""));
}

export type FieldType = {
  code: number;
  name: string;
  description: string;
  pg_type: string;
};

export type ShrapnelField = {
  id: number;
  is_calculated: boolean;
  field_index: number;
  label: string | null;
  name: string;
  property_name: string;
  field_type_code: number;
  created_at: string;
  updated_at: string;
};

export type ObjectInstance = {
  id: number;
  created_at: string;
  values?: Record<string, unknown>;
};

export type Binding = {
  field_id: number;
  property_name: string;
  label: string | null;
  name: string;
  field_type_code: number;
  value_id: number;
  bound_at: string;
};

export type HealthResponse = {
  status: string;
  counts: {
    field_type_count: number;
    field_count: number;
    object_count: number;
    value_count: number;
    binding_count: number;
  };
};

export const TYPE_NAMES: Record<number, string> = {
  1: "Long",
  2: "String",
  3: "Double",
  4: "Boolean",
  5: "Timestamp",
  6: "JSONB",
  7: "UUID",
};

export const TYPE_LIST = Object.entries(TYPE_NAMES).map(([code, name]) => ({
  code: Number(code),
  name,
}));

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new Error(
      `Cannot reach shrapnel-srv at ${getBaseUrl()} — is it running and CORS-enabled?`,
    );
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  health: () => request<HealthResponse>("/health"),
  fieldTypes: () => request<{ field_types: FieldType[] }>("/api/field-types"),
  fields: (params: { limit?: number; offset?: number; type_code?: number }) => {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    if (params.type_code != null) q.set("type_code", String(params.type_code));
    return request<{ fields: ShrapnelField[] }>(`/api/fields?${q}`);
  },
  field: (id: number) => request<{ field: ShrapnelField }>(`/api/fields/${id}`),
  createField: (body: Record<string, unknown>) =>
    request<{ field: ShrapnelField }>("/api/fields", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  objects: (params: { limit?: number; offset?: number; decode?: boolean }) => {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    if (params.decode) q.set("decode", "true");
    return request<{ objects: ObjectInstance[] }>(`/api/objects?${q}`);
  },
  object: (id: number) => request<{ object: ObjectInstance }>(`/api/objects/${id}`),
  objectValues: (id: number) =>
    request<{ object_id: number; values: Binding[] }>(`/api/objects/${id}/values`),
  deleteObject: (id: number) =>
    request<{ deleted: number }>(`/api/objects/${id}`, { method: "DELETE" }),
  encode: (body: unknown) =>
    request<{ object_id: number; fields: unknown[]; decoded: Record<string, unknown> }>(
      "/api/encode",
      { method: "POST", body: JSON.stringify(body) },
    ),
  createObject: (body: unknown) =>
    request<{ object_id: number; fields: unknown[] }>("/api/objects", {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
