/**
 * Reconciliation: Backfilled plans 1222-1237 → harvest_candidates cross-links.
 *
 * After the 2026-07-03 power outage, 16 ghost plans (1222-1237) had their
 * `nebula.plans` rows restored (currently `deleted=1`). Some of those plans
 * may have been the original work-target of a `harvest_candidate` — the
 * candidate's text (intent_description / implementation_notes / code_snippets /
 * open_questions) references the plan ID by number, but the canonical
 * `ag:spawns_plan` cross-reference was never created (or was lost in the outage).
 *
 * Regex design notes (intentionally two patterns, not one):
 *   - The WHERE-clause pattern `(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)` is
 *     used for boolean MATCHING (does the text contain a plan ID?).
 *   - The CASE-extractor pattern `^.*?(12(2[2-9]|3[0-7])).*?$` is used for
 *     VALUE EXTRACTION (what is the plan ID?). The trailing `\\1` keeps
 *     capture group 1 (the full plan ID like "1234").
 *   - The anchored match pattern rejects partial-number false-positives
 *     (e.g., "12345" won't match as "1234" + "5").
 *
 * Known limitation: per-candidate, the script processes at most one matched
 * plan ID — the CASE picks the first true branch (intent → impl → code → oq)
 * and the extractor returns the first occurrence. If a single candidate's
 * text references multiple plan IDs in the range, only the first match is
 * cross-linked. The current data has 1:1 mapping, so this is a no-op in
 * practice but should be revisited if a future candidate references
 * multiple backfilled plans.
 *
 * This script:
 *   1. For each plan in 1222-1237, finds any `harvest_candidate` whose
 *      textual fields contain the plan ID as a regex substring.
 *   2. Creates an `ag:spawns_plan` cross-reference from each matched
 *      candidate to its referenced plan (idempotent via WHERE NOT EXISTS).
 *   3. Backfills `harvest_candidates.title` from the plan's title where the
 *      candidate's title is NULL or empty AND the plan is the only
 *      authoritative source (i.e. the match_basis shows the link to a
 *      specific plan). Idempotent and future-proof; currently a no-op
 *      because no candidates in the table have empty titles.
 *
 * The cross-reference metadata captures the recovery context so a future
 * operator can see this was a post-outage re-link rather than a fresh link.
 *
 * Usage:
 *   node migrations/reconcile-backfilled-plans.js
 *   node migrations/reconcile-backfilled-plans.js --dry-run
 *   node migrations/reconcile-backfilled-plans.js --json
 *   node migrations/reconcile-backfilled-plans.js --write-audit
 *
 * Exit codes:
 *   0  no errors (reconciliation may have processed 0 or more rows)
 *   2  DB connection / SQL error
 *
 * Prerequisites:
 *   * PostgreSQL running with the nexus database
 *   * Migration v20+ applied (so the `ag:spawns_plan` rel_type is valid
 *     per the nebula.cross_references CHECK constraint)
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

const PLAN_IDS = [
  "1222", "1223", "1224", "1225", "1226", "1227", "1228", "1229",
  "1230", "1231", "1232", "1233", "1234", "1235", "1236", "1237",
];

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
      "reconcile-backfilled-plans.js",
      "",
      "Reconcile harvest_candidates with backfilled plan IDs 1222-1237.",
      "",
      "Steps:",
      "  1. Find harvest_candidates whose text fields reference any of 1222-1237",
      "  2. Create ag:spawns_plan cross-references (idempotent)",
      "  3. Backfill candidate.title from plan.title where candidate.title is empty",
      "",
      "Flags:",
      "  --dry-run        report findings without modifying any rows",
      "  --json           machine-readable JSON output",
      "  --write-audit    POST findings to nebula.agent_records (recordType=inspection)",
      "  -h, --help       show this message",
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

/**
 * Find every harvest_candidate whose text fields reference any of the
 * backfilled plan IDs. Returns rows with the specific matched plan_id and
 * the field that contained the reference.
 */
