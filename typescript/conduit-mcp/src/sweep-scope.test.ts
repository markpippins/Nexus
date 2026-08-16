/**
 * wr-compile CP-7 (D7) — pinned sweep scope conformance.
 *
 * Locks the D7 determinism contract: the recon sweep scope is a canonical
 * input with a deterministic serialization — same scope content → same
 * serialization (and therefore same future entityKey); changing one scope
 * element → different serialization (new identity).
 *
 * Tested invariants:
 *   AC1 — canonicalScope is order-insensitive (array/key order doesn't matter).
 *   AC2 — adding a directory changes the canonical scope.
 *   AC3 — changing a pattern changes the canonical scope.
 *   AC4 — the T25 0.1 baseline scope serializes deterministically (stable).
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/sweep-scope.test.ts
 */
import { describe, test, expect } from "vitest";

import { canonicalScope, SweepScope, T25_0_1_SCOPE } from "./sweep-scope";

describe("CP-7 (D7) pinned sweep scope", () => {
  test("AC1 — canonicalScope is order-insensitive", () => {
    const a: SweepScope = {
      directories: ["typescript/*-srv", "scripts/"],
      patterns: ["pgpass", "pguser"],
      tool: "grep",
      toolVersion: "3.11",
    };
    const b: SweepScope = {
      directories: ["scripts/", "typescript/*-srv"],
      patterns: ["pguser", "pgpass"],
      tool: "grep",
      toolVersion: "3.11",
    };
    expect(canonicalScope(a)).toBe(canonicalScope(b));
  });

  test("AC2 — adding a directory changes the canonical scope", () => {
    const base: SweepScope = { ...T25_0_1_SCOPE };
    const extended: SweepScope = {
      ...T25_0_1_SCOPE,
      directories: [...T25_0_1_SCOPE.directories, "python/"],
    };
    expect(canonicalScope(extended)).not.toBe(canonicalScope(base));
  });

  test("AC3 — changing a pattern changes the canonical scope", () => {
    const a: SweepScope = { ...T25_0_1_SCOPE };
    const b: SweepScope = { ...T25_0_1_SCOPE, patterns: ["ports"] };
    expect(canonicalScope(a)).not.toBe(canonicalScope(b));
  });

  test("AC4 — T25 0.1 baseline scope serializes deterministically", () => {
    expect(canonicalScope(T25_0_1_SCOPE)).toBe(canonicalScope(T25_0_1_SCOPE));
    expect(canonicalScope(T25_0_1_SCOPE)).toBe(
      JSON.stringify({
        directories: ["nexus/bin", "scripts/", "typescript/*-srv"],
        patterns: ["URLs", "jdbc", "pgpass", "pguser", "ports"],
        exclusions: [],
        tool: "grep",
        toolVersion: "3.11",
      }),
    );
  });
});
