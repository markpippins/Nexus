/** UI Tools MCP server — agent-facing interface for managing statusbar links.
 *
 * Self-contained MCP server that proxies to the ui-tools REST API (port 3125).
 * Agents use this MCP to add, edit, delete, and reorder links in the statusbar.
 */

import express from "express";
import cors from "cors";
import { toolDefinitions, handleToolCall } from "./tools";

const PORT = parseInt(process.env.UI_TOOLS_MCP_PORT || "3136", 10);

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`ui-tools-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[ui-tools-mcp] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[ui-tools-mcp] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

const app = express();
app.use(cors());
app.use(express.json());

// ── MCP JSON-RPC endpoint (POST /) ─────────────────────────────────
app.post("/", express.json(), async (req, res) => {
  const { method, params, id } = req.body;

  if (method === "tools/list") {
    return res.json({
      jsonrpc: "2.0",
      id: id || 1,
      result: { tools: toolDefinitions },
    });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    const result = await handleToolCall(toolName, toolArgs);
    return res.json({
      jsonrpc: "2.0",
      id: id || 1,
      ...result,
    });
  }

  return res.status(400).json({
    jsonrpc: "2.0",
    id: id || null,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});

// ── Health check ────────────────────────────────────────────────────
const API_URL = process.env.UI_TOOLS_API_URL || "http://localhost:3125/api";

app.get("/health", async (_req, res) => {
  try {
    const apiHealth = await fetch(`http://localhost:3125/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    const apiData = await apiHealth.json();
    res.json({
      status: "ok",
      port: PORT,
      api: apiData,
    });
  } catch {
    res.json({
      status: "ok",
      port: PORT,
      api: { status: "unreachable" },
    });
  }
});

// ── Start ───────────────────────────────────────────────────────────
async function main() {
  console.log(`[ui-tools-mcp] API URL: ${API_URL}`);

  const server = app.listen(PORT, () => {
    console.log(`[ui-tools-mcp] Server running on http://localhost:${PORT}`);
    console.log(`[ui-tools-mcp] MCP endpoint: POST http://localhost:${PORT}/`);
    console.log(`[ui-tools-mcp] Tools: ${toolDefinitions.map(t => t.name).join(", ")}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`ui-tools-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error('ui-tools-mcp: listen error:', err.message);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[ui-tools-mcp] Fatal startup error:", err);
  process.exit(1);
});
