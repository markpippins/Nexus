/**
 * wr-compile CP-3 (D3) — entityKey ownership conformance.
 *
 * Locks the D3 invariant at the compiler boundary: a compiler emits the
 * derivation rule + canonical inputs, NEVER a pre-computed entityKey. The
 * emission boundary (nexus_core.wrp.identity) owns identity derivation — a
 * compiler that ships a pre-computed key would silently change every identity
 * on any compiler change (contract drift).
 *
 * Tested invariants:
 *   AC1 — a clean CompilerOutput (no identity fields) passes the guard.
 *   AC2 — a top-level `entityKey` is rejected (IDENTITY_LEAK).
 *   AC3 — a top-level `identity` is rejected.
 *   AC4 — a top-level `entity_key` is rejected.
 *
 * The positive half of D3 (identical canonical inputs → identical boundary
 * entityKey) is already locked cross-language by wr-conf-010
 * (test_conformance_ccnf_identity.py), so it is not duplicated here.
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/compile-identity.test.ts
 */
import { describe, test, expect } from "vitest";

import { CompilerOutput, validateCompilerOutput } from "./runtime-kernel";

function baseOutput(): CompilerOutput {
  return {
    wrId: "wr-cp3",
    intent: {
      type: "recon",
      inputs: { deliverable: "docs/t25/0.1.md" },
      objective: "inventory",
    },
    constraints: { deterministic: true },
    opTrace: { ipNodes: [], resolvedOps: [], registryVersion: "1" },
  };
}

describe("CP-3 (D3) entityKey ownership", () => {
  test("AC1 — clean output passes the guard", () => {
    expect(() => validateCompilerOutput(baseOutput())).not.toThrow();
  });

  test("AC2 — pre-computed entityKey is rejected", () => {
    const out = { ...baseOutput(), entityKey: "precomputed" };
    expect(() => validateCompilerOutput(out)).toThrow(/IDENTITY_LEAK/);
  });

  test("AC3 — pre-computed identity is rejected", () => {
    const out = { ...baseOutput(), identity: { entity_key: "x" } };
    expect(() => validateCompilerOutput(out)).toThrow(/IDENTITY_LEAK/);
  });

  test("AC4 — pre-computed entity_key is rejected", () => {
    const out = { ...baseOutput(), entity_key: "x" };
    expect(() => validateCompilerOutput(out)).toThrow(/IDENTITY_LEAK/);
  });
});
