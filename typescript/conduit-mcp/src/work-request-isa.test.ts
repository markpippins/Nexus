/**
 * wr-compile CP-1 (D1) — deliverable field conformance.
 *
 * Locks the smallest invariant from ruling D1: a recon WorkRequest carries a
 * first-class `deliverable` (or `outputs[]`) that is NEVER folded into the
 * mutation surface, and the compiler's `intent.inputs` accepts it without
 * tripping the execution-field leak guard.
 *
 * Tested invariants:
 *   AC1 — a WorkRequestDocument with a non-empty `deliverable` validates.
 *   AC2 — a WorkRequestDocument WITHOUT deliverable still validates
 *         (back-compat: deliverable is optional).
 *   AC3 — an empty/blank `deliverable` is rejected.
 *   AC4 — malformed `outputs[]` (empty array / non-string entry) is rejected.
 *   AC5 — the runtime CompilerOutput accepts `intent.inputs.deliverable`
 *         through validateCompilerOutput (the contract-boundary guard).
 *
 * Pure and DB-free.
 *
 * Usage:
 *   cd /home/codex/dev/nexus/typescript/conduit-mcp
 *   npx vitest run src/work-request-isa.test.ts
 */
import { describe, test, expect } from "vitest";

import {
  Opcode,
  WorkRequestDocument,
  WorkRequestStep,
  validateWorkRequest,
} from "./work-request-isa";
import {
  CompilerOutput,
  validateCompilerOutput,
} from "./runtime-kernel";

function validStep(): WorkRequestStep {
  return {
    step: 1,
    op: Opcode.READ_FILE,
    target: "docs/t25/0.1.md",
    args: { target: "docs/t25/0.1.md" },
    idempotency_key: "cp1-step-1",
  };
}

function validDoc(extra: Partial<WorkRequestDocument> = {}): WorkRequestDocument {
  return {
    work_request_id: "wr-cp1",
    implementation_plan_id: "plan-0001",
    ordered_steps: [validStep()],
    preconditions: [],
    postconditions: [],
    ...extra,
  };
}

describe("CP-1 (D1) deliverable field", () => {
  test("AC1 — non-empty deliverable validates", () => {
    const result = validateWorkRequest(
      validDoc({ deliverable: "docs/t25/0.1-hardcoded-port-cred-inventory.md" }),
    );
    expect(result.valid).toBe(true);
  });

  test("AC2 — deliverable is optional (back-compat)", () => {
    const result = validateWorkRequest(validDoc());
    expect(result.valid).toBe(true);
  });

  test("AC3 — blank deliverable is rejected", () => {
    const result = validateWorkRequest(validDoc({ deliverable: "   " }));
    expect(result.valid).toBe(false);
    expect(result.findings.some((f) => f.field === "deliverable")).toBe(true);
  });

  test("AC4 — malformed outputs[] is rejected", () => {
    const empty = validateWorkRequest(validDoc({ outputs: [] }));
    expect(empty.valid).toBe(false);

    const badEntry = validateWorkRequest(validDoc({ outputs: ["ok", ""] }));
    expect(badEntry.valid).toBe(false);
  });

  test("AC5 — CompilerOutput intent.inputs.deliverable passes the leak guard", () => {
    const output: CompilerOutput = {
      wrId: "wr-cp1",
      intent: {
        type: "recon",
        inputs: { deliverable: "docs/t25/0.1-hardcoded-port-cred-inventory.md" },
        objective: "hardcoded port/cred inventory",
      },
      constraints: { deterministic: true },
      opTrace: { ipNodes: [], resolvedOps: [], registryVersion: "1" },
    };
    expect(() => validateCompilerOutput(output)).not.toThrow();
  });
});
