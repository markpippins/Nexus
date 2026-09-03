import express from "express";
import cors from "cors";
import knowledgeRouter from "./routes/knowledge.js";
import { startHeartbeat } from "heartbeat-client";

const PORT = parseInt(process.env.PORT || "3109", 10);

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`knowledge-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[knowledge-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[knowledge-srv] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// All knowledge routes mounted under /knowledge
app.use("/knowledge", knowledgeRouter);

// Root health check
app.get("/", (_req, res) => {
  res.json({
    name: "knowledge-srv",
    version: "1.0.0",
    port: PORT,
    source: "knowledge.postgres (graph_entities, graph_edges, graph_cross_references, graph_migrations)",
    endpoints: [
      "GET  /knowledge/entities",
      "POST /knowledge/entities",
      "GET  /knowledge/entities/:section/:entity_id",
      "PUT  /knowledge/entities/:section/:entity_id",
      "DELETE /knowledge/entities/:section/:entity_id",
      "DELETE /knowledge/entities?section=...  (purge section)",
      "GET  /knowledge/entities/:section/:entity_id/relations",
      "GET  /knowledge/edges",
      "POST /knowledge/edges",
      "DELETE /knowledge/edges/:id",
      "GET  /knowledge/cross-references",
      "POST /knowledge/cross-references",
      "DELETE /knowledge/cross-references/:id",
      "GET  /knowledge/migrations",
      "GET  /knowledge/summary",
      "GET  /health",
    ],
  });
});

app.get("/health", async (_req, res) => {
  try {
    const { query } = await import("./db/client.js");
    const r = await query("SELECT 1 AS ok");
    res.json({ status: "healthy", port: PORT, db: r[0]?.ok === 1 ? "up" : "unknown" });
  } catch (err: any) {
    res.status(503).json({ status: "unhealthy", error: err?.message ?? String(err) });
  }
});

const server = app.listen(PORT, () => {
  console.log(`knowledge-srv listening on http://localhost:${PORT}`);
  console.log(`  Entities:        http://localhost:${PORT}/knowledge/entities`);
  console.log(`  Edges:           http://localhost:${PORT}/knowledge/edges`);
  console.log(`  Cross-references: http://localhost:${PORT}/knowledge/cross-references`);
  console.log(`  Migrations:      http://localhost:${PORT}/knowledge/migrations`);
  console.log(`  Summary:         http://localhost:${PORT}/knowledge/summary`);
  console.log(`  Health:          http://localhost:${PORT}/health`);

  // Register with service-registry (port 8085) via heartbeat-client.
  startHeartbeat({
    serviceId: 109,
    serviceName: "knowledge-srv",
    interval: 30,
    log: (...args: any[]) => console.log(new Date().toISOString(), "[heartbeat knowledge-srv]", ...args),
  });
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`knowledge-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
  } else {
    console.error('knowledge-srv: listen error:', err.message);
  }
  process.exit(1);
});
