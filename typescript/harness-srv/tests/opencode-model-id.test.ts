/**
 * Unit test: opencode model-id resolution (src/model.ts).
 *
 * Verifies the model/harness binding fix for T20 item A:
 *   1. config_json.opencodeProvider is canonical (string + object forms)
 *   2. A namespaced identifier resolves via the provider mapping, NOT the
 *      first-segment heuristic (z-ai/glm-5.2 → nvidia/z-ai/glm-5.2, never
 *      z-ai/z-ai/glm-5.2)
 *   3. The hardcoded fallback map is used when no config_json is supplied,
 *      including the corrected DeepSeek slug (deepseek, not deepseek-ai)
 *   4. Unmapped providers preserve legacy passthrough / first-segment
 *      heuristic behavior
 *
 * Usage: npx tsx tests/opencode-model-id.test.ts
 */

import { opencodeModelId, opencodeProviderFromConfig } from "../src/model";

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

console.log("== opencodeProviderFromConfig ==");
{
  assert(
    opencodeProviderFromConfig('{"opencodeProvider":"nvidia"}') === "nvidia",
    "JSON string config_json parses"
  );
  assert(
    opencodeProviderFromConfig({ opencodeProvider: "nvidia" }) === "nvidia",
    "object config_json passes through"
  );
  assert(opencodeProviderFromConfig(null) === undefined, "null → undefined");
  assert(opencodeProviderFromConfig(undefined) === undefined, "undefined → undefined");
  assert(opencodeProviderFromConfig("not json") === undefined, "unparseable string → undefined");
  assert(opencodeProviderFromConfig("{}") === undefined, "missing key → undefined");
  assert(
    opencodeProviderFromConfig('{"opencodeProvider":""}') === undefined,
    "empty value → undefined"
  );
}

console.log("== namespaced identifier + mapped provider ==");
{
  assert(
    opencodeModelId("prov-1783906359513", "z-ai/glm-5.2", "nvidia") === "nvidia/z-ai/glm-5.2",
    "GLM 5.2 → nvidia/z-ai/glm-5.2 (not z-ai/z-ai/glm-5.2)"
  );
  assert(
    opencodeModelId("prov-1783906359513", "nvidia/nemotron-3-super-120b-a12b", "nvidia") ===
      "nvidia/nvidia/nemotron-3-super-120b-a12b",
    "nemotron key already nvidia-namespaced → nvidia/nvidia/…"
  );
  // config_json (canonical) overrides the first-segment heuristic even when
  // the model identifier's first segment disagrees with the provider.
  assert(
    opencodeModelId("prov-1783906359513", "z-ai/glm-5.2", "openrouter") ===
      "openrouter/z-ai/glm-5.2",
    "override is authoritative regardless of identifier namespace"
  );
}

console.log("== map fallback (no config_json) ==");
{
  assert(
    opencodeModelId("prov-1783906359513", "z-ai/glm-5.2") === "nvidia/z-ai/glm-5.2",
    "nvidia map fallback for namespaced identifier"
  );
  assert(
    opencodeModelId("prov-deepseek", "deepseek-chat") === "deepseek/deepseek-chat",
    "deepseek map corrected to `deepseek` (not `deepseek-ai`)"
  );
  assert(
    opencodeModelId("prov-opencode", "big-pickle") === "opencode/big-pickle",
    "opencode bare identifier"
  );
  assert(
    opencodeModelId("prov-ollama", "qwen2.5-coder") === "ollama/qwen2.5-coder",
    "ollama bare identifier"
  );
}

console.log("== unmapped provider (legacy behavior) ==");
{
  assert(
    opencodeModelId("prov-anthropic", "claude-sonnet") === "claude-sonnet",
    "bare + unmapped → passthrough unchanged"
  );
  assert(
    opencodeModelId("prov-anthropic", "some-org/claude-sonnet") === "some-org/some-org/claude-sonnet",
    "namespaced + unmapped → first-segment heuristic"
  );
  assert(
    opencodeModelId("", "z-ai/glm-5.2") === "z-ai/z-ai/glm-5.2",
    "empty provider + namespaced → first-segment heuristic"
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
