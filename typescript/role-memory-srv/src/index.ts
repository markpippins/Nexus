import express from "express";
import { initDb } from "./db";
import { initRedis, closeRedis, getRedis, META_UPDATED_KEY, PROC_KEY, IDX_KEY } from "./redis";
import { syncAll } from "./sync";

const PORT = parseInt(process.env.MEMORY_SRV_PORT || "3500", 10);

// ── Process-level safety net ─────────────────────────────────────
process.on('uncaughtException', (err: Error & { code?: string }) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`role-memory-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    process.exit(1);
  }
  if (err.code === 'EPIPE' || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT') {
    console.warn('[role-memory-srv] uncaughtException (connection noise):', err.code, err.message);
    return;
  }
  console.error('[role-memory-srv] uncaughtException:', err.message, err.stack?.split('\n').slice(0, 3).join('\n'));
});

const app = express();
app.use(express.json());

// ── Health check ────────────────────────────────────────────────────

app.get("/health", async (_req, res) => {
  try {
    const redis = getRedis();
    const lastUpdated = await redis.get(META_UPDATED_KEY);
    res.json({
      status: "ok",
      lastUpdated: lastUpdated || null,
      uptime: process.uptime(),
    });
  } catch (err: any) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Redis reads (direct cache access for MCP tools) ────────────────

/** GET /procedures/:role — return the role's procedure index */
app.get("/procedures/:role", async (req, res) => {
  try {
    const redis = getRedis();
    const data = await redis.get(IDX_KEY(req.params.role));
    if (!data) {
      return res.json([]);
    }
    res.json(JSON.parse(data));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /procedure/:slug — return full procedure card */
app.get("/procedure/:slug", async (req, res) => {
  try {
    const redis = getRedis();
    const data = await redis.get(PROC_KEY(req.params.slug));
    if (!data) {
      return res.status(404).json({ error: "Procedure not found" });
    }
    res.json(JSON.parse(data));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Refresh (repopulate Redis from PG) ──────────────────────────────

app.post("/refresh", async (_req, res) => {
  try {
    const result = await syncAll();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Startup ─────────────────────────────────────────────────────────

async function main() {
  console.log("[role-memory-srv] Initializing PG connection...");
  initDb();
  console.log("[role-memory-srv] PG connected.");

  console.log("[role-memory-srv] Connecting to Redis...");
  const redis = initRedis();

  // Auto-heal: ioredis emits "ready" on both initial connect AND every
  // reconnect after an outage (the retryStrategy in redis.ts always retries).
  // Re-syncing on ready means the Redis cache repopulates automatically once
  // Redis is back, without anyone needing to call POST /refresh. Fire-and-forget
  // so the handler never blocks the event loop; errors are logged, not thrown.
  // At boot this may race with the explicit syncAll() below — both write the
  // same keys from the same PG source, so the double write is harmless.
  redis.on("ready", () => {
    syncAll()
      .then((r) =>
        console.log(
          `[role-memory-srv] Auto-sync on Redis ready: ${r.procedures} procedures, ${r.roleIndices} role indices`
        )
      )
      .catch((err: any) =>
        console.warn(`[role-memory-srv] Auto-sync on Redis ready failed: ${err.message}`)
      );
  });

  console.log("[role-memory-srv] Running initial sync...");
  try {
    const result = await syncAll();
    console.log(
      `[role-memory-srv] Sync complete: ${result.procedures} procedures, ${result.roleIndices} role indices`
    );
  } catch (err: any) {
    // Don't crash if Redis is down at boot — the retryStrategy in redis.ts
    // will keep trying to reconnect, and POST /refresh can repopulate once
    // Redis is available. Booting the HTTP server in a degraded state is
    // more resilient than crash-looping.
    console.warn(
      `[role-memory-srv] Initial sync failed (Redis may be down): ${err.message}. Booting anyway; use POST /refresh once Redis reconnects.`
    );
  }

  const server = app.listen(PORT, () => {
    console.log(`[role-memory-srv] Listening on port ${PORT}`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`role-memory-srv: port ${PORT} already in use, exiting (code EADDRINUSE)`);
    } else {
      console.error('role-memory-srv: listen error:', err.message);
    }
    process.exit(1);
  });
}

main().catch((err) => {
  console.error("[role-memory-srv] Fatal startup error:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[role-memory-srv] Shutting down...");
  await closeRedis();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("[role-memory-srv] Shutting down...");
  await closeRedis();
  process.exit(0);
});
