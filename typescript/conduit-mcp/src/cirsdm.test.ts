import { describe, test, expect } from "vitest";
import {
  getEnforcementState,
  enforceTransition,
  gateWrTransition,
} from "./cirsdm";

// Real-CLI integration: spawns `python3 -m nexus_core.wrp.enforce_cli` with
// PYTHONPATH resolved to nexus/python. Verifies the subprocess bridge works
// end-to-end (the exact bug class: wrong PYTHONPATH / wrong invocation).
// Skipped automatically if Python/nexus_core is unavailable — the wrp suite
// already covers the pure caller.

const FORWARD = [
  { type: "WR_SUBMITTED", wrId: "wr-1", timestamp: "2026-08-01T00:00:00Z" },
  { type: "WR_VALIDATED", wrId: "wr-1", timestamp: "2026-08-01T00:00:01Z" },
  { type: "WR_QUEUED", wrId: "wr-1", timestamp: "2026-08-01T00:00:02Z" },
  { type: "WR_CLAIMED", wrId: "wr-1", timestamp: "2026-08-01T00:00:03Z" },
  { type: "WR_ACKED", wrId: "wr-1", timestamp: "2026-08-01T00:00:04Z" },
];

describe("cirsdm real-CLI bridge", () => {
  test("getEnforcementState returns the posture line", async () => {
    const state = await getEnforcementState();
    expect(state).toContain("CIR-SDM enforcement");
  });

  test("legal transition → reject=false", async () => {
    const result = await enforceTransition(FORWARD.slice(0, 2), {
      type: "WR_QUEUED",
      wrId: "wr-1",
      timestamp: "2026-08-01T00:00:05Z",
    });
    expect(result.reject).toBe(false);
    expect(result.decisions).toEqual([]);
  });

  test("reverse transition → reject=true with a decision", async () => {
    const result = await gateWrTransition(
      FORWARD,
      "WR_CLAIMED",
      "wr-1",
    );
    expect(result.reject).toBe(true);
    expect(result.decisions.length).toBe(1);
    expect(result.decisions[0].rule_id).toBe("cir-sdm.one-way-gate");
    expect(result.decisions[0].blocking).toBe(true);
  });
});
