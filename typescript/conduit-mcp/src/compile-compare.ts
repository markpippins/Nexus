/**
 * compile-compare.ts — CP-2 (D2): deterministic pre-row compare operator.
 *
 * The release gate compares a compiled WorkRequest against its plan spec
 * BEFORE any plan row exists (pre-row). This module is the pure, side-effect-
 * free diff at the heart of that gate: it is a pure function of (WR, plan)
 * and returns a deterministic verdict + the material diffs.
 *
 * D2 contract: "Compare operates on the compile spec, pre-row — the WR
 * document vs plan goal / filesAffected / acceptanceCriteria (deterministic
 * diff; entity_key/CCNF content identity, Plan 1287 basis)."
 *
 * v1 compares the four canonical fields. The entity_key content-identity
 * refinement (D3) replaces the per-field diff with a single content-identity
 * comparison once the entityKey canonical input set is locked — this module
 * keeps the field-level diffs for explainability regardless.
 *
 * Pure and DB-free. Never mutates its inputs.
 */

/** The common comparison surface shared by a compiled WR and a plan spec. */
export interface CompareTarget {
  goal?: string;
  filesAffected?: string[];
  acceptanceCriteria?: string[];
  /** D1: first-class deliverable for recon nodes (optional). */
  deliverable?: string;
}

export interface CompareResult {
  /** true when there are no material diffs (release-eligible). */
  pass: boolean;
  /** Human-readable, deterministic diff descriptions (empty when pass). */
  diffs: string[];
}

function normalizeGoal(s: string | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sorted(arr: string[] | undefined): string[] {
  return (arr ?? []).slice().sort();
}

/**
 * Compare a compiled WR against its plan spec (pre-row).
 *
 * Rules (deterministic, documented):
 *   - goal: compared normalized (case/whitespace-insensitive). A diff when the
 *     plan declares a goal and the WR's differs materially.
 *   - filesAffected: sorted set equality — the WR's mutation surface must
 *     equal the plan's declared surface (empty for recon nodes).
 *   - acceptanceCriteria: every plan criterion must be present in the WR's
 *     criteria (subset). Extra WR criteria are allowed (the compiler may
 *     synthesize additional ones).
 *   - deliverable: when the plan declares one, the WR must carry the same
 *     deliverable (D1). Missing/mismatched → diff.
 */
export function compareWrToPlan(
  wr: CompareTarget,
  plan: CompareTarget,
): CompareResult {
  const diffs: string[] = [];

  const planGoal = normalizeGoal(plan.goal);
  const wrGoal = normalizeGoal(wr.goal);
  if (planGoal && wrGoal && planGoal !== wrGoal) {
    diffs.push(`goal mismatch: plan "${planGoal}" vs WR "${wrGoal}"`);
  }

  const planFiles = sorted(plan.filesAffected);
  const wrFiles = sorted(wr.filesAffected);
  if (JSON.stringify(planFiles) !== JSON.stringify(wrFiles)) {
    diffs.push(
      `filesAffected mismatch: plan [${planFiles.join(", ")}] vs WR [${wrFiles.join(", ")}]`,
    );
  }

  const wrCriteria = new Set(sorted(wr.acceptanceCriteria));
  for (const criterion of sorted(plan.acceptanceCriteria)) {
    if (!wrCriteria.has(criterion)) {
      diffs.push(`acceptanceCriteria missing from WR: "${criterion}"`);
    }
  }

  if (plan.deliverable !== undefined && plan.deliverable.trim() !== "") {
    if (wr.deliverable !== plan.deliverable) {
      diffs.push(
        `deliverable mismatch: plan "${plan.deliverable}" vs WR "${wr.deliverable ?? "(none)"}"`,
      );
    }
  }

  return { pass: diffs.length === 0, diffs };
}
