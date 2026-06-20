// Throwaway smoke harness — drives PebApiClient.submitTransaction directly
// against the running PEB Kernel on http://localhost:8080. Not part of the
// shipped MCP server; ts-node compiles and runs it on demand. tsconfig only
// includes src/**/* so this file does not affect tsc-build output.
//
// Note on the import: ts-node's loader wants the explicit `.ts` extension
// (the relative resolution error reads "Did you mean to import './src/api/
// apiClient.ts'?"). The shipped MCP code in tools/index.ts uses the `.js`
// suffix because NodeNext resolves `.js` back to `.ts` at the tooling
// boundary; smoke.ts runs under ts-node's CJS pipeline so it needs `.ts`.
//
// Usage:  cd /home/codex/dev/nexus/typescript/peb-mcp && npx ts-node smoke.ts

import { PebApiClient } from "./src/api/apiClient.ts";

async function main() {
  const entity = "mcp-smoke-agent";

  // Note: PebApiClient generates fresh crypto.randomUUID() for both id and
  // idempotencyKey on every call — these are not echoed back by the kernel,
  // so we capture what we send in toolName + entityId and correlate to DB rows
  // by entity_id WHERE-clause.

  console.log("\n--- 1. peb_record_decision (MUTATE path) [EXPECTS: HTTP 200, audit row written] ---");
  const r1 = await PebApiClient.submitTransaction(entity, "peb_record_decision", {
    title: "mcp-driven decision",
    summary: { sources: ["smoke-ts"], confidence: 0.92 },
    affected_keys: ["peb_state.active_work_request"],
    entropy_class: "shaper",
    commit_ref: null
  });
  console.log(JSON.stringify(r1, null, 2));

  // Test 2 uses the MCP facade's canonical lowercase enum values
  // ('authority_leakage', 'hard'). The kernel has a strict ViolationType.valueOf
  // (uppercase). This *intentionally* exercises the bridge mismatch as a
  // diagnostic. We expect HTTP 422 with a precise diagnostic from the new
  // @ExceptionHandler — that pipeline signal is the whole point of running
  // this smoke. To flip to "200 + first-class row", align the kernel enum
  // parsing to accept this exact lowercase shape, OR tighten the MCP facade
  // enum to match the kernel's uppercase values.
  console.log("\n--- 2. peb_report_violation (REPORT_VIOLATION, valid MCP-shape) [EXPECTS: HTTP 422 — bridge enum mismatch: kernel has ViolationType.valueOf uppercase; MCP facade sends lowercase] ---");
  const r2 = await PebApiClient.submitTransaction(entity, "peb_report_violation", {
    violation_type: "authority_leakage",
    severity: "hard",
    capability_attempted: "write_unauthorized_state",
    context: { detector: "smoke-ts", phase: 5 }
  });
  console.log(JSON.stringify(r2, null, 2));

  console.log("\n--- 3. peb_report_violation (REPORT_VIOLATION, malformed: missing violation_type) [EXPECTS: HTTP 422] ---");
  const r3 = await PebApiClient.submitTransaction(entity, "peb_report_violation", {
    severity: "soft"
    // violation_type intentionally omitted
  });
  console.log(JSON.stringify(r3, null, 2));
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
