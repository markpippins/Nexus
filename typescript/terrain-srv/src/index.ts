import express from "express";
import cors from "cors";
import terrainRouter from "./routes/terrain.js";
import { startHeartbeat } from "heartbeat-client";

const PORT = parseInt(process.env.PORT || "3111", 10);

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// All terrain routes mounted under /terrain
app.use("/terrain", terrainRouter);

// Root health check
app.get("/", (_req, res) => {
  res.json({
    name: "terrain-srv",
    version: "1.0.0",
    port: PORT,
    source: "terrain.postgres (servers, mcp_servers, runnable_services, cli_tools, service_dependencies, service_types)",
    endpoints: [
      "GET    /terrain/servers",
      "GET    /terrain/mcp-servers",
      "POST   /terrain/mcp-servers",
      "GET    /terrain/runnable-services",
      "POST   /terrain/runnable-services",
      "GET    /terrain/cli-tools",
      "POST   /terrain/cli-tools",
      "GET    /terrain/services/:name",
      "GET    /terrain/services/:name/running",
      "PATCH  /terrain/services/status",
      "GET    /terrain/dependencies",
      "POST   /terrain/dependencies",
      "GET    /terrain/summary",
      "GET    /health",
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
  console.log(`terrain-srv listening on http://localhost:${PORT}`);
  console.log(`  Servers:         http://localhost:${PORT}/terrain/servers`);
  console.log(`  MCP Servers:     http://localhost:${PORT}/terrain/mcp-servers`);
  console.log(`  Runnable Svcs:   http://localhost:${PORT}/terrain/runnable-services`);
  console.log(`  CLI Tools:       http://localhost:${PORT}/terrain/cli-tools`);
  console.log(`  Services:        http://localhost:${PORT}/terrain/services/<name>`);
  console.log(`  Dependencies:    http://localhost:${PORT}/terrain/dependencies`);
  console.log(`  Summary:         http://localhost:${PORT}/terrain/summary`);
  console.log(`  Health:          http://localhost:${PORT}/health`);

  // Register with service-registry (port 8085) via heartbeat-client.
  // serviceId 111 = terrain-srv (port-derived placeholder; chosen as
  // 100 + (port % 100) so it's easy to remember until the registry
  // reveals its real ID convention). Send a heartbeat every 30s.
  startHeartbeat({
    serviceId: 111,
    serviceName: "terrain-srv",
    interval: 30,
    log: (...args: any[]) => console.log(new Date().toISOString(), "[heartbeat terrain-srv]", ...args),
  });
});
