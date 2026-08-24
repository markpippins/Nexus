/**
 * wr-compile CP-8 (R-A-2026-08-15-003) — ripple classifier conformance.
 *
 * Locks the classification pass that sits after compile→compare: a
 * human/Architect-assigned ripple + shape derives a deterministic route, and
 * the R3/R4 reserve path is never auto-armed. The classifier is
 * human-assigned first — it derives the route from a supplied assignment and
 * does NOT mechanically score the seven dimensions into a ripple level.
 *
 * Tested invariants:
 *   AC1 — route mapping: R0/R1 → conduit, R2 → conduit-review, R3/R4 → reserved.
 *   AC2 — validation: unknown ripple/shape raise (fail-closed).
 *   AC3 — R3/R4 never auto-armed; reserved requires explicit release.
 *   AC4 — R0–R2 auto-arm (conduit / conduit-review are not reserved).
 *   AC5 — resourceHints encoding (`ripple:`, `shape:`, `route:`).
 *   AC6 — T25 DAG golden fixture: the doctrine's node table routes correctly.
 *   AC7 — determinism: classify is a pure function of its assignment.
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/ripple-classifier.test.ts
 */
import { describe, test, expect } from "vitest";

import {
  classify,
  routeFromRipple,
  isReserved,
  shouldAutoArm,
  requiresExplicitRelease,
  toResourceHints,
  RIPPLE_DIMENSIONS,
  RippleLevel,
  NodeShape,
  Route,
} from "./ripple-classifier";

describe("CP-8 (R-A-003) ripple classifier", () => {
  test("AC1 — route mapping is deterministic per ripple level", () => {
    const cases: Array<[RippleLevel, Route]> = [
      ["R0", "conduit"],
      ["R1", "conduit"],
      ["R2", "conduit-review"],
      ["R3", "reserved"],
      ["R4", "reserved"],
    ];
    for (const [ripple, route] of cases) {
      expect(routeFromRipple(ripple)).toBe(route);
      expect(classify({ ripple, shape: "E" }).route).toBe(route);
    }
  });

  test("AC2 — unknown ripple/shape fail closed", () => {
    expect(() => classify({ ripple: "R5" as RippleLevel, shape: "E" })).toThrow(/ripple/);
    expect(() => classify({ ripple: "R1", shape: "X" as NodeShape })).toThrow(/shape/);
  });

  test("AC3 — R3/R4 are never auto-armed and require explicit release", () => {
    for (const ripple of ["R3", "R4"] as RippleLevel[]) {
      const c = classify({ ripple, shape: "E" });
      expect(c.route).toBe("reserved");
      expect(isReserved(c.route)).toBe(true);
      expect(shouldAutoArm(c)).toBe(false);
      expect(requiresExplicitRelease(c)).toBe(true);
    }
  });

  test("AC4 — R0–R2 auto-arm (not reserved)", () => {
    for (const ripple of ["R0", "R1", "R2"] as RippleLevel[]) {
      const c = classify({ ripple, shape: "B" });
      expect(isReserved(c.route)).toBe(false);
      expect(shouldAutoArm(c)).toBe(true);
      expect(requiresExplicitRelease(c)).toBe(false);
    }
  });

  test("AC5 — resourceHints encode ripple/shape/route", () => {
    const c = classify({ ripple: "R3", shape: "E", rationale: "security + cross-system" });
    expect(toResourceHints(c)).toEqual(["ripple:R3", "shape:E", "route:reserved"]);
  });

  test("AC7 — classify is a pure function of its assignment", () => {
    const a = classify({ ripple: "R2", shape: "E", dimensions: { contract: true } });
    const b = classify({ ripple: "R2", shape: "E", dimensions: { contract: true } });
    expect(a).toEqual(b);
    expect(a.route).toBe("conduit-review");
  });

  test("AC0 — the seven scored dimensions are present", () => {
    expect(RIPPLE_DIMENSIONS).toEqual([
      "schema", "contract", "clients", "crossSystem",
      "security", "authority", "liveState",
    ]);
  });

  test("AC6 — T25 DAG golden fixture routes correctly (R-A-003 §3)", () => {
    // The doctrine's node table. Shape is orthogonal to route, so the
    // compound "E/B" shapes collapse to one representative here; the invariant
    // under test is the ripple→route derivation.
    const dag: Array<{ node: string; ripple: RippleLevel; shape: NodeShape; route: Route }> = [
      { node: "0.1", ripple: "R0", shape: "E", route: "conduit" },
      { node: "0.2", ripple: "R0", shape: "E", route: "conduit" },
      { node: "0.3", ripple: "R0", shape: "E", route: "conduit" },
      { node: "0.4", ripple: "R0", shape: "E", route: "conduit" },
      { node: "1.1", ripple: "R4", shape: "A", route: "reserved" },
      { node: "1.2", ripple: "R2", shape: "E", route: "conduit-review" },
      { node: "1.3", ripple: "R2", shape: "B", route: "conduit-review" },
      { node: "1.4", ripple: "R4", shape: "A", route: "reserved" },
      { node: "1.5", ripple: "R1", shape: "E", route: "conduit" },
      { node: "2.1", ripple: "R3", shape: "A", route: "reserved" },
      { node: "2.2", ripple: "R2", shape: "B", route: "conduit-review" },
      { node: "2.3", ripple: "R3", shape: "E", route: "reserved" },
      { node: "2.4", ripple: "R2", shape: "B", route: "conduit-review" },
      { node: "3.1", ripple: "R0", shape: "E", route: "conduit" },
      { node: "3.2", ripple: "R3", shape: "E", route: "reserved" },
      { node: "3.3", ripple: "R1", shape: "E", route: "conduit" },
      { node: "4.1", ripple: "R0", shape: "E", route: "conduit" },
      { node: "4.5", ripple: "R1", shape: "E", route: "conduit" },
    ];
    for (const { node, ripple, shape, route } of dag) {
      const c = classify({ ripple, shape, rationale: `T25 node ${node}` });
      expect(c.route, `node ${node}`).toBe(route);
    }
  });
});
