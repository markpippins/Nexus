/** UI Tools MCP tool definitions and handlers — proxies to the ui-tools REST API on port 3125 */

import { createError, createSuccess } from "./errors";

// ── Configuration ───────────────────────────────────────────────────

const API_URL = process.env.UI_TOOLS_API_URL || "http://localhost:3125/api";

// ── Type definitions ────────────────────────────────────────────────

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

type ToolHandler = (args: Record<string, any>) => Promise<any>;

// ── HTTP helpers ─────────────────────────────────────────────────────

async function apiFetch(method: string, path: string, body?: Record<string, any>): Promise<any> {
  const url = `${API_URL}${path}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err: any) {
    throw createError("API_UNREACHABLE", `Cannot reach ui-tools API at ${API_URL}: ${err.message}`);
  }

  const data = (await response.json()) as Record<string, any>;
  if (!response.ok) {
    throw createError(
      "API_ERROR",
      data.error || `ui-tools API returned ${response.status}`,
      data,
    );
  }
  return data;
}

// ── Tool registry ───────────────────────────────────────────────────

export const toolDefinitions: MCPToolDefinition[] = [
  {
    name: "list_links",
    description:
      "List all statusbar links and separators from the throttler.links table. Returns id, address, imagename, text, type, and sortOrder for each item, ordered by sort_order.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "add_link",
    description:
      "Add a new link to the statusbar button box. Creates a new entry in throttler.links. The link will appear at the end of the button bar.",
    inputSchema: {
      type: "object",
      properties: {
        address: {
          type: "string",
          description: "URL for the link (e.g., https://console.cloud.google.com)",
        },
        imagename: {
          type: "string",
          description: "Short image name used to fetch the icon from the image server (e.g., google-cloud-console)",
        },
        text: {
          type: "string",
          description: "Optional display text for the tooltip",
        },
      },
      required: ["address", "imagename"],
    },
  },
  {
    name: "edit_link",
    description:
      "Edit an existing link's properties. Can update address, imagename, text, or type. Use type='separator' to convert a link into a separator.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "UUID of the link to edit",
        },
        address: {
          type: "string",
          description: "New URL for the link",
        },
        imagename: {
          type: "string",
          description: "New image name for the icon",
        },
        text: {
          type: "string",
          description: "New display text for tooltip",
        },
        type: {
          type: "string",
          description: "Type of item: 'link' or 'separator'",
          enum: ["link", "separator"],
        },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_link",
    description:
      "Delete a link or separator from the statusbar by its UUID.",
    inputSchema: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "UUID of the link to delete",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "add_separator",
    description:
      "Add a visual separator to the statusbar button box. Separators create visual groupings between links.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "reorder_links",
    description:
      "Reorder links and separators in the statusbar. Provide an ordered array of { id, sortOrder } pairs. All items must be included.",
    inputSchema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "Array of { id: string, sortOrder: number } pairs in the desired order",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              sortOrder: { type: "number" },
            },
            required: ["id", "sortOrder"],
          },
        },
      },
      required: ["items"],
    },
  },
];

// ── Handler registry ────────────────────────────────────────────────

const handlers: Record<string, ToolHandler> = {
  list_links: async () => {
    const data = await apiFetch("GET", "/links");
    return createSuccess({ links: data, count: data.length });
  },

  add_link: async (args) => {
    const { address, imagename, text } = args;
    if (!address || typeof address !== "string") {
      return createError("INVALID_ARGUMENTS", "address is required and must be a string");
    }
    if (!imagename || typeof imagename !== "string") {
      return createError("INVALID_ARGUMENTS", "imagename is required and must be a string");
    }
    const data = await apiFetch("POST", "/links", { address, imagename, text: text || null, type: "link" });
    return createSuccess(data);
  },

  edit_link: async (args) => {
    const { id, address, imagename, text, type } = args;
    if (!id || typeof id !== "string") {
      return createError("INVALID_ARGUMENTS", "id is required and must be a string");
    }
    const changes: Record<string, any> = {};
    if (address !== undefined) changes.address = address;
    if (imagename !== undefined) changes.imagename = imagename;
    if (text !== undefined) changes.text = text;
    if (type !== undefined) changes.type = type;
    if (Object.keys(changes).length === 0) {
      return createError("INVALID_ARGUMENTS", "At least one field to change is required");
    }
    const data = await apiFetch("PATCH", `/links/${id}`, changes);
    return createSuccess(data);
  },

  delete_link: async (args) => {
    const { id } = args;
    if (!id || typeof id !== "string") {
      return createError("INVALID_ARGUMENTS", "id is required and must be a string");
    }
    await apiFetch("DELETE", `/links/${id}`);
    return createSuccess({ ok: true, deleted: id });
  },

  add_separator: async () => {
    const data = await apiFetch("POST", "/links", {
      address: "",
      imagename: "",
      type: "separator",
    });
    return createSuccess(data);
  },

  reorder_links: async (args) => {
    const { items } = args;
    if (!Array.isArray(items) || items.length === 0) {
      return createError("INVALID_ARGUMENTS", "items must be a non-empty array of { id, sortOrder }");
    }
    const data = await apiFetch("PATCH", "/links/reorder", { items });
    return createSuccess({ links: data, count: data.length });
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
    if (err?.error?.code) return err;
    console.error(`[ui-tools-mcp] Error in ${toolName}:`, err);
    return createError("INTERNAL_ERROR", err.message || "Internal server error");
  }
}
