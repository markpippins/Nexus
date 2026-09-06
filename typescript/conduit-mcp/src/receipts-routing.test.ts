/**
 * Plan 0016 — Artifact-Critique Edge routing tests.
 *
 * Verifies the position-aware critique routing resolved from the LAST
 * non-CRITIQUE receipt in plan history:
 *   admission (after PLAN_CREATE):  CRITIQUE_PASS → IMPLEMENTATION,
 *                                   CRITIQUE_REJECT → PLAN_CREATE
 *   artifact  (after IMPLEMENTATION): CRITIQUE_PASS → REVIEW,
 *                                   CRITIQUE_REJECT → IMPLEMENTATION
 *
 * AC2 regression guard: routing MUST NEVER read ticket.objective. These tests
 * exercise resolveCritiquePosition / resolveCritiqueOutcome with receipt chains
 * that differ only in receipt TYPE position — never in ticket.objective — and
 * assert the position is derived solely from the non-CRITIQUE receipt.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveCritiquePosition,
  resolveCritiqueOutcome,
  validateReceipt,
} from "./receipts";
import * as conduitClient from "./conduit-client";

// Mock the HTTP-backed conduit-client so these are pure unit tests.
vi.mock("./conduit-client", () => ({
  getReceiptsRaw: vi.fn(),
  getLatestReceiptType: vi.fn(),
}));

const mockedGetReceiptsRaw = vi.mocked(conduitClient.getReceiptsRaw);
const mockedGetLatestReceiptType = vi.mocked(conduitClient.getLatestReceiptType);

/** Build a receipt chain with a chosen set of (type) entries, newest-first. */
function chain(types: string[]): any[] {
  // types are given chronological (oldest→newest); raw endpoint returns newest-first.
  return [...types].reverse().map((type, i) => ({
    id: `r-${i}-${type}`,
    plan_id: "0016",
    type,
    agent_role: "builder",
    created_at: new Date(Date.UTC(2026, 8, 5, 0, 0, i)).toISOString(),
  }));
}

beforeEach(() => {
  mockedGetReceiptsRaw.mockReset();
  mockedGetLatestReceiptType.mockReset();
});

describe("resolveCritiquePosition — admission vs artifact (last non-CRITIQUE receipt)", () => {
  it("resolves ADMISSION when the last non-CRITIQUE receipt is PLAN_CREATE", async () => {
    // PLAN_CREATE → CRITIQUE (admission edge)
    mockedGetReceiptsRaw.mockResolvedValue({ plan_id: "0016", count: 2, receipts: chain(["PLAN_CREATE", "CRITIQUE"]) });
    const r = await resolveCritiquePosition("0016");
    expect(r.position).toBe("admission");
    expect(r.basis).toBe("PLAN_CREATE");
  });

  it("resolves ARTIFACT when the last non-CRITIQUE receipt is IMPLEMENTATION", async () => {
    // PLAN_CREATE → CRITIQUE → CRITIQUE_PASS → IMPLEMENTATION → CRITIQUE (artifact edge)
    mockedGetReceiptsRaw.mockResolvedValue({
      plan_id: "0016", count: 5,
      receipts: chain(["PLAN_CREATE", "CRITIQUE", "CRITIQUE_PASS", "IMPLEMENTATION", "CRITIQUE"]),
    });
    const r = await resolveCritiquePosition("0016");
    expect(r.position).toBe("artifact");
    expect(r.basis).toBe("IMPLEMENTATION");
  });

  it("returns unknown when there is no non-CRITIQUE receipt in history", async () => {
    mockedGetReceiptsRaw.mockResolvedValue({ plan_id: "0016", count: 1, receipts: chain(["CRITIQUE"]) });
    const r = await resolveCritiquePosition("0016");
    expect(r.position).toBe("unknown");
    expect(r.basis).toBeNull();
  });

  it("skips the entire critique family when scanning for the basis receipt", async () => {
    // After an artifact critique, more critique-family receipts (CRITIQUE_REJECT,
    // CRITIQUE_PASS) must not shift the position; IMPLEMENTATION stays the basis.
    mockedGetReceiptsRaw.mockResolvedValue({
      plan_id: "0016", count: 4,
      receipts: chain(["PLAN_CREATE", "CRITIQUE", "CRITIQUE_PASS", "IMPLEMENTATION", "CRITIQUE", "CRITIQUE_PASS", "CRITIQUE"]),
    });
    const r = await resolveCritiquePosition("0016");
    expect(r.position).toBe("artifact");
    expect(r.basis).toBe("IMPLEMENTATION");
  });
});

