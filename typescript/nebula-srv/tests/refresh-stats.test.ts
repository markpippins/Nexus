/**
 * Integration test: POST /api/refresh-stats — SQL injection validation.
 *
 * Verifies that the refresh-stats endpoint:
 *  1. Returns 200 with { ok, refreshed, skipped } structure
 *  2. All names in `refreshed` match the safe PostgreSQL identifier pattern
 *  3. All names in `skipped` do NOT match the safe pattern
 *  4. The endpoint is idempotent (can be called multiple times)
 *
 * Security context: The handler interpolates matviewname into a
 * REFRESH MATERIALIZED VIEW DDL string. PostgreSQL doesn't support
 * parameterized identifiers for DDL, so the route validates names
 * against /^[a-zA-Z_][a-zA-Z0-9_]*$/ before interpolation. This test
 * confirms that contract holds.
 *
 * Usage: npx tsx tests/refresh-stats.test.ts
 */

import * as http from "http";

const BASE = "http://localhost:3101";

function httpReq(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const url = new URL(path, BASE);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (body ? "" : url.search),
      method,
      headers: bodyStr
        ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(bodyStr)) }
        : {},
    };
    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode!, body: data }); }
      });
    });
    req.on("error", (err) => reject(new Error(`Request failed: ${err.message}`)));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function assert(label: string, condition: boolean, detail?: string): void {
  if (!condition) {
    console.error(`  ✗ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    process.exit(1);
  }
  console.log(`  ✓ ${label}`);
}

// The same regex the route uses for identifier validation.
const SAFE_IDENT = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

async function run() {
  console.log("\nRefresh-Stats Security Integration Tests\n" + "─".repeat(40));

  // ── Test 1: Endpoint returns expected structure ──────────────────
  const result = await httpReq("POST", "/api/refresh-stats");
  assert("Returns 200", result.status === 200, String(result.status));
  assert("Response has ok: true", result.body.ok === true);
  assert("Response has refreshed array", Array.isArray(result.body.refreshed));
  assert("Response has skipped array", Array.isArray(result.body.skipped));

  // ── Test 2: All refreshed names are safe identifiers ─────────────
  // Every name that was interpolated into the DDL string MUST pass
  // the safe identifier regex. If any don't, the injection vector
  // is back open.
  for (const name of result.body.refreshed) {
    assert(
      `Refreshed name "${name}" is a safe identifier`,
      SAFE_IDENT.test(String(name)),
      `failed regex ${SAFE_IDENT}`,
    );
  }
  console.log(`  ✓ All ${result.body.refreshed.length} refreshed names passed validation`);

  // ── Test 3: All skipped names are NOT safe identifiers ───────────
  // If a name appears in `skipped`, it should have failed validation.
  // (In practice this is empty since pg_matviews names are always valid,
  // but the contract must hold if a malicious name ever appears.)
  for (const name of result.body.skipped) {
    assert(
      `Skipped name "${name}" correctly rejected (not a safe identifier)`,
      !SAFE_IDENT.test(String(name)),
      `unexpectedly passed regex ${SAFE_IDENT}`,
    );
  }
  if (result.body.skipped.length === 0) {
    console.log("  ✓ No names were skipped (all pg_matviews names are valid identifiers)");
  } else {
    console.log(`  ✓ All ${result.body.skipped.length} skipped names were correctly rejected`);
  }

  // ── Test 4: Idempotency — second call produces same result ───────
  const result2 = await httpReq("POST", "/api/refresh-stats");
  assert("Second call also returns 200", result2.status === 200);
  assert("Second call ok: true", result2.body.ok === true);
  assert(
    "Refreshed sets are identical across calls",
    JSON.stringify(result.body.refreshed.sort()) === JSON.stringify(result2.body.refreshed.sort()),
    "refreshed sets differ",
  );

  // ── Test 5: No SQL injection payload in any interpolated name ────
  // Belt-and-suspenders: scan for common injection markers that should
  // never appear in a validated identifier.
  const INJECTION_MARKERS = [";", "--", "/*", "*/", "'", '"', "DROP", "DELETE", "UNION", "INSERT", "UPDATE"];
  const allNames = [...result.body.refreshed, ...result.body.skipped];
  for (const name of allNames) {
    const upper = String(name).toUpperCase();
    for (const marker of INJECTION_MARKERS) {
      assert(
        `Name "${name}" contains no injection marker "${marker}"`,
        !upper.includes(marker.toUpperCase()),
        `found marker ${marker}`,
      );
    }
  }
  console.log(`  ✓ All ${allNames.length} names are free of injection markers`);

  // ── Test 6: Response includes errors field ───────────────────────
  assert("Response has errors array", Array.isArray(result.body.errors));
  // On a healthy system, errors should be empty, but the field must exist
  // so callers can detect partial failures.
  console.log(`  ✓ errors field present (${result.body.errors.length} error(s))`);

  // ── Test 7: Identifier validation logic (unit-level) ─────────────
  // Directly test the SAFE_IDENT regex contract that the route relies on.
  // This verifies the validation logic itself, independent of live data.
  const VALID_NAMES = ["conversation_block_stats", "my_view", "_private", "v123", "a"];
  const INVALID_NAMES = [
    "; DROP TABLE users--",
    "view'; DELETE FROM nebula.systems--",
    "1numeric_start",
    "hyphen-name",
    "space name",
    "\"quoted\"",
    "union select",
    "--comment",
  ];
  for (const name of VALID_NAMES) {
    assert(`Valid identifier "${name}" passes regex`, SAFE_IDENT.test(name));
  }
  for (const name of INVALID_NAMES) {
    assert(`Invalid identifier "${name}" is rejected by regex`, !SAFE_IDENT.test(name));
  }
  console.log(`  ✓ Identifier validation logic verified (${VALID_NAMES.length} valid, ${INVALID_NAMES.length} invalid)`);

  console.log("\n" + "✓".repeat(20));
  console.log("All refresh-stats security tests passed!\n");
}

run().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
