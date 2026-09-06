/**
 * Plan 0016 — WRP contract adjacency drift guard (AC4/AC5).
 *
 * Plan 0016 must NOT add a new canonical WRP state, must NOT add an
 * EXECUTING→CRITIQUE_ARTIFACT edge, and must leave the single-CRITIQUE /
 * no-REVIEW-state contract intact. This test freezes that invariant by:
 *   1. asserting the canonical schema has 11 states, a single CRITIQUE, and
 *      NO REVIEW / CRITIQUE_ARTIFACT state;
 *   2. asserting the code's isValidTransition agrees with the canonical
 *      adjacency matrix for EVERY (from,to) pair — no adjacency drift;
 *   3. asserting the recurring CRITIQUE receipts still map through the
 *      existing receiptToWrpState (CRITIQUE→CRITIQUE, CRITIQUE_REJECT→PLANNING).
 */
import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  isValidTransition,
  receiptToWrpState,
  WRPState,
} from "../../nebula-mcp/src/conduit-wrp-contract";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const CANONICAL_STATES: WRPState[] = [
  "CREATED", "INTAKE", "PLANNING", "CRITIQUE", "SPECIFICATION", "APPROVED",
  "QUEUED", "EXECUTING", "COMPLETED", "ARCHIVED", "FAILED",
];

describe("WRP contract adjacency — plan 0016 must not add states or artifact-critique adjacency", () => {
  it("canonical schema has 11 states, a single CRITIQUE, and NO REVIEW/CRITIQUE_ARTIFACT", () => {
    const canonicalPath = path.join(REPO_ROOT, "schemas", "protocol", "wrp-state-machine.json");
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));
    const header = canonical.adjacency_matrix.header;
    expect(header).toHaveLength(11);
    expect(header).toContain("CRITIQUE");
    expect(header).not.toContain("REVIEW");
    expect(header).not.toContain("CRITIQUE_ARTIFACT");
    expect(header).not.toContain("CRITIQUE_ADMISSION");
    // canonical matrix must be square (11x11)
    expect(Object.keys(canonical.adjacency_matrix.matrix)).toHaveLength(11);
  });

  it("code isValidTransition agrees with the canonical adjacency matrix for every pair (no drift)", () => {
    const canonicalPath = path.join(REPO_ROOT, "schemas", "protocol", "wrp-state-machine.json");
    const canonical = JSON.parse(fs.readFileSync(canonicalPath, "utf8"));
    const header: string[] = canonical.adjacency_matrix.header;
    const matrix: Record<string, number[]> = canonical.adjacency_matrix.matrix;

    for (const from of CANONICAL_STATES) {
      const row = matrix[from];
      expect(row, `canonical matrix missing row for ${from}`).toBeTruthy();
      for (const to of CANONICAL_STATES) {
        const colIdx = header.indexOf(to);
        const canonicalAllows = row[colIdx] === 1;
        const codeAllows = isValidTransition(from as WRPState, to as WRPState);
        expect(codeAllows, `${from}→${to}: code=${codeAllows} canonical=${canonicalAllows}`).toBe(canonicalAllows);
      }
    }
  });

  it("does NOT add an EXECUTING→CRITIQUE edge (artifact critique is a receipt, not a state)", () => {
    expect(isValidTransition("EXECUTING" as WRPState, "CRITIQUE" as WRPState)).toBe(false);
    // EXECUTING still only advances to COMPLETED / FAILED.
    expect(isValidTransition("EXECUTING" as WRPState, "COMPLETED" as WRPState)).toBe(true);
  });

  it("recurring CRITIQUE receipts still map through the existing WRP state mapping", () => {
    expect(receiptToWrpState("CRITIQUE" as any)).toBe("CRITIQUE");
    expect(receiptToWrpState("CRITIQUE_REJECT" as any)).toBe("PLANNING");
  });
});