describe("resolveCritiqueOutcome — the four routing branches", () => {
  it("admission CRITIQUE_PASS → IMPLEMENTATION", async () => {
    mockedGetReceiptsRaw.mockResolvedValue({ plan_id: "0016", count: 2, receipts: chain(["PLAN_CREATE", "CRITIQUE"]) });
    const r = await resolveCritiqueOutcome("0016", "CRITIQUE_PASS");
    expect(r.position).toBe("admission");
    expect(r.target).toBe("IMPLEMENTATION");
  });

  it("admission CRITIQUE_REJECT → PLAN_CREATE", async () => {
    mockedGetReceiptsRaw.mockResolvedValue({ plan_id: "0016", count: 2, receipts: chain(["PLAN_CREATE", "CRITIQUE"]) });
    const r = await resolveCritiqueOutcome("0016", "CRITIQUE_REJECT");
    expect(r.position).toBe("admission");
    expect(r.target).toBe("PLAN_CREATE");
  });

  it("artifact CRITIQUE_PASS → REVIEW", async () => {
    mockedGetReceiptsRaw.mockResolvedValue({
      plan_id: "0016", count: 5,
      receipts: chain(["PLAN_CREATE", "CRITIQUE", "CRITIQUE_PASS", "IMPLEMENTATION", "CRITIQUE"]),
    });
    const r = await resolveCritiqueOutcome("0016", "CRITIQUE_PASS");
    expect(r.position).toBe("artifact");
    expect(r.target).toBe("REVIEW");
  });

  it("artifact CRITIQUE_REJECT → IMPLEMENTATION (returns to builder, not planner)", async () => {
    mockedGetReceiptsRaw.mockResolvedValue({
      plan_id: "0016", count: 5,
      receipts: chain(["PLAN_CREATE", "CRITIQUE", "CRITIQUE_PASS", "IMPLEMENTATION", "CRITIQUE"]),
    });
    const r = await resolveCritiqueOutcome("0016", "CRITIQUE_REJECT");
    expect(r.position).toBe("artifact");
    expect(r.target).toBe("IMPLEMENTATION");
    expect(r.target).not.toBe("PLAN_CREATE"); // artifact reject returns to the BUILDER
  });

  it("unknown position → null target", async () => {
    mockedGetReceiptsRaw.mockResolvedValue({ plan_id: "0016", count: 1, receipts: chain(["CRITIQUE"]) });
    const r = await resolveCritiqueOutcome("0016", "CRITIQUE_PASS");
    expect(r.position).toBe("unknown");
    expect(r.target).toBeNull();
  });
});

describe("AC2 regression guard — ticket.objective NEVER authoritative", () => {
  it("routing is identical regardless of any ticket.objective-like strings in receipts", async () => {
    // Two artifact chains whose receipt OBJECTIVES differ (descriptive-only) but
    // whose non-CRITIQUE receipt positions are identical → identical routing.
    const withAdmissionLabel = chain(["PLAN_CREATE", "CRITIQUE", "CRITIQUE_PASS", "IMPLEMENTATION", "CRITIQUE"]).map((r, i) => ({
      ...r, objective: i === 1 ? "critique:admission" : "",
    }));
    const withArtifactLabel = chain(["PLAN_CREATE", "CRITIQUE", "CRITIQUE_PASS", "IMPLEMENTATION", "CRITIQUE"]).map((r, i) => ({
      ...r, objective: i === 4 ? "critique:artifact" : "",
    }));

    mockedGetReceiptsRaw.mockResolvedValueOnce({ plan_id: "0016", count: 5, receipts: withAdmissionLabel });
    const a = await resolveCritiquePosition("0016");
    mockedGetReceiptsRaw.mockResolvedValueOnce({ plan_id: "0016", count: 5, receipts: withArtifactLabel });
    const b = await resolveCritiquePosition("0016");

    expect(a).toEqual(b);
    expect(a.position).toBe("artifact");
  });

  it("validateReceipt allows CRITIQUE after IMPLEMENTATION (artifact edge)", async () => {
    mockedGetLatestReceiptType.mockResolvedValue("IMPLEMENTATION");
    const v = await validateReceipt("0016", "CRITIQUE");
    expect(v.valid).toBe(true);
  });

  it("validateReceipt still allows CRITIQUE after PLAN_CREATE (admission edge)", async () => {
    mockedGetLatestReceiptType.mockResolvedValue("PLAN_CREATE");
    const v = await validateReceipt("0016", "CRITIQUE");
    expect(v.valid).toBe(true);
  });

  it("validateReceipt rejects CRITIQUE after REVIEW (no critique after reviewer)", async () => {
    mockedGetLatestReceiptType.mockResolvedValue("REVIEW");
    const v = await validateReceipt("0016", "CRITIQUE");
    expect(v.valid).toBe(false);
  });

  it("validateReceipt allows CRITIQUE_REJECT after IMPLEMENTATION (artifact return)", async () => {
    mockedGetLatestReceiptType.mockResolvedValue("CRITIQUE");
    const v = await validateReceipt("0016", "CRITIQUE_REJECT");
    expect(v.valid).toBe(true);
  });
});