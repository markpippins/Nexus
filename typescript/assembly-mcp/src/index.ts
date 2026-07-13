import express from "express";
import cors from "cors";
import { loadEnv } from "./env";
import { initDb } from "./db";
import { toolDefinitions, handleToolCall } from "./tools";

// ── Load .env ───────────────────────────────────────────────────────
loadEnv();

const PORT = parseInt(process.env.ASSEMBLY_MCP_PORT || "3107", 10);

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

app.get("/state", async (_req, res) => {
  try {
    const { getDb } = await import("./db");
    const pool = getDb();
    const { rows } = await pool.query(
      `SELECT COUNT(*) as forum_count FROM assembly.forums`
    );
    res.json({
      status: "ok",
      port: PORT,
      forums: parseInt(rows[0]?.forum_count || "0", 10),
    });
  } catch (err: any) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Start ───────────────────────────────────────────────────────────
async function main() {
  console.log("[assembly-mcp] Initialising database...");
  await initDb();
  console.log("[assembly-mcp] Database ready.");

  app.listen(PORT, () => {
    console.log(`[assembly-mcp] Server running on http://localhost:${PORT}`);
    console.log(`[assembly-mcp] MCP endpoint: POST http://localhost:${PORT}/`);
  });
}

main().catch((err) => {
  console.error("[assembly-mcp] Fatal startup error:", err);
  process.exit(1);
});
