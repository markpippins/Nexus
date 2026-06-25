import express from "express";
import { initDb } from "./db";
import { initRedis, closeRedis, getRedis, META_UPDATED_KEY, PROC_KEY, IDX_KEY } from "./redis";
import { syncAll } from "./sync";

const PORT = parseInt(process.env.MEMORY_SRV_PORT || "3500", 10);
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
  initRedis();

  console.log("[role-memory-srv] Running initial sync...");
  const result = await syncAll();
  console.log(
    `[role-memory-srv] Sync complete: ${result.procedures} procedures, ${result.roleIndices} role indices`
  );

  app.listen(PORT, () => {
    console.log(`[role-memory-srv] Listening on port ${PORT}`);
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
