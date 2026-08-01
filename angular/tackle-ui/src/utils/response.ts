// Inlined from @nexus/shared-react/utils/response — the shared package is
// the reference implementation. This copy exists so the app compiles
// standalone (e.g. after a Google AI Studio pull). Keep in sync; streamline
// back to `@nexus/shared-react/utils/response` once GAIS contributions settle.

// Shared response-body unwrapping for all nexus UIs.
// Backends envelope list endpoints as { count, <key>: [...] } and error
// responses as { error: 'msg' } or { error: { code, message } } — normalize
// both so UI callers always get a plain array / a readable message.

/** Unwrap a list response that may be a bare array or wrapped under a key. */
// T defaults to `any` (not `unknown`) so callers passing untyped JSON get a
// type assignable to their typed state setters; annotate explicitly with
// `unwrapList<T>(...)` when desired.
export function unwrapList<T = any>(data: unknown, key?: string): T[] {
  if (Array.isArray(data)) return data as T[];
  if (key && data && typeof data === 'object') {
    const list = (data as Record<string, unknown>)[key];
    if (Array.isArray(list)) return list as T[];
  }
  return [];
}

/**
 * Extract a readable message from any backend error-envelope shape:
 * a plain string body, { error: 'msg' }, { error: { code, message } },
 * { message }, or { detail }. Falls back to `fallback` when nothing usable.
 */
export function unwrapErrorMessage(body: unknown, fallback = 'Request failed'): string {
  if (typeof body === 'string') return body.trim() || fallback;
  if (!body || typeof body !== 'object') return fallback;
  const b = body as Record<string, unknown>;
  if (typeof b.error === 'string' && b.error.trim()) return b.error;
  if (b.error && typeof b.error === 'object') {
    const e = b.error as Record<string, unknown>;
    if (typeof e.message === 'string' && e.message.trim()) return e.message;
    if (typeof e.code === 'string' && e.code.trim()) return e.code;
  }
  if (typeof b.message === 'string' && b.message.trim()) return b.message;
  if (typeof b.detail === 'string' && b.detail.trim()) return b.detail;
  return fallback;
}
