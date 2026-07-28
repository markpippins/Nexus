/**
 * Unit test: harness-srv regex metacharacter escaping in parseOutcome.
 *
 * The parseOutcome function constructs `new RegExp(`\b${outcome.code...}\b`, "i")`
 * for a keyword-scan fallback. The security fix escapes regex metacharacters
 * in outcome.code before interpolation to prevent regex injection / ReDoS.
 *
 * This test verifies the escaping logic directly (parseOutcome is not exported)
 * by replicating the exact escape + underscore-replacement pattern and checking
 * that:
 *   1. Valid outcome codes (alphanumeric + underscore) produce identical results
 *      with and without escaping (backward compatibility)
 *   2. Codes with regex metacharacters are treated as literals, not regex syntax
 *   3. The underscore → [-_]? replacement still works correctly after escaping
 *
 * Usage: npx tsx tests/regex-escape.test.ts
 */

// ── The escaping logic under test (replicated from src/index.ts:443) ──

const ESCAPE_REGEX = /[.*+?^${}()|[\]\\]/g;

function buildPattern(code: string): RegExp {
  // SECURITY: escape regex metacharacters in outcome.code before interpolation
  const escapedCode = code.replace(ESCAPE_REGEX, "\\$&");
  return new RegExp(`\\b${escapedCode.replace(/_/g, "[-_]?")}\\b`, "i");
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

console.log("\n=== harness-srv regex-escape security test ===\n");

// Test 1: Valid outcome codes produce correct patterns (backward compat)
console.log("Test 1 — Valid outcome codes match their literal text:");
{
  const cases: [string, string][] = [
    ["completed", "completed"],
    ["review_pass", "review_pass"],
    ["plan_create", "plan_create"],
    ["a", "a"],
  ];
  for (const [code, text] of cases) {
    const pattern = buildPattern(code);
    assert(
      `code "${code}" matches text "${text}"`,
      pattern.test(text),
      `pattern ${pattern} did not match`
    );
  }
}

// Test 2: Underscore flexibility preserved (foo_bar matches foo-bar and foobar)
console.log("\nTest 2 — Underscore → [-_]? replacement still works:");
{
  const pattern = buildPattern("review_pass");
  assert("review_pass matches 'review_pass'", pattern.test("review_pass"));
  assert("review_pass matches 'review-pass'", pattern.test("review-pass"));
  assert("review_pass matches 'reviewpass'", pattern.test("reviewpass"));
}

// Test 3: Regex metacharacters are treated as literals
console.log("\nTest 3 — Metacharacters treated as literals, not regex syntax:");
{
  // A dot should match a literal dot, not "any character"
  const dotPattern = buildPattern("a.b");
  assert("'a.b' matches literal 'a.b'", dotPattern.test("a.b"));
  assert("'a.b' does NOT match 'aXb' (dot is literal)", !dotPattern.test("aXb"));

  // A plus should match a literal plus, not "one or more"
  const plusPattern = buildPattern("a+b");
  assert("'a+b' matches literal 'a+b'", plusPattern.test("a+b"));
  assert("'a+b' does NOT match 'aaab' (plus is literal)", !plusPattern.test("aaab"));

  // Parentheses should be literal, not a capture group
  // NOTE: \b word boundary requires a word char adjacent to the match.
  // ')' is non-word, so the char after it must be a word char for \b to match.
  const parenPattern = buildPattern("test(value)");
  assert("'test(value)' matches 'x test(value)y'", parenPattern.test("x test(value)y"));
  assert("'test(value)' does NOT match 'testvalue'", !parenPattern.test("testvalue"));

  // Dollar sign should be literal, not end-of-string anchor
  const dollarPattern = buildPattern("cost$5");
  assert("'cost$5' matches 'x cost$5 y'", dollarPattern.test("x cost$5 y"));
  assert("'cost$5' does NOT match 'costX5' (dollar is literal)", !dollarPattern.test("costX5"));

  // Square brackets should be literal, not character class
  // NOTE: ']' is non-word, so the char after it must be a word char for \b to match.
  const bracketPattern = buildPattern("arr[0]");
  assert("'arr[0]' matches 'x arr[0]y'", bracketPattern.test("x arr[0]y"));
  assert("'arr[0]' does NOT match 'arrX' (brackets are literal)", !bracketPattern.test("arrX"));
}

// Test 4: Mixed metacharacters + underscores
console.log("\nTest 4 — Metacharacter escaping + underscore replacement combined:");
{
  const pattern = buildPattern("a.b_c");
  assert("'a.b_c' matches 'a.b_c'", pattern.test("a.b_c"));
  assert("'a.b_c' matches 'a.b-c'", pattern.test("a.b-c"));
  assert("'a.b_c' matches 'a.bc'", pattern.test("a.bc"));
  assert("'a.b_c' does NOT match 'aXb_c' (dot is literal)", !pattern.test("aXb_c"));
}

// Test 5: Injection payloads are neutralized
console.log("\nTest 5 — Injection payloads neutralized:");
{
  // A semicolon should not terminate the regex
  const semiPattern = buildPattern("ok; DROP TABLE");
  assert("'ok; DROP TABLE' matches literal", semiPattern.test("ok; DROP TABLE"));

  // A backreference-like pattern should be literal
  // NOTE: \b requires word char adjacent; backslash is non-word, so embed in context
  const backrefPattern = buildPattern("x\\1y");
  assert("'x\\1y' matches literal backslash-one in context", backrefPattern.test("z x\\1y w"));
}

// Test 6: Empty string edge case
console.log("\nTest 6 — Empty string edge case:");
{
  const pattern = buildPattern("");
  // \b\b is a valid regex (matches a word boundary); test just verifies no crash
  assert("empty string does not crash", pattern !== undefined);
}

// ── Summary ──

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
