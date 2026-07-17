/**
 * Verifier: Receipt-Integrity invariant for conduit-mcp.
 *
 * Companion to vision.check_receipt_integrity() (added in migration v20).
 * Runs the read-only invariant and surfaces any orphan anomalies:
 *
 *   * STUCK_OPEN_TICKET_NO_TERMINAL_RECEIPT
 *       non-terminal ticket on a soft-deleted plan, no terminal receipt
 *   * ORPHAN_RECEIPT_NO_PLAN
 *       receipt whose nebula.plans row is gone AND no
 *       nebula.requirements.conduit_plan_id cross-link survives
 *   * DELETED_PLAN_HAS_OPEN_TICKETS_AFTER_TERMINAL_RECEIPT
 *       terminal receipt exists but non-terminal tickets still linger on
 *       the deleted plan
 *   * ORPHAN_TICKET_NO_PLAN
 *       non-terminal ticket whose plan_id has no row in nebula.plans at all
 *   * STUCK_PENDING_PLAN_AGE
 *       plan has only PLAN_CREATE receipts (no progress of any kind),
 *       an open builder ticket, and the PLAN_CREATE is older than 1800s.
 *       Cleanup is performed by migrations/cleanup-stuck-pending-plans.js.
 *
 * The terminal-receipt set is delegated to vision.is_terminal_receipt_type()
 * (migration v21) so it has a single source of truth inside the SQL layer.
 * Note: db.ts:_isPlanTerminal (TS) and the SQL helper are still two
 * parallel definitions that must be updated in lockstep.
 *
 * This is the post-migration safety net added after the 2026-07-03 outage,
 * in which a multi-plan ghost-stuck incident left plans "pending" in /state
 * because orphan tickets had no corresponding terminal receipts.
 *
 * Usage:
 *   node migrations/verify-receipt-integrity.js              # human-readable summary
 *   node migrations/verify-receipt-integrity.js --json        # machine-readable JSON
 *   node migrations/verify-receipt-integrity.js --write-audit # post findings to nebula.agent_records
 *   node migrations/verify-receipt-integrity.js --strict     # exit 1 on any anomaly
 *   node migrations/verify-receipt-integrity.js --no-fail    # always exit 0 (for periodic cron)
 *
 * Exit codes:
 *   0  no anomalies (or --no-fail)
 *   1  anomalies detected and --strict (default)
 *   2  DB connection / SQL function call error
 *
 * Prerequisites:
 *   * PostgreSQL running with the nexus database
 *   * Migration v20 applied (creates vision.check_receipt_integrity())
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

function parseArgs(argv) {
  const out = {
    json: false,
    writeAudit: false,
    strict: true,
    noFail: false,
  };
  for (const a of argv.slice(2)) {
    if (a === "--json") out.json = true;
    else if (a === "--write-audit") out.writeAudit = true;
    else if (a === "--strict") out.strict = true;
    else if (a === "--no-strict") out.strict = false;
    else if (a === "--no-fail") out.noFail = true;
    else if (a === "-h" || a === "--help") out.help = true;
  }
  return out;
}

function printHelp() {
  process.stdout.write(
    [
      "verify-receipt-integrity.js",
      "",
      "Reads vision.check_receipt_integrity() and reports orphan anomalies.",
      "",
      "Flags:",
      "  --json          machine-readable JSON output",
      "  --write-audit   POST findings to nebula.agent_records (recordType=inspection)",
      "  --strict        exit 1 on anomalies (default)",
      "  --no-strict     exit 0 even on anomalies",
      "  --no-fail       alias for --no-strict (cron-friendly)",
      "  -h, --help      show this message",
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

function groupByKind(rows) {
  const groups = {};
  for (const r of rows) {
    if (!groups[r.kind]) groups[r.kind] = [];
    groups[r.kind].push(r);
  }
  return groups;
}

function humanReport(rows, groups) {
  if (rows.length === 0) {
    return "✅ no orphan anomalies detected (vision.check_receipt_integrity() returned 0 rows)";
  }
  const lines = [`❌ ${rows.length} orphan anomaly(ies) detected:\n`];
  for (const [kind, items] of Object.entries(groups)) {
    lines.push(`  ${kind}: ${items.length}`);
    for (const r of items.slice(0, 5)) {
      lines.push(`    - plan=${r.plan_id}` + (r.ticket_id ? ` ticket=${r.ticket_id}` : "") +
                 (r.receipt_id ? ` receipt=${r.receipt_id}` : "") +
                 ` :: ${r.detail}`);
    }
    if (items.length > 5) lines.push(`    ... and ${items.length - 5} more`);
    lines.push("");
  }
  return lines.join("\n");
}

async function writeAudit(rows) {
  if (rows.length === 0) return { written: 0 };
  const summaryMd = [
    `# Receipt-Integrity Verifier — ${rows.length} anomaly(ies)`,
    "",
    `Detected at: ${new Date().toISOString()}`,
    "",
    "| kind | plan_id | ticket_id | receipt_id | detail |",
    "|---|---|---|---|---|",
  ];
  for (const r of rows) {
    summaryMd.push(
      `| ${r.kind} | ${r.plan_id || ""} | ${r.ticket_id || ""} | ${r.receipt_id || ""} | ${(r.detail || "").replace(/\|/g, "\\|")} |`,
    );
  }

  const res = await nebulaPost("/api/agent-records", {
    recordType: "inspection",
    role: "inspector",
    title: `Receipt-integrity verifier: ${rows.length} orphan anomaly(ies) detected`,
    content: summaryMd.join("\n"),
    tags: ["integrity", "verifier", "invariant", "ghost-plans", "to:engineer"],
    level: 3,
    visibilityScope: "all",
  });
  return { written: res.status >= 200 && res.status < 300 ? 1 : 0, status: res.status, data: res.data };
}

async function run() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const pool = new Pool(POOL_OPTS);
  let rows;
  try {
    const result = await pool.query(
      "SELECT kind, plan_id, ticket_id, receipt_id, detail FROM vision.check_receipt_integrity() ORDER BY kind, plan_id, ticket_id NULLS LAST, receipt_id NULLS LAST",
    );
    rows = result.rows;
  } catch (err) {
    process.stderr.write(
      `verifier error: failed to invoke vision.check_receipt_integrity() — ${err.message}\n` +
        "If the function does not exist, apply migration v20 (or run: node -e \"require('./dist/db.js').initDb().then(()=>process.exit(0))\").\n",
    );
    await pool.end();
    process.exit(2);
  }
  await pool.end();

  const groups = groupByKind(rows);

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          clean: rows.length === 0,
          total: rows.length,
          by_kind: Object.fromEntries(
            Object.entries(groups).map(([k, v]) => [k, v.length]),
          ),
          anomalies: rows,
          detected_at: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(humanReport(rows, groups) + "\n");
  }

  if (opts.writeAudit) {
    try {
      const auditResult = await writeAudit(rows);
      if (!opts.json) {
        process.stdout.write(
          auditResult.written
            ? `📨 audit record written to nebula.agent_records\n`
            : `⚠️  audit write failed (status=${auditResult.status})\n`,
        );
      }
    } catch (err) {
      process.stderr.write(`audit write error: ${err.message}\n`);
    }
  }

  if (rows.length > 0 && opts.strict && !opts.noFail) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch((err) => {
  process.stderr.write(`fatal: ${err.message}\n`);
  process.exit(2);
});
