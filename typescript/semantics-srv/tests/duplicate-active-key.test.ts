/**
 * Regression test: duplicate-active-key detection on POST and PATCH.
 *
 * Verifies that a duplicate natural-key violation (SQLSTATE 23505) is
 * surfaced as `{ error: "duplicate_active_key" }` with HTTP 400.
 *
 * Regression context: the handlers previously tested
 * `err.message?.includes("23505")`, but node-postgres exposes the SQLSTATE
 * on `err.code`, not in the message text — so duplicates were misreported
 * as `add_failed` / `update_failed`. Fixed to check `err.code`.
 *
 * Usage: npx tsx tests/duplicate-active-key.test.ts
 * Requires the live semantics-srv on :3160 (and the nexus DB).
 */

import * as http from "http";

const BASE = "http://localhost:3160";

function httpReq(method: string, path: string, body?: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined;
    const url = new URL(path, BASE);
    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
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

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`); }
}

function unique(): string {
  return `__dup_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

async function main(): Promise<void> {
  console.log("semantics-srv duplicate-active-key regression test\n");

  // ── 1. POST duplicate → duplicate_active_key ─────────────────────────
  const nameA = unique();
  const created = await httpReq("POST", "/api/concept", { p_name: nameA, p_description: "regression test row" });
  assert("POST new concept → 201", created.status === 201, `got ${created.status}`);
  const idA: string = created.body?.id;
  assert("POST returns a row with id", typeof idA === "string" && idA.length > 0);

  const dupPost = await httpReq("POST", "/api/concept", { p_name: nameA });
  assert("POST duplicate name → 400", dupPost.status === 400, `got ${dupPost.status}`);
  assert(
    "POST duplicate → error=duplicate_active_key",
    dupPost.body?.error === "duplicate_active_key",
    `got ${JSON.stringify(dupPost.body)}`,
  );

  // ── 2. PATCH duplicate (append-only update onto a taken name) → duplicate_active_key ──
  const nameB = unique();
  const createdB = await httpReq("POST", "/api/concept", { p_name: nameB });
  assert("POST second concept → 201", createdB.status === 201, `got ${createdB.status}`);
  const idB: string = createdB.body?.id;

  const dupPatch = await httpReq("PATCH", `/api/concept/${idB}`, { p_name: nameA });
  assert("PATCH onto taken name → 400", dupPatch.status === 400, `got ${dupPatch.status}`);
  assert(
    "PATCH duplicate → error=duplicate_active_key",
    dupPatch.body?.error === "duplicate_active_key",
    `got ${JSON.stringify(dupPatch.body)}`,
  );

  // ── 3. Sanity: the original row still exists with the original name ──
  const getA = await httpReq("GET", `/api/concept/${idA}`);
  assert("original row intact after failed dup (GET → 200)", getA.status === 200);
  assert("original row name unchanged", getA.body?.name === nameA, `got ${getA.body?.name}`);

  // ── Cleanup (soft-delete; expire-not-delete) ────────────────────────
  const delA = await httpReq("DELETE", `/api/concept/${idA}`);
  const delB = await httpReq("DELETE", `/api/concept/${idB}`);
  assert("cleanup A → deleted=1", delA.body?.deleted === 1, JSON.stringify(delA.body));
  assert("cleanup B → deleted=1", delB.body?.deleted === 1, JSON.stringify(delB.body));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("test crashed:", err);
  process.exit(1);
});
