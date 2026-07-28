// ── Event Processor Configuration ──────────────────────────────────

/** How often to poll for unconsumed events (ms) */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

/** Max events to grab per poll cycle */
export const DEFAULT_BATCH_SIZE = 10;

/** Skip events younger than this (ms) — lets real-time NATS path handle them first */
export const DEFAULT_RECOVERY_LAG_MS = 5_000;

// ── Harness Configuration ─────────────────────────────────────────

export const HARNESS_URL = process.env.HARNESS_URL || 'http://127.0.0.1:3420';
export const HARNESS_WORK_DIR = process.env.HARNESS_WORK_DIR || '/home/codex/dev';
