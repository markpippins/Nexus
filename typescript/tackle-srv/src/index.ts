import express from "express";
import cors from "cors";
import { loadEnv } from "./env";
import { initRedis, closeRedis } from "./memory";
import { aiConfigRouter } from "./routes/ai-config";
import { sessionsRouter } from "./routes/sessions";
import { rolesRouter } from "./routes/roles";
import { schedulerRouter } from "./routes/scheduler";
import { memoryRouter } from "./routes/memory";
import { failureRecoveryRouter } from "./routes/failure-recovery";
import { tasksRouter } from "./routes/tasks";

const PORT = parseInt(process.env.TACKLE_SRV_PORT || "3410", 10);

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`tackle-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[tackle-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[tackle-srv] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

const app = express();
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${Date.now() - start}ms`,
    );
  });
  next();
});

// ── Health ─────────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  res.json({
    status: "ok",
    port: PORT,
    pid: process.pid,
    timestamp: new Date().toISOString(),
  });
});

// ── Route mounting ────────────────────────────────────────────────

app.use("/config/ai", aiConfigRouter);
app.use("/sessions", sessionsRouter);
app.use("/roles", rolesRouter);
app.use("/scheduler", schedulerRouter);
app.use("/memory", memoryRouter);
app.use("/config/failure-recovery", failureRecoveryRouter);
app.use("/tasks", tasksRouter);

// ── Start ─────────────────────────────────────────────────────────

async function start() {
  const { initDb } = await import("./db");
  await initDb();
  console.log("[tackle-srv] PostgreSQL initialized (tackle schema)");

  initRedis();
  console.log("[tackle-srv] Redis client initialized (lazy connect)");

  const server = app.listen(PORT, () => {
    console.log(`Tackle REST server listening on http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/health`);
    console.log(`AI Config: http://localhost:${PORT}/config/ai`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`tackle-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error('tackle-srv: listen error:', err.message);
    }
    process.exit(1);
  });
}

start().catch((err) => {
  console.error("Failed to start tackle-srv:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[tackle-srv] Shutting down...");
  await closeRedis();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("[tackle-srv] Shutting down...");
  await closeRedis();
  process.exit(0);
});
