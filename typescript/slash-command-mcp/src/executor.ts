/**
 * slash-command-mcp — execution layer (pg-free adapter).
 *
 * D-2026-08-16-002: dispatches a resolved, coerced tool call through the
 * tools-aggregator command-router namespace (POST /commands/execute). The
 * aggregator owns protocol routing (jsonrpc / sse / rest) per-tool, so this
 * server stays transport-agnostic and never touches PostgreSQL.
 */

import type { ToolCallResponse } from "mcp-types";

const AGGREGATOR_URL =
  process.env.AGGREGATOR_URL || "http://localhost:3210";

export class DispatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DispatchError";
  }
}

/**
 * Dispatch a coerced call to the aggregator command-router namespace.
 *
 * @param command tool name as registered (e.g. "nebula_list_agent_records")
 * @param args coerced, validated arguments
 * @returns normalized result payload from the aggregator
 */
export async function dispatchToolCall(
  command: string,
  args: Record<string, any>
): Promise<ToolCallResponse> {
  const endpoint = `${AGGREGATOR_URL.replace(/\/+$/, "")}/commands/execute`;
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ command, args, allowExtra: true }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err: any) {
    throw new DispatchError(
      `Aggregator unreachable at ${endpoint}: ${err.message || err}`
    );
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new DispatchError(
      `Aggregator returned non-JSON (HTTP ${res.status}) from ${endpoint}`
    );
  }

  if (!res.ok) {
    const code = data?.code || "DISPATCH_ERROR";
    const message = data?.error || `HTTP ${res.status}`;
    throw new DispatchError(`[${code}] ${message}`);
  }

  if (data?.error) {
    throw new DispatchError(data.error);
  }

  return data as ToolCallResponse;
}
