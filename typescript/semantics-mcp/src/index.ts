import express from "express";
import cors from "cors";
import { loadEnv } from "./env";
import { toolDefinitions, handleToolCall } from "./tools";
import { meta } from "./semantics-client";
import { startHeartbeat } from "heartbeat-client";

// ── Load .env ────────────────────────────────────────────────────────
loadEnv();

const PORT = parseInt(process.env.SEMANTICS_MCP_PORT || "3161", 10);
// Service id in the service-registry (port 8085) — registered 2026-08-03 (id 61).
const HEARTBEAT_SERVICE_ID = parseInt(process.env.SEMANTICS_MCP_SERVICE_ID || "61", 10);

// ── Process-level safety net ─────────────────────────────────────────
process.on("uncaughtException", (err: Error & { code?: string }) => {
  if (err.code === "EADDRINUSE") {
    console.error(`semantics-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === "EPIPE" || err.code === "ECONNRESET" || err.code === "ETIMEDOUT") {
    console.warn("[semantics-mcp] uncaughtException (connection noise):", err.code, err.message);
    return;
  }
  console.error("[semantics-mcp] uncaughtException:", err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
});

const app = express();
app.use(cors());
app.use(express.json());

// ── MCP JSON-RPC endpoint (POST /) ──────────────────────────────────
// Standard MCP protocol via Streamable-HTTP-style transport (same shape as
// assembly-mcp): tools/list, tools/call, health.
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

  if (method === "health") {
    return res.json({ status: "ok", port: PORT });
  }

  return res.status(400).json({
    jsonrpc: "2.0",
    id: id || null,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});

// ── Health check ────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", port: PORT });
});

// ── State endpoint — delegates to semantics-srv REST API ────────────
app.get("/state", async (_req, res) => {
  try {
    const m = await meta();
    res.json({
      status: "ok",
      port: PORT,
      tables: Array.isArray(m.tables) ? m.tables.length : 0,
      procs: m.procs ?? 0,
      backend: "semantics-srv (REST)",
    });
  } catch (err: any) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────
async function main() {
  console.log("[semantics-mcp] Starting (no SQL dependency — delegates to semantics-srv REST)...");
  const server = app.listen(PORT, () => {
    console.log(`[semantics-mcp] Server running on http://localhost:${PORT}`);
    console.log(`[semantics-mcp] MCP endpoint: POST http://localhost:${PORT}/`);

    if (HEARTBEAT_SERVICE_ID > 0) {
      startHeartbeat({
        serviceId: HEARTBEAT_SERVICE_ID,
        serviceName: "semantics-mcp",
        interval: 30,
        log: (...args: any[]) => console.log(new Date().toISOString(), "[heartbeat semantics-mcp]", ...args),
      });
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`semantics-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error("semantics-mcp: listen error:", err.message);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[semantics-mcp] Fatal startup error:", err);
  process.exit(1);
});
