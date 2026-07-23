import { getLatestReceiptType } from "./db";

// Allowed transitions: from → to (v018: removed PROPOSED, added HOLD)
// v019: added CCNF_EXECUTION — sub-event within implementation phase
const ALLOWED: Record<string, string[]> = {
  // Anything can be created, or start from a requirement idea:
  "": ["PLAN_CREATE", "BLOCK"],
  // After creation, builder can implement, hold, or route to critique:
  PLAN_CREATE: ["IMPLEMENTATION", "BLOCK", "CRITIQUE", "HOLD"],
  // After implementation, reviewer can pass, reject, or hold:
  // CCNF_EXECUTION is a sub-event that records CCNF conformance runs
  IMPLEMENTATION: ["REVIEW_PASS", "REVIEW_REJECT", "REVIEW", "HOLD", "CCNF_EXECUTION"],
  // CCNF execution returns to implementation or chains another run:
  CCNF_EXECUTION: ["IMPLEMENTATION", "CCNF_EXECUTION", "HOLD"],
  // Rejection → builder re-implements, or manual REVIEW_PASS override, or hold:
  REVIEW_REJECT: ["IMPLEMENTATION", "REVIEW_PASS", "HOLD"],
  // Block → implement (unblocked), hold while blocked is allowed:
  BLOCK: ["IMPLEMENTATION", "HOLD"],
  // REVIEW_PASS is terminal — no further receipts for THIS plan.
  // But a revision creates a NEW plan with a PLANNING receipt.
  REVIEW_PASS: [],
  // Planning plans can be finalized (pending) or blocked:
  PLANNING: ["PLAN_CREATE", "PLAN_BLOCK", "HOLD"],
  // Hold can be released back to pending, or canceled:
  HOLD: ["PLAN_CREATE", "CANCELLED", "ABANDONED"],
  // Reviewer starts reviewing after implementation:
  REVIEW: ["REVIEW_PASS", "REVIEW_REJECT", "HOLD"],
  // Critic starts critique after plan creation:
  CRITIQUE: ["CRITIQUE_PASS", "CRITIQUE_REJECT", "HOLD"],
  // Critic outcomes:
  CRITIQUE_PASS: ["IMPLEMENTATION", "HOLD"], // critique passed → builder can implement or hold
  CRITIQUE_REJECT: ["PLAN_CREATE", "HOLD"], // critique failed → back to planning or hold
  // Planner block:
  PLAN_BLOCK: ["IMPLEMENTATION", "HOLD"], // unblock or hold
  // Requeued plans can be re-dispatched:
  REQUEUED: ["PLAN_CREATE", "IMPLEMENTATION"],
  // Cancelled / abandoned plans can be resurrected:
  CANCELLED: ["PLAN_CREATE"],
  ABANDONED: ["PLAN_CREATE"],
  // API_LIMIT is always valid (like BLOCK) — handled as special case in validateReceipt
  API_LIMIT: [],
};

export async function validateReceipt(
  planId: string,
  newType: string,
): Promise<{ valid: boolean; error?: string }> {
  if (newType === "BLOCK" || newType === "API_LIMIT" || newType === "CANCELLED" || newType === "ABANDONED") {
    // BLOCK and API_LIMIT are always allowed (override any state)
    return { valid: true };
  }

  const currentType = await getLatestReceiptType(planId) || "";
  const allowed = ALLOWED[currentType] || [];

  if (!allowed.includes(newType)) {
    return {
      valid: false,
      error: `Cannot issue ${newType} receipt: current state is ${currentType || "none"}. Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
    };
  }

  return { valid: true };
}
