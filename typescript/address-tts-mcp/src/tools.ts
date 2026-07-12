/** TTS MCP tool definitions and handlers — proxies to the TTS REST API on port 8600 */

import { createError, createSuccess } from "./errors";

// ── Configuration ───────────────────────────────────────────────────

const TTS_URL = process.env.TTS_URL || "http://localhost:8600";

// ── Type definitions ────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

type ToolHandler = (args: Record<string, any>) => Promise<any>;

// ── Tool registry ───────────────────────────────────────────────────

export const toolDefinitions: MCPToolDefinition[] = [
  {
    name: "tts_synthesize",
    description:
      "Synthesize text to speech using Piper TTS. Returns audio path, URL, engine info, and duration. Use 'play: true' to play audio immediately on the server.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Text to synthesize and speak",
        },
        play: {
          type: "boolean",
          description: "Whether to play the audio immediately (default true)",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "tts_speak",
    description:
      "Speak the latest state of a work request. Queries conduit.work_request_events and conduit.work_request_state to build a spoken summary of the current state and recent event history.",
    inputSchema: {
      type: "object",
      properties: {
        work_request_id: {
          type: "string",
          description: "UUID of the work request to narrate",
        },
        play: {
          type: "boolean",
          description: "Whether to play the audio immediately (default true)",
        },
      },
      required: ["work_request_id"],
    },
  },
  {
    name: "tts_health",
    description:
      "Check the TTS server health — returns status, queue size, engine, and audio cache path.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// ── HTTP helpers ─────────────────────────────────────────────────────

async function ttsPost(endpoint: string, body: Record<string, any>): Promise<any> {
  const url = `${TTS_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000), // 60s timeout for synthesis
    });
  } catch (err: any) {
    throw createError("TTS_UNREACHABLE", `Cannot reach TTS server at ${TTS_URL}: ${err.message}`);
  }

  const data = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw createError(
      "TTS_ERROR",
      data.error || `TTS server returned ${response.status}`,
      data,
    );
  }
  return data;
}

async function ttsGet(endpoint: string): Promise<any> {
  const url = `${TTS_URL}${endpoint}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    throw createError("TTS_UNREACHABLE", `Cannot reach TTS server at ${TTS_URL}: ${err.message}`);
  }

  const data = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw createError(
      "TTS_ERROR",
      data.error || `TTS server returned ${response.status}`,
      data,
    );
  }
  return data;
}

// ── Handler registry ────────────────────────────────────────────────

const handlers: Record<string, ToolHandler> = {
  tts_synthesize: async (args) => {
    const { text, play } = args;
    if (!text || typeof text !== "string") {
      return createError("INVALID_ARGUMENTS", "text is required and must be a string");
    }
    const data = await ttsPost("/synthesize", { text, play: play ?? true });
    return createSuccess(data);
  },

  tts_speak: async (args) => {
    const { work_request_id, play } = args;
    if (!work_request_id || typeof work_request_id !== "string") {
      return createError("INVALID_ARGUMENTS", "work_request_id is required and must be a string");
    }
    const data = await ttsPost("/speak", { work_request_id, play: play ?? true });
    return createSuccess(data);
  },

  tts_health: async () => {
    const data = await ttsGet("/health");
    return createSuccess(data);
  },
};

// ── Dispatch ────────────────────────────────────────────────────────

export async function handleToolCall(
  toolName: string,
  args: Record<string, any>,
): Promise<any> {
  const handler = handlers[toolName];
  if (!handler) {
    return createError("TOOL_NOT_FOUND", `Unknown tool: ${toolName}`);
  }
  try {
    return await handler(args);
  } catch (err: any) {
    if (err?.error?.code) return err; // already an AppError
    console.error(`[address-tts-mcp] Error in ${toolName}:`, err);
    return createError("INTERNAL_ERROR", err.message || "Internal server error");
  }
}
