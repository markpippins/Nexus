import express from "express";
import cors from "cors";
import knowledgeRouter from "./routes/knowledge.js";
import { startHeartbeat } from "heartbeat-client";

const PORT = parseInt(process.env.PORT || "3109", 10);

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
      "GET /knowledge/entities",
      "GET /knowledge/entities/:section/:entity_id",
      "GET /knowledge/entities/:section/:entity_id/relations",
      "GET /knowledge/edges",
      "GET /knowledge/cross-references",
      "GET /knowledge/migrations",
      "GET /knowledge/summary",
      "GET /health",
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

app.listen(PORT, () => {
  console.log(`knowledge-srv listening on http://localhost:${PORT}`);
  console.log(`  Entities:        http://localhost:${PORT}/knowledge/entities`);
  console.log(`  Edges:           http://localhost:${PORT}/knowledge/edges`);
  console.log(`  Cross-references: http://localhost:${PORT}/knowledge/cross-references`);
  console.log(`  Migrations:      http://localhost:${PORT}/knowledge/migrations`);
  console.log(`  Summary:         http://localhost:${PORT}/knowledge/summary`);
  console.log(`  Health:          http://localhost:${PORT}/health`);

  // Register with service-registry (port 8085) via heartbeat-client.
  // serviceId 109 = knowledge-srv (port-derived placeholder; chosen as
  // 100 + (port % 100) so it's easy to remember until the registry
  // reveals its real ID convention). Send a heartbeat every 30s; if the
  // service-registry doesn't add / bump our row, the registry will return
  // 404 and the heartbeat will silently retry (handled inside heartbeat-client).
  startHeartbeat({
    serviceId: 109,
    serviceName: "knowledge-srv",
    interval: 30,
    log: (...args: any[]) => console.log(new Date().toISOString(), "[heartbeat knowledge-srv]", ...args),
  });
});
