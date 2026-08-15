/**
 * Unit test: harness-srv governance receipt payload builder.
 *
 * Every execution channel leaves a governance event (peb.governance_events)
 * on completion via vision.receipts. harness-srv emits LOSM-typed receipts
 * through buildGovernanceReceiptPayload → POST /vision/receipts on
 * conduit-mcp. This test verifies the pure payload builder:
 *   1. Payload shape matches the /vision/receipts route contract
 *      (id, plan_id, type, agent_role, session_id, summary, metadata_json,
 *      tokens_used, created_at)
 *   2. Known executor roles pass through to agent_role unchanged
 *   3. Unknown roles fall back to "builder" (mirrors
 *      tackle.vision_bridge.issue_receipt pass-through whitelist)
 *   4. metadata_json is valid JSON and merges the harness_channel marker
 *
 * Usage: npx tsx tests/governance-receipt.test.ts
 */

import { buildGovernanceReceiptPayload } from "../src/governance";

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

function payloadFor(type: string, agentRole = "engineer"): Record<string, any> {
  return buildGovernanceReceiptPayload({
    planId: "11111111-2222-3333-4444-555555555555",
    type,
    agentRole,
    sessionId: "job-abc12345",
    summary: "harness-srv test run",
    metadata: { exit_code: 0 },
  });
}

console.log("== payload contract ==");
{
  const p = payloadFor("REVIEW_PASS");
  assert(typeof p.id === "string" && p.id.startsWith("rec-"), "id prefixed with rec-");
  assert(p.plan_id === "11111111-2222-3333-4444-555555555555", "plan_id echoes the wind_task_id");
  assert(p.type === "REVIEW_PASS", "type passed through");
  assert(p.session_id === "job-abc12345", "session_id is the harness job id");
  assert(p.tokens_used === 0, "tokens_used defaults to 0");
  assert(typeof p.created_at === "string" && !isNaN(Date.parse(p.created_at)), "created_at is an ISO timestamp");
  const meta = JSON.parse(p.metadata_json);
  assert(meta.harness_channel === true, "metadata_json carries harness_channel marker");
  assert(meta.exit_code === 0, "metadata_json carries caller metadata");
  const idParts = p.id.split("-");
  assert(idParts.length >= 4, "id has type suffix segment");
}

console.log("== executor whitelist (mirror of DEFAULT_KNOWN_EXECUTORS) ==");
{
  const known = [
    "planner", "builder", "reviewer", "analyst",
    "critic", "inspector", "architect", "engineer", "leased-builder",
    // harness-internal executor (T16), mirrors the Python
    // _PASS_THROUGH_EXECUTORS = DEFAULT_KNOWN_EXECUTORS | {"watchdog"}
    "watchdog",
  ];
  for (const role of known) {
    assert(payloadFor("PLAN_CREATE", role).agent_role === role, `${role} passes through to agent_role`);
  }
  assert(payloadFor("PLAN_CREATE", "some-rando").agent_role === "builder", "unknown role falls back to builder");
}

console.log("== id uniqueness across chain ==");
{
  const ids = new Set([
    payloadFor("PLAN_CREATE").id,
    payloadFor("IMPLEMENTATION").id,
    payloadFor("REVIEW_PASS").id,
  ]);
  assert(ids.size === 3, "each receipt in the chain gets a distinct id");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