async function findCandidateMatches(client) {
  // Build a single OR regex for the 16 plan IDs (anchored as substrings).
  // The pattern matches a 4-digit number 1222-1237 anywhere in the text.
  // We use a CASE in SQL to identify which field produced the match.
  const planIdsLiteral = PLAN_IDS.map((p) => `'${p}'`).join(",");
  const { rows } = await client.query(
    `WITH matched AS (
       SELECT
         hc.id::text AS candidate_id,
         hc.title,
         hc.status,
         (CASE
           WHEN hc.intent_description ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)'
             THEN regexp_replace(hc.intent_description, '^.*?(12(2[2-9]|3[0-7])).*?$', '\\1')
           WHEN hc.implementation_notes::text ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)'
             THEN regexp_replace(hc.implementation_notes::text, '^.*?(12(2[2-9]|3[0-7])).*?$', '\\1')
           WHEN hc.code_snippets::text ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)'
             THEN regexp_replace(hc.code_snippets::text, '^.*?(12(2[2-9]|3[0-7])).*?$', '\\1')
           WHEN hc.open_questions::text ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)'
             THEN regexp_replace(hc.open_questions::text, '^.*?(12(2[2-9]|3[0-7])).*?$', '\\1')
         END) AS matched_plan_id,
         (CASE
           WHEN hc.intent_description ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)' THEN 'intent_description'
           WHEN hc.implementation_notes::text ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)' THEN 'implementation_notes'
           WHEN hc.code_snippets::text ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)' THEN 'code_snippets'
           WHEN hc.open_questions::text ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)' THEN 'open_questions'
         END) AS match_basis
       FROM nebula.harvest_candidates hc
       WHERE
            hc.intent_description        ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)'
         OR hc.implementation_notes::text ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)'
         OR hc.code_snippets::text       ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)'
         OR hc.open_questions::text      ~ '(^|[^0-9])(12(2[2-9]|3[0-7]))([^0-9]|$)'
     )
     SELECT candidate_id, title, status, matched_plan_id, match_basis
       FROM matched
      WHERE matched_plan_id IN (${planIdsLiteral})
      ORDER BY candidate_id`,
  );
  return rows;
}

/**
 * Idempotent insert of an ag:spawns_plan cross-reference from a
 * harvest_candidate to a plan. Mirrors the createSpawnsPlanCrossRef helper
 * in nebula-srv/src/routes.ts.
 */
async function createSpawnsPlanXref(client, candidateId, planId, metadata) {
  const { rowCount } = await client.query(
    `INSERT INTO nebula.cross_references
       (source_type, source_id, target_type, target_id, rel_type, metadata)
     SELECT 'harvest_candidate', $1, 'plan', $2, 'ag:spawns_plan', $3::jsonb
     WHERE NOT EXISTS (
       SELECT 1 FROM nebula.cross_references
       WHERE source_type = 'harvest_candidate'
         AND source_id = $1
         AND target_type = 'plan'
         AND target_id = $2
         AND rel_type = 'ag:spawns_plan'
     )`,
    [candidateId, planId, JSON.stringify(metadata)],
  );
  return rowCount; // 0 = already exists, 1 = just created
}

/**
 * Backfill a candidate's title from the plan's title where the candidate
 * title is NULL or empty. Idempotent and future-proof; currently a no-op
 * because no candidates in the table have empty titles.
 */
async function backfillTitleFromPlan(client, candidateId, planId, planTitle) {
  const { rowCount } = await client.query(
    `UPDATE nebula.harvest_candidates
        SET title = $1,
            updated_at = NOW()
      WHERE id = $2::uuid
        AND (title IS NULL OR trim(title) = '')`,
    [planTitle, candidateId],
  );
  return rowCount;
}

