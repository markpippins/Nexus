/**
 * Cleanup: Stuck-pending plans in conduit-mcp.
 *
 * Companion to vision.check_receipt_integrity() Kind #5
 * (STUCK_PENDING_PLAN_AGE, added in migration v22).
 *
 * For each stuck-pending plan, performs 3 actions in a single transaction:
 *   1. Cancel all non-terminal tickets for the plan (preserves intent
 *      via the audit trail: tickets get closure_reason recorded)
 *   2. Insert a CANCELLED receipt with agent_role='inspector' and a
 *      deterministic id (cleanup-stuck-${planId}) so re-runs are idempotent.
 *      This closes the receipt-chain and stops the plan from being
 *      re-flagged by Kind #5.
 *   3. Soft-delete the plan (deleted=1) so it drops out of
 *      conduit.plan_status (which has WHERE p.deleted = 0). The
 *      nebula.plans row and its PLAN_CREATE receipt are preserved on
 *      disk — the intent is not lost, the plan is just not in the
 *      active pipeline anymore.
 *
 * Reversible: undeletePlan(planId) + delete the CANCELLED receipt
 * restore the plan to its pre-cleanup state.
 *
 * Usage:
 *   node migrations/cleanup-stuck-pending-plans.js                 # default 1800s threshold
 *   STUCK_PENDING_THRESHOLD_SECONDS=600 node .../cleanup-...js   # custom threshold
 *   node migrations/cleanup-stuck-pending-plans.js --dry-run     # list without modifying
 *   node migrations/cleanup-stuck-pending-plans.js --json         # machine-readable output
 *   node migrations/cleanup-stuck-pending-plans.js --write-audit # post findings to nebula.agent_records
 *
 * Exit codes:
 *   0  no stuck-pending plans (or all cleaned)
 *   2  DB connection / SQL error
 *
 * Prerequisites:
 *   * PostgreSQL running with the nexus database
 *   * Migration v22 applied (adds Kind #5 to check_receipt_integrity)
 *   * Optional: nebula-srv at http://localhost:3101 for --write-audit
 */

const { Pool } = require("pg");
const http = require("http");

const POOL_OPTS = {
  connectionString:
    process.env.CONDUIT_PG_DSN ||
    "postgresql://pguser:pgpass@localhost:5432/nexus",
};
const NEBULA_API = process.env.NEBULA_API || "http://localhost:3101";
const THRESHOLD_SECONDS = parseInt(
  process.env.STUCK_PENDING_THRESHOLD_SECONDS || "1800",
  10,
);

if (!Number.isFinite(THRESHOLD_SECONDS) || THRESHOLD_SECONDS <= 0) {
  process.stderr.write(
    `fatal: STUCK_PENDING_THRESHOLD_SECONDS must be a positive integer (got ${process.env.STUCK_PENDING_THRESHOLD_SECONDS || ""})\n`,
  );
  process.exit(2);
}

function parseArgs(argv) {
  const out = { dryRun: false, json: false, writeAudit: false };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--write-audit") out.writeAudit = true;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    [
      "cleanup-stuck-pending-plans.js",
      "",
      "Reads vision.check_receipt_integrity() Kind #5 and cleans each plan:",
      "  1. cancel non-terminal tickets",
      "  2. insert CANCELLED receipt (deterministic id, idempotent)",
      "  3. soft-delete the plan (deleted=1, row preserved on disk)",
      "",
      "Flags:",
      "  --dry-run        list stuck plans without modifying any rows",
      "  --json           machine-readable JSON output",
      "  --write-audit    POST findings to nebula.agent_records (recordType=inspection)",
      "  -h, --help       show this message",
      "",
      "Env:",
      "  STUCK_PENDING_THRESHOLD_SECONDS  (default 1800 = 30 min)",
      "  CONDUIT_PG_DSN                   (default postgresql://pguser:pgpass@localhost:5432/nexus)",
      "  NEBULA_API                       (default http://localhost:3101)",
      "",
    ].join("\n"),
  );
}

function nebulaPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, NEBULA_API);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode, data: buf });
          }
        });
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function findStuckPendingPlans(client, thresholdSeconds) {
  // Reuse the verifier's Kind #5 query so detection logic stays in one place.
  // The function takes a threshold parameter (v22 signature); pass the same
  // env-var-driven value the script will use for the cleanup, so the script
  // never finds a different set than the verifier would.
  const { rows } = await client.query(
    `SELECT plan_id, ticket_id, detail
     FROM vision.check_receipt_integrity($1)
     WHERE kind = 'STUCK_PENDING_PLAN_AGE'
     ORDER BY plan_id`,
    [thresholdSeconds],
  );
  return rows;
}

