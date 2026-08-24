/**
 * wr-compile CP-9 — release gate conformance (R-A-2026-08-15-005 + R-A-003).
 *
 * Locks the pure decision function that fuses D2 compare and R-A-003
 * classify: a compiled WR is release-eligible IFF compare passes AND the
 * ripple route is not reserved. FAIL and reserved both hold the WR.
 *
 * Tested invariants:
 *   AC1 — clean compare + conduit route → PASS, release=true.
 *   AC2 — clean compare + reserved route (R3/R4) → PASS verdict but
 *         release=false (held at VALIDATED).
 *   AC3 — failing compare → FAIL verdict, release=false, diffs recorded.
 *   AC4 — determinism: identical inputs → identical decision.
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/release-gate.test.ts
 */
import { describe, test, expect } from "vitest";

import { evaluateReleaseGate } from "./release-gate";

const PLAN = {
  goal: "inventory hardcoded ports/creds",
  filesAffected: [],
  acceptanceCriteria: ["inventory of ports/creds"],
  deliverable: "docs/t25/0.1-inventory.md",
};

describe("CP-9 release gate", () => {
  test("AC1 — clean compare + conduit route releases", () => {
    const d = evaluateReleaseGate(
      { ...PLAN },
      PLAN,
      { ripple: "R0", shape: "E" },
    );
    expect(d.verdict).toBe("WR_COMPILE_PASS");
    expect(d.release).toBe(true);
    expect(d.diffs).toEqual([]);
    expect(d.classification.route).toBe("conduit");
  });

  test("AC2 — clean compare + reserved (R3/R4) holds, PASS verdict", () => {
    for (const ripple of ["R3", "R4"] as const) {
      const d = evaluateReleaseGate({ ...PLAN }, PLAN, { ripple, shape: "A" });
      expect(d.verdict).toBe("WR_COMPILE_PASS"); // compare passed
      expect(d.release).toBe(false);              // but reserved holds it
      expect(d.classification.route).toBe("reserved");
      expect(d.reason).toMatch(/reserved/);
    }
  });

  test("AC3 — failing compare → FAIL verdict, held", () => {
    const d = evaluateReleaseGate(
      { ...PLAN, filesAffected: ["extra.ts"] },
      PLAN,
      { ripple: "R1", shape: "E" },
    );
    expect(d.verdict).toBe("WR_COMPILE_FAIL");
    expect(d.release).toBe(false);
    expect(d.diffs.length).toBeGreaterThan(0);
    expect(d.reason).toMatch(/compile FAIL/);
  });

  test("AC4 — deterministic", () => {
    const a = evaluateReleaseGate({ ...PLAN }, PLAN, { ripple: "R2", shape: "E" });
    const b = evaluateReleaseGate({ ...PLAN }, PLAN, { ripple: "R2", shape: "E" });
    expect(a).toEqual(b);
    expect(a.classification.route).toBe("conduit-review");
    expect(a.release).toBe(true); // conduit-review is not reserved
  });
});