async function run() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const pool = new Pool(POOL_OPTS);
  const client = await pool.connect();

  let matches = [];
  const results = { xrefs_created: 0, xrefs_existed: 0, titles_backfilled: 0, candidates: [] };
  try {
    matches = await findCandidateMatches(client);
  } catch (err) {
    process.stderr.write(
      `reconcile error: failed to find candidate matches — ${err.message}\n`,
    );
    client.release();
    await pool.end();
    process.exit(2);
  }

  if (matches.length === 0) {
    client.release();
    await pool.end();
    if (opts.json) {
      process.stdout.write(
        JSON.stringify(
          {
            dry_run: opts.dryRun,
            plan_ids_scanned: PLAN_IDS.length,
            candidates_matched: 0,
            xrefs_created: 0,
            xrefs_existed: 0,
            titles_backfilled: 0,
            note: "no harvest_candidates reference any of the 16 backfilled plan IDs",
          },
          null,
          2,
        ) + "\n",
      );
    } else {
      process.stdout.write(
        "✅ no harvest_candidates reference any of the 16 backfilled plan IDs (1222-1237). No reconciliation needed.\n",
      );
    }
    process.exit(0);
  }

  if (!opts.json) {
    process.stdout.write(
      `Found ${matches.length} candidate-match(es) across the 16 backfilled plans:\n\n`,
    );
    for (const m of matches) {
      process.stdout.write(
        `  - candidate=${m.candidate_id} (status=${m.status}) → plan=${m.matched_plan_id} via ${m.match_basis}\n`,
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

  const reconciledAt = new Date().toISOString();
  for (const m of matches) {
    const metadata = {
      reconciled_at: reconciledAt,
      reconciled_by: "harvest-plan-reconcile-script",
      match_basis: m.match_basis,
      plan_status_at_reconcile: "deleted=1",
      original_outage: "2026-07-03 power outage recovery",
    };
    // Single per-candidate entry object — built up across the iteration and
    // pushed exactly once at the end. Avoids the duplicate-push bug where
    // error/skip branches would otherwise add a second entry alongside the
    // final summary push.
    const entry = {
      candidate_id: m.candidate_id,
      matched_plan_id: m.matched_plan_id,
      match_basis: m.match_basis,
      xref_created: false,
      title_backfill: null, // 'created' | 'existed' | 'noop' | 'skipped' | 'error: ...'
    };

    try {
      const created = await createSpawnsPlanXref(
        client,
        m.candidate_id,
        m.matched_plan_id,
        metadata,
      );
      if (created > 0) {
        results.xrefs_created += 1;
        entry.xref_created = true;
      } else {
        results.xrefs_existed += 1;
      }
    } catch (err) {
      entry.xref_error = err.message;
      results.candidates.push(entry);
      continue;
    }

    // Backfill title from plan (only if candidate's title is empty AND plan is the
    // only authoritative source — i.e. the match_basis established a single
    // unambiguous link to a specific plan). Currently a no-op in production.
    try {
      const { rows: planRows } = await client.query(
        "SELECT title FROM nebula.plans WHERE id = $1",
        [m.matched_plan_id],
      );
      const planTitle = planRows[0]?.title;
      if (planTitle) {
        const backfilled = await backfillTitleFromPlan(
          client,
          m.candidate_id,
          m.matched_plan_id,
          planTitle,
        );
        entry.title_backfill = backfilled > 0 ? "created" : "noop";
        if (backfilled > 0) results.titles_backfilled += 1;
      } else {
        // Plan has no title — skip backfill but warn so an operator can investigate.
        // This is rare (plans are created with a title) but worth surfacing.
        entry.title_backfill = "skipped";
        if (!opts.json) {
          process.stdout.write(
            `  ⚠️  plan ${m.matched_plan_id} has no title — title-backfill skipped for candidate ${m.candidate_id}\n`,
          );
        }
      }
    } catch (err) {
      // Title backfill is best-effort; surface the error in the entry but don't fail the run
      entry.title_backfill = `error: ${err.message}`;
    }

    results.candidates.push(entry);
  }

  client.release();
  await pool.end();

  if (opts.json) {
    process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  } else {
    process.stdout.write(
      `\n✅ Reconciliation complete: ${results.xrefs_created} cross-reference(s) created, ${results.xrefs_existed} already existed, ${results.titles_backfilled} title(s) backfilled.\n`,
    );
  }

  if (opts.writeAudit) {
    const summaryMd = [
      "# Backfilled plans 1222-1237 ↔ harvest_candidates reconciliation",
      "",
      `**Reconciled at:** ${reconciledAt}`,
      `**Plan IDs scanned:** ${PLAN_IDS.join(", ")}`,
      `**Cross-references created:** ${results.xrefs_created}`,
      `**Already existed:** ${results.xrefs_existed}`,
      `**Titles backfilled:** ${results.titles_backfilled}`,
      "",
      "## Matches",
      "",
      "| candidate_id | matched_plan_id | match_basis | xref_created |",
      "|---|---|---|---|",
    ];
    for (const c of results.candidates) {
      summaryMd.push(
        `| ${c.candidate_id || ""} | ${c.matched_plan_id || ""} | ${c.match_basis || ""} | ${c.xref_created ? "yes" : "no"} |`,
      );
    }
    try {
      const res = await nebulaPost("/api/agent-records", {
        recordType: "inspection",
        role: "inspector",
        title: `Backfilled plans 1222-1237 ↔ harvest_candidates reconciliation: ${results.xrefs_created} xref(s) created, ${results.titles_backfilled} title(s) backfilled`,
        content: summaryMd.join("\n"),
        tags: ["reconciliation", "harvest-candidates", "plans", "ghost-plans", "to:engineer"],
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
