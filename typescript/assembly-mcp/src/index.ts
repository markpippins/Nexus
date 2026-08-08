import express from "express";
import cors from "cors";
import { loadEnv } from "./env";
import { toolDefinitions, handleToolCall } from "./tools";
import { listForums } from "./assembly-client";

// ── Load .env ───────────────────────────────────────────────────────
loadEnv();

// Note: assembly-mcp uses port 3113 (set via .env or ASSEMBLY_MCP_PORT env).
// Port 3112 is taken by service-broker-mcp. assembly-srv runs on 3107.
const PORT = parseInt(process.env.ASSEMBLY_MCP_PORT || "3113", 10);

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`assembly-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[assembly-mcp] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[assembly-mcp] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

const app = express();
app.use(cors());
app.use(express.json());

// ── MCP JSON-RPC endpoint (POST /) ─────────────────────────────────
// Standard MCP protocol via Streamable HTTP transport.
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

  // Unknown method
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

// ── State endpoint — delegates to assembly-srv REST API ─────────────
app.get("/state", async (_req, res) => {
  try {
    const forums = await listForums();
    res.json({
      status: "ok",
      port: PORT,
      forums: Array.isArray(forums) ? forums.length : 0,
      backend: "assembly-srv (REST)",
    });
  } catch (err: any) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────
async function main() {
  console.log(`[assembly-mcp] Starting (no SQL dependency — delegates to assembly-srv at port 3107)...`);
  const server = app.listen(PORT, () => {
    console.log(`[assembly-mcp] Server running on http://localhost:${PORT}`);
    console.log(`[assembly-mcp] MCP endpoint: POST http://localhost:${PORT}/`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`assembly-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error('assembly-mcp: listen error:', err.message);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[assembly-mcp] Fatal startup error:", err);
  process.exit(1);
});
