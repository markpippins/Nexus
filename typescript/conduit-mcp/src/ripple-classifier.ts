/**
 * ripple-classifier.ts — CP-8 (R-A-2026-08-15-003): ripple-classified WR routing.
 *
 * The release gate's classification pass, which sits after compile→compare.
 * Given a human/Architect-assigned ripple level + node shape, it derives the
 * deterministic route that the WR state machine and bootstrap gate consume:
 *
 *   R0–R1 → conduit          (release to builder ticket; low-weight model)
 *   R2    → conduit-review   (release, Engineering review gate before merge)
 *   R3    → reserved         (held at VALIDATED; never auto-armed; decompose
 *                             + verify first, then Engineering executes)
 *   R4    → reserved         (decision-shaped; Architect rules; never conduit
 *                             without an explicit Architect ruling)
 *
 * Ripple depth is the blast radius of a change, scored by a human over the
 * seven canonical dimensions below. The classifier is initially
 * **human/Architect-assigned** (the T25 DAG is the first corpus) — mechanical
 * diff scoring is a LATER step and must be verified against human assignments
 * before it gates anything. This module therefore *derives* the route from a
 * supplied assignment; it does NOT auto-score dimensions into a ripple level.
 *
 * Ripple fields surface in the WR constraints layer as resourceHints
 * (`ripple:R3`, `shape:E`, `route:reserved`) — a future schema addition; today
 * the classification is recorded on the plan record (this module is the
 * pure, testable core of that contract).
 *
 * Pure and DB-free. Never mutates its inputs.
 */

/** Ripple depth = blast radius of a change (R0 leaf → R4 systemic). */
export type RippleLevel = "R0" | "R1" | "R2" | "R3" | "R4";

/** Node shape = who executes the node. */
export type NodeShape = "B" | "E" | "A";

/** Release route derived from ripple (conduit | conduit-review | reserved). */
export type Route = "conduit" | "conduit-review" | "reserved";

/**
 * The seven scored dimensions a human reasons over when assigning a ripple
 * level (R-A-003 §1). Present for documentation and for the future mechanical
 * scorer; not required for the route derivation.
 */
export const RIPPLE_DIMENSIONS = [
  "schema",        // touches canonical PG tables/schemas, migrations, cross-schema deps
  "contract",      // changes TypeSpec/OpenAPI surface or conformance gate output
  "clients",       // how many consumers depend on the changed surface
  "crossSystem",   // crosses subsystem boundaries (registry↔terrain, JVM↔Python, …)
  "security",      // credentials, auth, fail-closed semantics
  "authority",     // canonicality, role boundaries, governance (PEB/WRP)
  "liveState",     // mutates running services, seed/sync data, systemd, failover
] as const;

export type RippleDimension = (typeof RIPPLE_DIMENSIONS)[number];

/** Evidence of which dimensions drove a human/Architect assignment. */
export type DimensionEvidence = Partial<Record<RippleDimension, boolean>>;

/** A complete classification: human-assigned ripple + shape → derived route. */
export interface RippleClassification {
  ripple: RippleLevel;
  shape: NodeShape;
  /** Derived route — the release-gate input. */
  route: Route;
  /** Dimensions the human scored true when assigning the ripple level. */
  dimensions?: DimensionEvidence;
  /** One-line rationale (recorded on the plan record). */
  rationale?: string;
}

/** Input to {@link classify}: the human/Architect-assigned fields only. */
export interface RippleAssignment {
  ripple: RippleLevel;
  shape: NodeShape;
  dimensions?: DimensionEvidence;
  rationale?: string;
}

const VALID_RIPPLES: ReadonlySet<string> = new Set(["R0", "R1", "R2", "R3", "R4"]);
const VALID_SHAPES: ReadonlySet<string> = new Set(["B", "E", "A"]);

/**
 * Deterministic route for a ripple level (R-A-003 §1 routing rule).
 * R0/R1 → conduit; R2 → conduit-review; R3/R4 → reserved.
 */
export function routeFromRipple(ripple: RippleLevel): Route {
  switch (ripple) {
    case "R0":
    case "R1":
      return "conduit";
    case "R2":
      return "conduit-review";
    case "R3":
    case "R4":
      return "reserved";
  }
}

/**
 * Classify a node from a human/Architect-assigned ripple + shape.
 * Fail-closed: an unknown ripple/shape raises rather than silently routing.
 */
export function classify(assignment: RippleAssignment): RippleClassification {
  if (!VALID_RIPPLES.has(assignment.ripple)) {
    throw new Error(
      `invalid ripple level ${JSON.stringify(assignment.ripple)} (expected R0..R4)`,
    );
  }
  if (!VALID_SHAPES.has(assignment.shape)) {
    throw new Error(
      `invalid node shape ${JSON.stringify(assignment.shape)} (expected B|E|A)`,
    );
  }
  return {
    ripple: assignment.ripple,
    shape: assignment.shape,
    route: routeFromRipple(assignment.ripple),
    dimensions: assignment.dimensions,
    rationale: assignment.rationale,
  };
}

/** true when the route holds the WR at VALIDATED (R3/R4, or explicit hold). */
export function isReserved(route: Route): boolean {
  return route === "reserved";
}

/**
 * true when the bootstrap gate may auto-arm this node (emit a builder ticket).
 * R3/R4 (reserved) are never auto-armed — explicit Architect/human release only.
 */
export function shouldAutoArm(classification: RippleClassification): boolean {
  return !isReserved(classification.route);
}

/** true when release requires an explicit Architect/human action (R3/R4). */
export function requiresExplicitRelease(
  classification: RippleClassification,
): boolean {
  return isReserved(classification.route);
}

/**
 * Encode the classification as WR constraints-layer resourceHints strings
 * (`ripple:R3`, `shape:E`, `route:reserved`). This is the future schema
 * addition's serialization; today the same strings are recorded on the plan
 * record.
 */
export function toResourceHints(classification: RippleClassification): string[] {
  return [
    `ripple:${classification.ripple}`,
    `shape:${classification.shape}`,
    `route:${classification.route}`,
  ];
}
