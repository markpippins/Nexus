/**
 * Plan 0016 wiring fix — ticket-advance mapping tests.
 *
 * Verifies the pure receipt-type → (completing role, terminal status) mapping
 * that drives advanceTicketsOnReceipt. The DB-backed advance itself is
 * exercised end-to-end in the manual smoke; this locks the pure contract so
 * wiring regressions are caught without a database.
 */
import { describe, expect, it } from "vitest";
import { receiptToCompletingRole } from "./db";

describe("receiptToCompletingRole — which ticket a receipt completes", () => {
  it("IMPLEMENTATION completes the builder ticket", () => {
    expect(receiptToCompletingRole("IMPLEMENTATION")).toEqual({ role: "builder", status: "completed" });
  });

  it("CRITIQUE_PASS / CRITIQUE_REJECT complete the critic ticket", () => {
    expect(receiptToCompletingRole("CRITIQUE_PASS")).toEqual({ role: "critic", status: "completed" });
    expect(receiptToCompletingRole("CRITIQUE_REJECT")).toEqual({ role: "critic", status: "completed" });
  });

  it("REVIEW_PASS completes the reviewer; REVIEW_REJECT marks it failed", () => {
    expect(receiptToCompletingRole("REVIEW_PASS")).toEqual({ role: "reviewer", status: "completed" });
    expect(receiptToCompletingRole("REVIEW_REJECT")).toEqual({ role: "reviewer", status: "failed" });
  });

  it("PLAN_CREATE and non-completing receipts return null (no ticket advanced)", () => {
    expect(receiptToCompletingRole("PLAN_CREATE")).toBeNull(); // creates, not completes
    expect(receiptToCompletingRole("BLOCK")).toBeNull();
    expect(receiptToCompletingRole("HOLD")).toBeNull();
    expect(receiptToCompletingRole("CCNF_EXECUTION")).toBeNull();
  });
});