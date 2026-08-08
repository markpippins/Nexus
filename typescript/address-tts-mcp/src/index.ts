/** Address TTS MCP server — agent-facing interface for the TTS service.
 *
 * Self-contained MCP server that proxies to the TTS REST API (port 8600).
 * No PostgreSQL dependency — the TTS Python server handles all DB queries.
 * Multiple subsystems discover and invoke TTS through this MCP interface.
 */

import express from "express";
import cors from "cors";
import { loadEnv } from "./env";
import { toolDefinitions, handleToolCall } from "./tools";

// ── Load .env ───────────────────────────────────────────────────────
loadEnv();

const PORT = parseInt(process.env.ADDRESS_TTS_MCP_PORT || "3105", 10);

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`address-tts-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[address-tts-mcp] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[address-tts-mcp] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
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

  // Unknown method
  return res.status(400).json({
    jsonrpc: "2.0",
    id: id || null,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
});

// ── Health check ────────────────────────────────────────────────────
const TTS_URL = process.env.TTS_URL || "http://localhost:8600";

app.get("/health", async (_req, res) => {
  try {
    const ttsHealth = await fetch(`${TTS_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    const ttsData = await ttsHealth.json();
    res.json({
      status: "ok",
      port: PORT,
      tts: ttsData,
    });
  } catch {
    res.json({
      status: "ok",
      port: PORT,
      tts: { status: "unreachable" },
    });
  }
});

// ── State ───────────────────────────────────────────────────────────
app.get("/state", async (_req, res) => {
  try {
    const ttsHealth = await fetch(`${TTS_URL}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    const ttsData = await ttsHealth.json();
    res.json({
      status: "ok",
      port: PORT,
      tts_url: TTS_URL,
      tts: ttsData,
    });
  } catch {
    res.status(503).json({
      status: "error",
      port: PORT,
      message: "TTS server unreachable",
    });
  }
});

// ── Start ───────────────────────────────────────────────────────────
async function main() {
  console.log(`[address-tts-mcp] TTS URL: ${TTS_URL}`);

  const server = app.listen(PORT, () => {
    console.log(`[address-tts-mcp] Server running on http://localhost:${PORT}`);
    console.log(`[address-tts-mcp] MCP endpoint: POST http://localhost:${PORT}/`);
    console.log(`[address-tts-mcp] Tools: ${toolDefinitions.map(t => t.name).join(", ")}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`address-tts-mcp: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error('address-tts-mcp: listen error:', err.message);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[address-tts-mcp] Fatal startup error:", err);
  process.exit(1);
});
