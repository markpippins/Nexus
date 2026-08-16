/**
 * wr-compile CP-2 (D2) — deterministic pre-row compare operator conformance.
 *
 * Locks the compare half of D2: comparing a compiled WR against its plan spec
 * is a pure, deterministic diff over the four canonical fields. The verdict
 * is the release gate's pre-row input.
 *
 * Tested invariants:
 *   AC1 — matching recon WR+plan (filesAffected=[], deliverable set) passes.
 *   AC2 — filesAffected mismatch fails with a filesAffected diff.
 *   AC3 — goal mismatch fails.
 *   AC4 — a missing acceptance criterion fails.
 *   AC5 — deliverable mismatch (D1) fails.
 *   AC6 — plan deliverable present but WR deliverable absent fails.
 *   AC7 — determinism: identical inputs produce identical results.
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/compile-compare.test.ts
 */
import { describe, test, expect } from "vitest";

import { compareWrToPlan, CompareTarget } from "./compile-compare";

describe("CP-2 (D2) compare operator", () => {
  test("AC1 — matching recon WR+plan passes", () => {
    const wr: CompareTarget = {
      goal: "hardcoded port/cred inventory",
      filesAffected: [],
      acceptanceCriteria: ["inventory of hardcoded ports/creds"],
      deliverable: "docs/t25/0.1-hardcoded-port-cred-inventory.md",
    };
    const plan: CompareTarget = { ...wr };
    const result = compareWrToPlan(wr, plan);
    expect(result.pass).toBe(true);
    expect(result.diffs).toEqual([]);
  });

  test("AC2 — filesAffected mismatch fails", () => {
    const plan: CompareTarget = { filesAffected: ["a.ts"] };
    const wr: CompareTarget = { filesAffected: ["b.ts"] };
    const result = compareWrToPlan(wr, plan);
    expect(result.pass).toBe(false);
    expect(result.diffs.some((d) => d.startsWith("filesAffected mismatch"))).toBe(true);
  });

  test("AC3 — goal mismatch fails", () => {
    const plan: CompareTarget = { goal: "do the thing" };
    const wr: CompareTarget = { goal: "do another thing" };
    const result = compareWrToPlan(wr, plan);
    expect(result.pass).toBe(false);
    expect(result.diffs.some((d) => d.startsWith("goal mismatch"))).toBe(true);
  });

  test("AC4 — missing acceptance criterion fails", () => {
    const plan: CompareTarget = { acceptanceCriteria: ["A", "B"] };
    const wr: CompareTarget = { acceptanceCriteria: ["A"] };
    const result = compareWrToPlan(wr, plan);
    expect(result.pass).toBe(false);
    expect(result.diffs.some((d) => d.includes('acceptanceCriteria missing'))).toBe(true);
  });

  test("AC5 — deliverable mismatch fails", () => {
    const plan: CompareTarget = { deliverable: "docs/t25/0.1.md" };
    const wr: CompareTarget = { deliverable: "docs/t25/other.md" };
    const result = compareWrToPlan(wr, plan);
    expect(result.pass).toBe(false);
    expect(result.diffs.some((d) => d.startsWith("deliverable mismatch"))).toBe(true);
  });

  test("AC6 — plan deliverable present, WR deliverable absent fails", () => {
    const plan: CompareTarget = { deliverable: "docs/t25/0.1.md" };
    const wr: CompareTarget = {};
    const result = compareWrToPlan(wr, plan);
    expect(result.pass).toBe(false);
    expect(result.diffs.some((d) => d.startsWith("deliverable mismatch"))).toBe(true);
  });

  test("AC7 — determinism", () => {
    const wr: CompareTarget = { goal: "g", filesAffected: ["x"], acceptanceCriteria: ["c"] };
    const plan: CompareTarget = { goal: "G", filesAffected: ["x"], acceptanceCriteria: ["c", "d"] };
    expect(compareWrToPlan(wr, plan)).toEqual(compareWrToPlan(wr, plan));
  });
});
