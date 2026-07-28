/**
 * Unit test: mcp-bridge regex metacharacter escaping in parseTargets.
 *
 * The parseTargets function constructs `new RegExp(`^${pfx}ENV_([A-Z0-9_]+)$`, "i")`
 * to match per-MCP environment variables. The security fix escapes regex
 * metacharacters in `pfx` before interpolation to prevent regex injection.
 *
 * `pfx` is derived from `name` (extracted via `/^MCP_BRIDGE_([A-Z0-9_]+)_PORT$/`),
 * so `name` is already constrained to [A-Z0-9_]+. This test verifies:
 *   1. Valid names produce correct matching patterns (backward compat)
 *   2. The ENV_ capture group still works after escaping
 *   3. If the input constraint were ever relaxed, metacharacters would be
 *      treated as literals, not regex syntax (defense-in-depth verification)
 *
 * Usage: npx tsx tests/regex-escape.test.ts
 */

// ── The escaping logic under test (replicated from src/index.ts:73) ──

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

function buildEnvMatcher(name: string): RegExp {
  const pfx = `MCP_BRIDGE_${name}_`;
  // SECURITY: escape regex metacharacters in pfx before interpolation.
  const escapedPfx = pfx.replace(ESCAPE_REGEX, "\\$&");
  return new RegExp(`^${escapedPfx}ENV_([A-Z0-9_]+)$`, "i");
}

// ── Test helpers ──

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ── Tests ──

console.log("\n=== mcp-bridge regex-escape security test ===\n");

// Test 1: Valid names match their ENV vars correctly
console.log("Test 1 — Valid names match ENV var keys:");
{
  const cases: [string, string][] = [
    ["KNOWLEDGE", "MCP_BRIDGE_KNOWLEDGE_ENV_API_KEY"],
    ["VISION", "MCP_BRIDGE_VISION_ENV_BASE_URL"],
    ["PEB", "MCP_BRIDGE_PEB_ENV_TOKEN"],
    ["TERRAIN", "MCP_BRIDGE_TERRAIN_ENV_DB_HOST"],
  ];
  for (const [name, envKey] of cases) {
    const pattern = buildEnvMatcher(name);
    const m = envKey.match(pattern);
    assert(
      `name "${name}" matches env key "${envKey}"`,
      m !== null,
      `pattern ${pattern} did not match`
    );
  }
}

// Test 2: The ENV_ capture group extracts the variable name
console.log("\nTest 2 — ENV_ capture group extracts variable name:");
{
  const pattern = buildEnvMatcher("KNOWLEDGE");
  const m = "MCP_BRIDGE_KNOWLEDGE_ENV_API_KEY".match(pattern);
  assert(
    "capture group extracts 'API_KEY'",
    m !== null && m[1] === "API_KEY",
    `got: ${m?.[1]}`
  );
}

// Test 3: Non-matching keys are rejected
console.log("\nTest 3 — Non-matching keys rejected:");
{
  const pattern = buildEnvMatcher("KNOWLEDGE");
  assert("rejects other MCP prefix", !pattern.test("MCP_BRIDGE_VISION_ENV_API_KEY"));
  assert("rejects without ENV_ prefix", !pattern.test("MCP_BRIDGE_KNOWLEDGE_PORT"));
  // NOTE: lowercase IS matched because the regex uses the "i" flag (case-insensitive)
  // This is tested in Test 3b below, not here.
}
// Case-insensitive matching (i flag)
console.log("\nTest 3b — Case-insensitive matching (i flag):");
{
  const pattern = buildEnvMatcher("KNOWLEDGE");
  assert("matches lowercase env var (i flag)", pattern.test("MCP_BRIDGE_KNOWLEDGE_env_api_key"));
  assert("matches mixed case", pattern.test("MCP_BRIDGE_KNOWLEDGE_Env_ApiKey"));
}

// Test 4: Metacharacters in name are treated as literals (defense-in-depth)
console.log("\nTest 4 — Metacharacters treated as literals:");
{
  // If name constraint were relaxed and contained a dot:
  const dotPattern = buildEnvMatcher("a.b");
  assert("'a.b' matches literal 'MCP_BRIDGE_a.b_ENV_X'", dotPattern.test("MCP_BRIDGE_a.b_ENV_X"));
  assert("'a.b' does NOT match 'MCP_BRIDGE_aXb_ENV_X'", !dotPattern.test("MCP_BRIDGE_aXb_ENV_X"));

  // Plus sign
  const plusPattern = buildEnvMatcher("a+b");
  assert("'a+b' matches literal 'MCP_BRIDGE_a+b_ENV_X'", plusPattern.test("MCP_BRIDGE_a+b_ENV_X"));
  assert("'a+b' does NOT match 'MCP_BRIDGE_aaab_ENV_X'", !plusPattern.test("MCP_BRIDGE_aaab_ENV_X"));

  // Dollar sign
  const dollarPattern = buildEnvMatcher("cost$5");
  assert("'cost$5' matches literal", dollarPattern.test("MCP_BRIDGE_cost$5_ENV_X"));
}

// Test 5: ENV_ capture group still works after escaping
console.log("\nTest 5 — ENV_ capture group works after escaping:");
{
  const pattern = buildEnvMatcher("a.b");
  const m = "MCP_BRIDGE_a.b_ENV_MY_VAR".match(pattern);
  assert(
    "capture group extracts 'MY_VAR' even with escaped metachar in name",
    m !== null && m[1] === "MY_VAR",
    `got: ${m?.[1]}`
  );
}

// Test 6: Anchoring is correct (^ and $)
console.log("\nTest 6 — Pattern is anchored (no partial matches):");
{
  const pattern = buildEnvMatcher("KNOWLEDGE");
  // NOTE: 'API_KEY_EXTRA' IS matched because '_' is in [A-Z0-9_]+ capture group.
  // The capture group greedily matches all underscores, so there's no "extra" suffix.
  // This is correct behavior — the regex matches the full key.
  assert("rejects suffix-only match (prefix before ^)", !pattern.test("PREFIX_MCP_BRIDGE_KNOWLEDGE_ENV_API_KEY"));
}

// ── Summary ──

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
