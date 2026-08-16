/**
 * wr-compile CP-4 (D4) — UNRESOLVED ops first-class conformance.
 *
 * Locks the D4 invariant: a compiled WR may carry `registryVersion:"UNRESOLVED"`
 * / empty `resolvedOps` and be stored at VALIDATED, but it is never admissible
 * to execution — the explicit VALIDATED→QUEUED advance is rejected with
 * UNRESOLVED_OPS, and the tick loop never auto-advances it.
 *
 * Tested invariants:
 *   AC1 — isUnresolvedOps true for registryVersion "UNRESOLVED".
 *   AC2 — isUnresolvedOps true for empty resolvedOps.
 *   AC3 — isUnresolvedOps true when opTrace is missing (fail-closed).
 *   AC4 — isUnresolvedOps false for a resolved opTrace.
 *   AC5 — validateTransitionWithOps rejects VALIDATED→QUEUED (WR_VALIDATED)
 *         with UNRESOLVED_OPS.
 *   AC6 — validateTransitionWithOps allows VALIDATED→QUEUED when resolved.
 *   AC7 — validateTransitionWithOps delegates normal transitions.
 *   AC8 — decide() returns null for VALIDATED (tick never auto-advances).
 *   AC9 — getOpTrace extracts opTrace from the WR_SUBMITTED event.
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/runtime-unresolved.test.ts
 */
import { describe, test, expect } from "vitest";

import {
  decide,
  getOpTrace,
  isUnresolvedOps,
  validateTransitionWithOps,
  WorkRequestState,
  RuntimeEvent,
} from "./runtime-kernel";

const RESOLVED = { ipNodes: [], resolvedOps: ["READ_FILE"], registryVersion: "1" };
const UNRESOLVED = { ipNodes: [], resolvedOps: [], registryVersion: "UNRESOLVED" };

function state(status: WorkRequestState["status"]): WorkRequestState {
  return {
    wrId: "wr-d4",
    status,
    version: 1,
    lastEvent: "WR_SUBMITTED",
    lastTimestamp: "2026-08-01T00:00:00Z",
    createdAt: "2026-08-01T00:00:00Z",
  };
}

describe("CP-4 (D4) UNRESOLVED ops", () => {
  test("AC1 — registryVersion UNRESOLVED is unresolved", () => {
    expect(isUnresolvedOps(UNRESOLVED)).toBe(true);
  });

  test("AC2 — empty resolvedOps is unresolved", () => {
    expect(isUnresolvedOps({ ipNodes: [], resolvedOps: [], registryVersion: "2" })).toBe(true);
  });

  test("AC3 — missing opTrace is unresolved (fail-closed)", () => {
    expect(isUnresolvedOps(undefined)).toBe(true);
  });

  test("AC4 — resolved opTrace is not unresolved", () => {
    expect(isUnresolvedOps(RESOLVED)).toBe(false);
  });

  test("AC5 — VALIDATED→QUEUED with unresolved ops is rejected", () => {
    expect(() =>
      validateTransitionWithOps("VALIDATED", "WR_VALIDATED", UNRESOLVED),
    ).toThrow(/UNRESOLVED_OPS/);
  });

  test("AC6 — VALIDATED→QUEUED with resolved ops is allowed", () => {
    expect(
      validateTransitionWithOps("VALIDATED", "WR_VALIDATED", RESOLVED),
    ).toBe("QUEUED");
  });

  test("AC7 — normal transitions delegate", () => {
    expect(validateTransitionWithOps("DRAFT", "WR_SUBMITTED", undefined)).toBe("VALIDATED");
  });

  test("AC8 — decide() never auto-advances VALIDATED", () => {
    expect(decide(state("VALIDATED"))).toBeNull();
  });

  test("AC9 — getOpTrace extracts opTrace from WR_SUBMITTED", () => {
    const events: RuntimeEvent[] = [
      { type: "WR_SUBMITTED", wrId: "wr-d4", payload: { opTrace: UNRESOLVED } },
    ];
    expect(getOpTrace(events)).toEqual(UNRESOLVED);
    expect(getOpTrace([])).toBeUndefined();
  });
});
