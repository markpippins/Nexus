import express from "express";
import { initDb } from "./db";
import {
  initRedis,
  closeRedis,
  getRedis,
  META_UPDATED_KEY,
  PROC_KEY,
  IDX_KEY,
  TASK_IDX_KEY,
} from "./redis";
import { syncAll } from "./sync";

const PORT = parseInt(process.env.PROMPT_SRV_PORT || "3501", 10);
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
      // Report the namespace so monitoring can distinguish this from the
      // procedure registry's mem:meta:last_updated.
      namespace: "prompt:",
    });
  } catch (err: any) {
    res.status(503).json({ status: "error", message: err.message });
  }
});

// ── Redis reads (direct cache access for the prompt bridge + CLI) ───

/**
 * GET /prompts/:role — return the role's prompt index.
 * This is the launch-time lookup: "give me all prompt templates for role X".
 */
app.get("/prompts/:role", async (req, res) => {
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

/**
 * GET /prompt/:role/:slug — return full prompt card (latest version).
 * Returns 404 if the role/slug pair has no cached template.
 */
app.get("/prompt/:role/:slug", async (req, res) => {
  try {
    const redis = getRedis();
    const data = await redis.get(PROC_KEY(req.params.role, req.params.slug));
    if (!data) {
      return res.status(404).json({ error: "Prompt not found" });
    }
    res.json(JSON.parse(data));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /tasks/:role — return the role's active task index.
 */
app.get("/tasks/:role", async (req, res) => {
  try {
    const redis = getRedis();
    const data = await redis.get(TASK_IDX_KEY(req.params.role));
    if (!data) {
      return res.json([]);
    }
    res.json(JSON.parse(data));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Refresh (repopulate Redis from PG) ──────────────────────────────

/**
 * POST /refresh — trigger a full PG→Redis sync. Idempotent.
 * Auto-heal: also called automatically on every Redis "ready" event,
 * so the cache repopulates without human intervention after an outage.
 */
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
  console.log("[tackle-prompt-sync-srv] Initializing PG connection...");
  initDb();
  console.log("[tackle-prompt-sync-srv] PG connected.");

  console.log("[tackle-prompt-sync-srv] Connecting to Redis...");
  const redis = initRedis();

  // Auto-heal on reconnect — same rationale as role-memory-srv: ioredis
  // emits "ready" on initial connect AND every reconnect after an outage.
  // Re-syncing on ready means the prompt cache repopulates automatically
  // once Redis is back, without anyone needing to call POST /refresh.
  redis.on("ready", () => {
    syncAll()
      .then((r) =>
        console.log(
          `[tackle-prompt-sync-srv] Auto-sync on Redis ready: ${r.prompts} prompts, ${r.tasks} tasks`
        )
      )
      .catch((err: any) =>
        console.warn(
          `[tackle-prompt-sync-srv] Auto-sync on Redis ready failed: ${err.message}`
        )
      );
  });

  console.log("[tackle-prompt-sync-srv] Running initial sync...");
  try {
    const result = await syncAll();
    console.log(
      `[tackle-prompt-sync-srv] Sync complete: ${result.prompts} prompts across ${result.rolePromptIndices} role indices, ${result.tasks} tasks across ${result.roleTaskIndices} role indices`
    );
  } catch (err: any) {
    // Don't crash if Redis is down at boot — booted-degraded is more
    // resilient than crash-looping. POST /refresh repopulates later.
    console.warn(
      `[tackle-prompt-sync-srv] Initial sync failed (Redis may be down): ${err.message}. Booting anyway; use POST /refresh once Redis reconnects.`
    );
  }

  app.listen(PORT, () => {
    console.log(`[tackle-prompt-sync-srv] Listening on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error("[tackle-prompt-sync-srv] Fatal startup error:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("[tackle-prompt-sync-srv] Shutting down...");
  await closeRedis();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("[tackle-prompt-sync-srv] Shutting down...");
  await closeRedis();
  process.exit(0);
});
