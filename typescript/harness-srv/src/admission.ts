/**
 * admission.ts — execution admission decisions (side-effect-free).
 *
 * T20 two-tier governance (binding ruling D-2026-08-14-001 APPROVED):
 *
 *   1. ADMISSION (uniform, every launch path) — is this role allowed to run
 *      at all? Governed by config_bundle validity: is_active (revoked),
 *      valid_from/valid_to (invalidated). This module decides that.
 *
 *   2. LEASE QUOTA (worker pool only) — how much discretionary pool
 *      fulfillment may a role pull? Governed by tackle.role_leases
 *      (window_end + budget). This is enforced on the worker-pool path
 *      (conduit/execution_worker.py), NOT here — scheduled/system-triggered
 *      runs (timed analyst→planner Q&A, scheduler-dispatched wind.tasks) are
 *      orchestration, not pool consumption, and must not be blocked by an
 *      unrelated lease expiry.
 *
 * In-flight behavior: denial only gates NEW admissions — already-running
 * sessions are not killed, so durable history (receipts/records) is
 * preserved.
 *
 * This module intentionally has NO db/redis imports — pure functions only,
 * so unit tests can load it without constructing connection clients (mirrors
 * governance.ts / model.ts).
 */

/** Outcome vocabulary for admission-denied results. */
export const ADMISSION_OUTCOME = {
  /** Generic umbrella outcome emitted on the cascade event + response. */
  ADMISSION_DENIED: "ADMISSION_DENIED",
  /** Role's config bundles exist but all are is_active=0 (revoked). */
  ROLE_REVOKED: "ROLE_REVOKED",
  /** Role's config bundles are active but outside valid_from/valid_to. */
  CONFIG_INVALIDATED: "CONFIG_INVALIDATED",
  /** Role has no config bundle rows at all. */
  NO_CONFIG: "NO_CONFIG",
  /**
   * Model credential not yet verifiable (G1, binding ruling D-2026-08-14-001).
   *
   * ADVISORY-ONLY: this outcome MUST NOT block a launch. Until real credential
   * verification exists, an unverifiable model check is a warning at most —
   * never a hard denial. It is documented here to keep the T20 vocabulary
   * complete, but `decideConfigAdmission` intentionally never returns it.
   */
  MODEL_UNVERIFIED: "MODEL_UNVERIFIED",
  // Lease outcomes are emitted by the worker-pool path (execution_worker.py),
  // not by harness-srv. Kept here to document the full T20 vocabulary.
  LEASE_EXPIRED: "LEASE_EXPIRED",
  LEASE_EXHAUSTED: "LEASE_EXHAUSTED",
} as const;

/** Denial reason values actually produced by the harness-srv admission gate. */
export type ConfigDenialReason = "ROLE_REVOKED" | "CONFIG_INVALIDATED" | "NO_CONFIG";

/** Minimal structural snapshot of a role's config bundles (DB-agnostic). */
export interface ConfigBundleSnapshot {
  is_active: number;
  /** valid_from is set and still in the future. */
  not_yet_valid: boolean;
  /** valid_to is set and has passed. */
  expired: boolean;
}

export type ConfigAdmission =
  | { valid: true }
  | { valid: false; outcome: ConfigDenialReason; message: string };

/**
 * Decide whether a role is admissible given its config_bundle rows.
 * Empty input (no bundles) is a distinct "not configured" outcome.
 */
export function decideConfigAdmission(bundles: ConfigBundleSnapshot[]): ConfigAdmission {
  if (bundles.length === 0) {
    return { valid: false, outcome: "NO_CONFIG", message: "role has no config bundle configured" };
  }

  const anyActive = bundles.some((b) => b.is_active === 1);
  if (!anyActive) {
    return {
      valid: false,
      outcome: "ROLE_REVOKED",
      message: "role config bundle deactivated (is_active=0); re-activate before new work",
    };
  }

  const anyValid = bundles.some((b) => b.is_active === 1 && !b.not_yet_valid && !b.expired);
  if (!anyValid) {
    return {
      valid: false,
      outcome: "CONFIG_INVALIDATED",
      message: "role config bundle outside valid_from/valid_to window; correct the config before new work",
    };
  }

  return { valid: true };
}