async function cleanupOne(client, plan, thresholdSeconds) {
  const now = new Date().toISOString();
  const closureReason = `auto-cleanup: stuck-pending > ${thresholdSeconds}s`;

  await client.query("BEGIN");
  try {
    // 1. Cancel all non-terminal tickets for the plan (any role)
    const t = await client.query(
      `UPDATE vision.tickets
         SET status = 'cancelled', closed_at = $1, last_activity = $1, closure_reason = $2
       WHERE plan_id = $3
         AND status IN ('open','claimed','stale','failed')`,
      [now, closureReason, plan.plan_id],
    );

    // 2. Insert deterministic CANCELLED receipt (idempotent via ON CONFLICT)
    const receiptId = `cleanup-stuck-${plan.plan_id}`;
    const r = await client.query(
      `INSERT INTO vision.receipts
         (id, plan_id, type, agent_role, summary, created_at)
       VALUES ($1, $2, 'CANCELLED', 'inspector', $3, $4)
       ON CONFLICT (id) DO NOTHING`,
      [
        receiptId,
        plan.plan_id,
        closureReason,
        now,
      ],
    );

    // 3. Soft-delete the plan (deleted=0 -> 1; row preserved on disk)
    const p = await client.query(
      `UPDATE nebula.plans
         SET deleted = 1, updated_at = $1
       WHERE id = $2 AND deleted = 0`,
      [now, plan.plan_id],
    );

    await client.query("COMMIT");
    return {
      plan_id: plan.plan_id,
      tickets_cancelled: t.rowCount,
      receipt_inserted: r.rowCount,
      plan_deleted: p.rowCount,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

async function run() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const pool = new Pool(POOL_OPTS);
  const client = await pool.connect();
  let stuck = [];
  let results = [];
  try {
    stuck = await findStuckPendingPlans(client, THRESHOLD_SECONDS);
  } catch (err) {
    process.stderr.write(
      `cleanup error: failed to invoke vision.check_receipt_integrity() — ${err.message}\n` +
        "If the function does not exist, apply migration v22.\n",
    );
    client.release();
    await pool.end();
    process.exit(2);
  }

  if (stuck.length === 0) {
    client.release();
    await pool.end();
    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          { threshold_seconds: THRESHOLD_SECONDS, cleaned: 0, plans: [] },
          null,
          2,
        ) + "\n",
      );
    } else {
      process.stdout.write(
        "✅ no stuck-pending plans found (Kind #5 returned 0 rows).\n",
      );
    }
    process.exit(0);
  }

  if (!opts.json) {
    process.stdout.write(
      `Found ${stuck.length} stuck-pending plan(s) (threshold=${THRESHOLD_SECONDS}s):\n\n`,
    );
    for (const p of stuck) {
      process.stdout.write(
        `  - plan=${p.plan_id} ticket=${p.ticket_id}\n    ${p.detail}\n`,
      );
    }
    process.stdout.write("\n");
    if (opts.dryRun) {
      process.stdout.write("🔍 --dry-run: not modifying any rows.\n");
      client.release();
      await pool.end();
      process.exit(0);
    }
  }

  for (const p of stuck) {
    try {
      const r = await cleanupOne(client, p, THRESHOLD_SECONDS);
      results.push(r);
    } catch (err) {
      results.push({
        plan_id: p.plan_id,
        error: err.message,
      });
    }
  }
  client.release();
  await pool.end();

  // Summary
  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          threshold_seconds: THRESHOLD_SECONDS,
          dry_run: opts.dryRun,
          cleaned: results.filter((r) => !r.error).length,
          failed: results.filter((r) => r.error).length,
          results,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    const ok = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);
    process.stdout.write(
      `\n✅ cleaned ${ok.length} plan(s)${failed.length ? `, ${failed.length} failed` : ""}:\n`,
    );
    for (const r of ok) {
      process.stdout.write(
        `  - plan=${r.plan_id}: cancelled ${r.tickets_cancelled} ticket(s), inserted receipt=${r.receipt_inserted}, soft-deleted=${r.plan_deleted}\n`,
      );
    }
    for (const r of failed) {
      process.stdout.write(`  - plan=${r.plan_id}: ERROR ${r.error}\n`);
    }
  }

  if (opts.writeAudit && results.length > 0) {
    const summaryMd = [
      `# Stuck-pending cleanup — ${results.length} plan(s)`,
      "",
      `**Threshold:** ${THRESHOLD_SECONDS}s`,
      `**Cleaned at:** ${new Date().toISOString()}`,
      "",
      "| plan_id | tickets_cancelled | receipt_inserted | plan_deleted | status |",
      "|---|---|---|---|---|",
    ];
    for (const r of results) {
      const status = r.error ? `error: ${r.error}` : "ok";
      summaryMd.push(
        `| ${r.plan_id} | ${r.tickets_cancelled ?? ""} | ${r.receipt_inserted ?? ""} | ${r.plan_deleted ?? ""} | ${status} |`,
      );
    }
    try {
      const res = await nebulaPost("/api/agent-records", {
        recordType: "inspection",
        role: "inspector",
        title: `Stuck-pending cleanup: ${results.length} plan(s) (threshold=${THRESHOLD_SECONDS}s)`,
        content: summaryMd.join("\n"),
        tags: ["integrity", "cleanup", "stuck-pending", "ghost-plans", "to:engineer"],
        level: 3,
        visibilityScope: "all",
      });
      if (!opts.json) {
        process.stdout.write(
          res.status >= 200 && res.status < 300
            ? `📨 audit record written (status=${res.status})\n`
            : `⚠️  audit write returned status=${res.status}\n`,
        );
      }
    } catch (err) {
      process.stderr.write(`⚠️  audit write failed: ${err.message}\n`);
    }
  }

  process.exit(0);
}

run().catch((err) => {
  process.stderr.write(`fatal: ${err.message}\n`);
  process.exit(2);
});
