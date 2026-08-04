import express from "express";
import cors from "cors";
import { loadEnv } from "./env";
import { healthRouter } from "./routes/health";
import { semanticsRouter } from "./routes/semantics";
import { startHeartbeat } from "heartbeat-client";

// ── Load .env ────────────────────────────────────────────────────────
loadEnv();

const PORT = parseInt(process.env.SEMANTICS_SRV_PORT || "3160", 10);
// Service id in the service-registry (port 8085) — registered 2026-08-03 (id 60).
const HEARTBEAT_SERVICE_ID = parseInt(process.env.SEMANTICS_SRV_SERVICE_ID || "60", 10);

// ── Process-level safety net ─────────────────────────────────────────
process.on("uncaughtException", (err: Error & { code?: string }) => {
  if (err.code === "EADDRINUSE") {
    console.error(`semantics-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === "EPIPE" || err.code === "ECONNRESET" || err.code === "ETIMEDOUT") {
    console.warn("[semantics-srv] uncaughtException (connection noise):", err.code, err.message);
    return;
  }
  console.error("[semantics-srv] uncaughtException:", err.message, err.stack?.split("\n").slice(0, 3).join("\n"));
});

const app = express();
app.use(cors());
app.use(express.json());

// ── Health ───────────────────────────────────────────────────────────
app.use("/health", healthRouter);

// ── Semantics API ────────────────────────────────────────────────────
app.use("/api", semanticsRouter);

// ── Start ────────────────────────────────────────────────────────────
async function start() {
  // Verify DB connectivity up front so a broken DSN fails fast under systemd.
  const { getDb } = await import("./db");
  await getDb().query("SELECT 1");
  console.log("[semantics-srv] PostgreSQL connected (nexus DB, semantics schema)");

  const server = app.listen(PORT, () => {
    console.log(`[semantics-srv] REST API listening on http://localhost:${PORT}`);
    console.log(`[semantics-srv] Health: http://localhost:${PORT}/health`);
    console.log(`[semantics-srv] Meta:   http://localhost:${PORT}/api/meta`);

    if (HEARTBEAT_SERVICE_ID > 0) {
      startHeartbeat({
        serviceId: HEARTBEAT_SERVICE_ID,
        serviceName: "semantics-srv",
        interval: 30,
        log: (...args: any[]) => console.log(new Date().toISOString(), "[heartbeat semantics-srv]", ...args),
      });
    }
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`semantics-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error("semantics-srv: listen error:", err.message);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("[semantics-srv] Fatal startup error:", err);
  process.exit(1);
});
