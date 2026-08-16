/**
 * wr-compile CP-6 (D6) — normalization_pending HELD marker conformance.
 *
 * Locks the D6 invariant: a compiled-and-PASSing but deliberately unreleased
 * WR carries an explicit `normalization_pending` marker on the WR (never on a
 * conduit plan). This makes "compiled, waiting on the gate" queryably distinct
 * from "never compiled" and "failed".
 *
 * Tested invariants:
 *   AC1 — a WR_SUBMITTED event with normalization_pending:true folds to a
 *         state with normalization_pending true (and status VALIDATED).
 *   AC2 — a WR without the marker folds to a falsy normalization_pending.
 *   AC3 — compilerOutputToEvent carries the marker into the event payload.
 *   AC4 — a held WR (VALIDATED + normalization_pending) is never auto-advanced
 *         by decide().
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/runtime-held.test.ts
 */
import { describe, test, expect } from "vitest";

import {
  compilerOutputToEvent,
  CompilerOutput,
  decide,
  foldEvents,
  RuntimeEvent,
  WorkRequestState,
} from "./runtime-kernel";

describe("CP-6 (D6) normalization_pending marker", () => {
  test("AC1 — held WR folds to normalization_pending true at VALIDATED", () => {
    const events: RuntimeEvent[] = [
      { type: "WR_SUBMITTED", wrId: "wr-6", timestamp: "2026-08-01T00:00:00Z", payload: { normalization_pending: true } },
    ];
    const state = foldEvents("wr-6", events);
    expect(state.status).toBe("VALIDATED");
    expect(state.normalization_pending).toBe(true);
  });

  test("AC2 — unmarked WR folds to falsy normalization_pending", () => {
    const events: RuntimeEvent[] = [
      { type: "WR_SUBMITTED", wrId: "wr-6b", timestamp: "2026-08-01T00:00:00Z", payload: {} },
    ];
    expect(foldEvents("wr-6b", events).normalization_pending).toBeFalsy();
  });

  test("AC3 — compilerOutputToEvent carries the marker into payload", () => {
    const output: CompilerOutput = {
      wrId: "wr-6c",
      intent: { type: "recon", inputs: {}, objective: "inventory" },
      constraints: { deterministic: true },
      opTrace: { ipNodes: [], resolvedOps: [], registryVersion: "UNRESOLVED" },
      normalization_pending: true,
    };
    const event = compilerOutputToEvent(output);
    expect(event.payload?.normalization_pending).toBe(true);
  });

  test("AC4 — a held VALIDATED WR is never auto-advanced", () => {
    const state: WorkRequestState = {
      wrId: "wr-6",
      status: "VALIDATED",
      version: 1,
      lastEvent: "WR_SUBMITTED",
      lastTimestamp: "2026-08-01T00:00:00Z",
      createdAt: "2026-08-01T00:00:00Z",
      normalization_pending: true,
    };
    expect(decide(state)).toBeNull();
  });
});
