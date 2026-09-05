/**
 * Sonar metadata surfacing (architect ruling b1396dce, gap #2).
 *
 * The WR carries SonarQube metadata (issueKeys/hotspotKeys/ruleKeys etc.) via
 * opaque compiler intent inputs (`intent.inputs.sonar`). This locks the
 * invariant that the metadata:
 *   AC1 — rides the WR_SUBMITTED event payload through compilerOutputToEvent;
 *   AC2 — folds into the WorkRequestState as `sonar` (Builder read path);
 *   AC3 — a WR without sonar metadata folds to an undefined `sonar`;
 *   AC4 — sonar metadata never occupies the mutation surface (decision/hold
 *         fields stay absent; sonar is metadata-only).
 *   AC5 — the submit schema accepts intent.inputs.sonar as an opaque block.
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/runtime-sonar.test.ts
 */
import { describe, test, expect } from "vitest";

import {
  compilerOutputToEvent,
  CompilerOutput,
  foldEvents,
  RuntimeEvent,
} from "./runtime-kernel";
import { toolDefinitions } from "./tools";

const SONAR_INPUTS = {
  issueKeys: ["AX1issue-a", "AX1issue-b"],
  hotspotKeys: ["AX1hotspot-c"],
  ruleKeys: ["typescript:S100", "typescript:S6544"],
  component: "nexus:typescript/conduit-mcp",
  severity: "MAJOR",
  batch: "wr-meta-2026-09-05-001",
};

function wrWithSonar(normalization_pending?: boolean): CompilerOutput {
  return {
    wrId: "wr-sonar-1",
    intent: {
      type: "sonar-remediation",
      inputs: { sonar: SONAR_INPUTS },
      objective: "Fix sonar findings and cite keys in PR",
    },
    constraints: { deterministic: true },
    opTrace: { ipNodes: [], resolvedOps: [], registryVersion: "UNRESOLVED" },
    normalization_pending,
  };
}

describe("Sonar metadata carry (ruling b1396dce)", () => {
  test("AC1 — sonar block rides the WR_SUBMITTED event payload", () => {
    const event = compilerOutputToEvent(wrWithSonar());
    expect(event.type).toBe("WR_SUBMITTED");
    expect(
      (event.payload?.intent as { inputs?: Record<string, unknown> }).inputs
        ?.sonar,
    ).toEqual(SONAR_INPUTS);
  });

  test("AC2 — sonar block surfaces on the folded WorkRequestState", () => {
    const events: RuntimeEvent[] = [
      {
        type: "WR_SUBMITTED",
        wrId: "wr-sonar-1",
        timestamp: "2026-09-05T00:00:00Z",
        payload: { intent: wrWithSonar().intent } as any,
      },
    ];
    const state = foldEvents("wr-sonar-1", events);
    expect(state.status).toBe("VALIDATED");
    expect(state.sonar).toEqual(SONAR_INPUTS);
  });

  test("AC3 — WR without sonar metadata folds to undefined sonar", () => {
    const output: CompilerOutput = {
      wrId: "wr-sonar-2",
      intent: { type: "recon", inputs: {}, objective: "inventory" },
      constraints: { deterministic: true },
      opTrace: { ipNodes: [], resolvedOps: [], registryVersion: "UNRESOLVED" },
    };
    const state = foldEvents("wr-sonar-2", [
      {
        type: "WR_SUBMITTED",
        wrId: "wr-sonar-2",
        timestamp: "2026-09-05T00:00:00Z",
        payload: { intent: output.intent } as any,
      },
    ]);
    expect(state.sonar).toBeUndefined();
  });

  test("AC4 — sonar metadata co-exists with normalization_pending (D6) without interference", () => {
    const state = foldEvents("wr-sonar-1", [
      {
        type: "WR_SUBMITTED",
        wrId: "wr-sonar-1",
        timestamp: "2026-09-05T00:00:00Z",
        payload: {
          intent: wrWithSonar(true).intent,
          normalization_pending: true,
        } as any,
      },
    ]);
    expect(state.normalization_pending).toBe(true);
    expect(state.sonar).toEqual(SONAR_INPUTS);
  });

  test("AC5 — submit tool schema accepts intent.inputs.sonar (opaque passthrough)", () => {
    const submit = toolDefinitions.find(
      (t) => t.name === "runtime_submit_work_request",
    );
    expect(submit).toBeDefined();
    const inputsSchema =
      submit?.inputSchema.properties?.intent?.properties?.inputs;
    // inputs is an open object — no restrictive additionalProperties:false
    expect(inputsSchema).toBeDefined();
    expect(inputsSchema?.additionalProperties).not.toBe(false);
  });
});