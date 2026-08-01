// Inlined from @nexus/shared-react/utils/network-errors — the shared package
// is the reference implementation. This copy exists so the app compiles
// standalone (e.g. after a Google AI Studio pull). Keep in sync; streamline
// back to `@nexus/shared-react/utils/network-errors` once GAIS contributions
// settle.

// Shared network-failure mapping for all nexus UIs.
// Browser/Node throw different messages for a network-level fetch failure.
// Map all known ones to one friendly string so alerts never show cryptic text.

export const NETWORK_FAILURE_MESSAGES: readonly string[] = [
  'Failed to fetch', // Chrome/Chromium
  'NetworkError when attempting to fetch resource.', // Firefox
  'fetch failed' // Node (undici)
];

export function isNetworkFailure(e: unknown): boolean {
  return e instanceof Error && NETWORK_FAILURE_MESSAGES.includes(e.message);
}

// Returns an Error with the friendly message for known network failures;
// passes other Errors through unchanged, wraps non-Errors in String(e).
export function friendlyFetchError(e: unknown): Error {
  if (isNetworkFailure(e)) {
    return new Error('Network error - backend unreachable');
  }
  return e instanceof Error ? e : new Error(String(e));
}

// Returns the friendly message string for known network failures, otherwise
// the original Error message (or String(e)) — for callers that build the
// message inline instead of throwing the Error directly.
export function friendlyFetchMessage(e: unknown): string {
  if (isNetworkFailure(e)) {
    return 'Network error - backend unreachable';
  }
  return e instanceof Error ? (e.message || String(e)) : String(e);
}
