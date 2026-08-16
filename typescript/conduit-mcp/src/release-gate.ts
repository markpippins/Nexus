/**
 * release-gate.ts — CP-9 (R-A-2026-08-15-005): the compile → compare →
 * classify → release gate, as a pure decision function.
 *
 * This is the linchpin of the WR-compile decoupling: it fuses the D2 compare
 * operator and the R-A-003 ripple classifier into a single deterministic
 * release decision. The pipeline order is:
 *
 *   plan → compile → WR IR → compare (vs goal/filesAffected/acceptanceCriteria)
 *        → classify (ripple/shape/route) → release gate → builder ticket
 *
 * A compiled WR is release-eligible IFF the compare passes (no material diffs)
 * AND the ripple route is NOT reserved (R3/R4 are held at VALIDATED, never
 * auto-armed — explicit Architect/human release only). The verdict is the
 * pre-row WR_COMPILE_PASS/FAIL outcome; the route comes from the classifier.
 *
 * Pure and DB-free — the verdict persistence lives in db.ts (runCompileGate).
 */

import { compareWrToPlan, CompareTarget } from "./compile-compare";
import { classify, RippleAssignment, RippleClassification } from "./ripple-classifier";

/** The compile verdict (pre-row, non-transitional — D5). */
export type CompileVerdict = "WR_COMPILE_PASS" | "WR_COMPILE_FAIL";

/** One evaluation of the release gate (deterministic). */
export interface ReleaseDecision {
  verdict: CompileVerdict;
  /** Material diffs from compare (empty on PASS). */
  diffs: string[];
  /** The ripple classification (route derived). */
  classification: RippleClassification;
  /** true when the bootstrap gate may auto-arm (emit a builder ticket). */
  release: boolean;
  /** Deterministic reason — recorded as the verdict description. */
  reason: string;
}

/**
 * Evaluate the release gate over a compiled WR + its plan spec + a
 * human/Architect-assigned ripple classification.
 *
 * Deterministic and pure: identical inputs → identical decision. A FAIL
 * verdict and a reserved route both hold the WR (release=false); a PASS on a
 * conduit/conduit-review route releases.
 */
export function evaluateReleaseGate(
  wr: CompareTarget,
  plan: CompareTarget,
  assignment: RippleAssignment,
): ReleaseDecision {
  const compare = compareWrToPlan(wr, plan);
  const classification = classify(assignment);

  const verdict: CompileVerdict = compare.pass ? "WR_COMPILE_PASS" : "WR_COMPILE_FAIL";
  const reserved = classification.route === "reserved";
  const release = compare.pass && !reserved;

  let reason: string;
  if (!compare.pass) {
    reason = `compile FAIL: ${compare.diffs.join("; ")}`;
  } else if (reserved) {
    reason =
      `reserved (${classification.ripple}/${classification.shape}): ` +
      `held at VALIDATED — explicit Architect/human release only`;
  } else {
    reason =
      `release-eligible (${classification.ripple}/${classification.shape}, ` +
      `${classification.route})`;
  }

  return { verdict, diffs: compare.diffs, classification, release, reason };
}
