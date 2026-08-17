/**
 * Unit test: execution-admission decisions (src/admission.ts).
 *
 * Verifies the T20 two-tier admission gate (config validity):
 *   1. No config bundles → denied NO_CONFIG.
 *   2. All bundles is_active=0 → denied ROLE_REVOKED.
 *   3. Active bundles but none within valid_from/valid_to → denied
 *      CONFIG_INVALIDATED.
 *   4. At least one active, valid bundle → allowed.
 *   5. A future valid_from (not_yet_valid) and a passed valid_to (expired)
 *      both count as invalidated when no other valid bundle exists.
 *
 * Lease outcomes (LEASE_EXPIRED/LEASE_EXHAUSTED) are now emitted by the
 * worker-pool path (conduit/execution_worker.py), not harness-srv.
 *
 * Usage: npx tsx tests/admission.test.ts
 */

import { decideConfigAdmission, decideRoleGovernance, ADMISSION_OUTCOME, ConfigBundleSnapshot } from "../src/admission";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function bundle(overrides: Partial<ConfigBundleSnapshot> = {}): ConfigBundleSnapshot {
  return { is_active: 1, not_yet_valid: false, expired: false, ...overrides };
}

console.log("== outcome vocabulary ==");
{
  assert(ADMISSION_OUTCOME.ADMISSION_DENIED === "ADMISSION_DENIED", "ADMISSION_DENIED present");
  assert(ADMISSION_OUTCOME.ROLE_REVOKED === "ROLE_REVOKED", "ROLE_REVOKED present");
  assert(ADMISSION_OUTCOME.CONFIG_INVALIDATED === "CONFIG_INVALIDATED", "CONFIG_INVALIDATED present");
  assert(ADMISSION_OUTCOME.NO_CONFIG === "NO_CONFIG", "NO_CONFIG present");
  assert(ADMISSION_OUTCOME.LEASE_EXPIRED === "LEASE_EXPIRED", "LEASE_EXPIRED (worker-pool vocabulary) present");
  assert(ADMISSION_OUTCOME.ROLE_MISSING === "ROLE_MISSING", "ROLE_MISSING present");
  assert(ADMISSION_OUTCOME.ROLE_EXPIRED === "ROLE_EXPIRED", "ROLE_EXPIRED present");
  assert(ADMISSION_OUTCOME.CAPABILITY_INSUFFICIENT === "CAPABILITY_INSUFFICIENT", "CAPABILITY_INSUFFICIENT present");
}

console.log("== no config ==");
{
  const a = decideConfigAdmission([]);
  assert(a.valid === false && !a.valid && a.outcome === "NO_CONFIG", "empty bundles → NO_CONFIG");
}

console.log("== revoked ==");
{
  const a = decideConfigAdmission([bundle({ is_active: 0 }), bundle({ is_active: 0 })]);
  assert(a.valid === false, "all inactive → denied");
  if (!a.valid) {
    assert(a.outcome === "ROLE_REVOKED", "outcome = ROLE_REVOKED");
    assert(a.message.includes("deactivated"), "message mentions deactivated");
  }
}

console.log("== invalidated ==");
{
  const a = decideConfigAdmission([bundle({ expired: true })]);
  assert(a.valid === false, "active but expired valid_to → denied");
  if (!a.valid) assert(a.outcome === "CONFIG_INVALIDATED", "outcome = CONFIG_INVALIDATED");
}
{
  const a = decideConfigAdmission([bundle({ not_yet_valid: true })]);
  assert(a.valid === false && !a.valid && a.outcome === "CONFIG_INVALIDATED",
         "active but future valid_from → CONFIG_INVALIDATED");
}

console.log("== allowed ==");
{
  const a = decideConfigAdmission([bundle()]);
  assert(a.valid === true, "one active valid bundle → allowed");
}
{
  const a = decideConfigAdmission([bundle({ is_active: 0 }), bundle({ expired: true }), bundle()]);
  assert(a.valid === true, "one valid bundle among revoked/invalidated → allowed");
}

console.log("== governance (D-009 R6 capability-proof) ==");
{
  const a = decideRoleGovernance({ kind: "missing" });
  assert(a.valid === false, "missing role → denied");
  if (!a.valid) assert(a.outcome === "ROLE_MISSING", "outcome = ROLE_MISSING");
}
{
  const a = decideRoleGovernance({ kind: "runtime_persona" });
  assert(a.valid === true, "runtime persona (absent from governance store) → allowed");
}
{
  const a = decideRoleGovernance({ kind: "expired" });
  assert(a.valid === false, "expired role → denied");
  if (!a.valid) assert(a.outcome === "ROLE_EXPIRED", "outcome = ROLE_EXPIRED");
}
{
  const a = decideRoleGovernance({ kind: "current", owns_domains: null });
  assert(a.valid === false, "null owns_domains → denied");
  if (!a.valid) assert(a.outcome === "CAPABILITY_INSUFFICIENT", "null owns_domains → CAPABILITY_INSUFFICIENT");
}
{
  const a = decideRoleGovernance({ kind: "current", owns_domains: [] });
  assert(a.valid === false, "empty owns_domains → denied");
  if (!a.valid) assert(a.outcome === "CAPABILITY_INSUFFICIENT", "empty owns_domains → CAPABILITY_INSUFFICIENT");
}
{
  const a = decideRoleGovernance({ kind: "current", owns_domains: ["execution"] });
  assert(a.valid === true, "current role with capabilities → allowed");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
