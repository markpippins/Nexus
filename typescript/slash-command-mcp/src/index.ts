/**
 * slash-command-mcp — Phase-2 DSL MCP server.
 *
 * Streamable-HTTP-style MCP endpoint (same shape as semantics-mcp):
 *   POST /   → JSON-RPC tools/list, tools/call, health
 *   GET /health
 *
 * Port 3220 (see start-nexus-services.sh ports table).
 * Exposes 3 tools: command_lookup, command_execute, command_completions.
 * Reads mcp.command_registry (canonical), executes through tools-aggregator.
 */

import express from "express";
import cors from "cors";
import { toolDefinitions, handleToolCall } from "./tools";
import { startHeartbeat } from "heartbeat-client";

const PORT = parseInt(process.env.SLASH_MCP_PORT || "3220", 10);
const HEARTBEAT_SERVICE_ID = parseInt(process.env.SLASH_MCP_SERVICE_ID || "0", 10);

// ── Process-level safety net (mirrors semantics-mcp) ───────────────
process.on("uncaughtException", (err: Error & { code?: string }) => {
  if (err.code === "EADDRINUSE") {
    console.error(`slash-command-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === "EPIPE" || err.code === "ECONNRESET" || err.code === "ETIMEDOUT") {
    console.warn("[slash-command-mcp] uncaughtException (connection noise):", err.code, err.message);
    return;
  }
  console.error("[slash-command-mcp] uncaughtException:", err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
});

const app = express();
app.use(cors());
app.use(express.json());

// ── MCP JSON-RPC endpoint (POST /) ─────────────────────────────────
app.post("/", express.json(), async (req, res) => {
  const { method, params, id } = req.body || {};

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

  if (method === "health") {
    return res.json({ status: "ok", port: PORT });
  }

  return res.status(400).json({
    jsonrpc: "2.0",
    id: id || null,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});

// ── Health check ───────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", port: PORT });
});

// ── Start ──────────────────────────────────────────────────────────
async function main() {
  console.log("[slash-command-mcp] Starting (reads mcp.command_registry, executes via tools-aggregator)...");
  console.log(`[slash-command-mcp] Attempting to listen on port ${PORT}`);
  
  const server = app.listen(PORT, () => {
    console.log(`[slash-command-mcp] Server running on http://localhost:${PORT}`);
    console.log(`[slash-command-mcp] MCP endpoint: POST http://localhost:${PORT}/`);

    if (HEARTBEAT_SERVICE_ID > 0) {
      startHeartbeat({
        serviceId: HEARTBEAT_SERVICE_ID,
        serviceName: "slash-command-mcp",
        interval: 30,
        log: (...args: any[]) => console.log(new Date().toISOString(), "[heartbeat slash-command-mcp]", ...args),
      });
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(`[slash-command-mcp] Server error:`, err);
    if (err.code === "EADDRINUSE") {
      console.error(`slash-command-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error("slash-command-mcp: listen error:", err.message);
    }
    process.exit(1);
  });

  console.log(`[slash-command-mcp] Listen call completed`);
}

main().catch((err) => {
  console.error("[slash-command-mcp] Fatal startup error:", err);
  process.exit(1);
});
