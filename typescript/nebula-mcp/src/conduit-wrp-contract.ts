/**
 * Conduit → WRP Projection Contract v0.1
 *
 * Deterministic, replay-safe projection specification.
 *
 * Core invariant: Receipts are authoritative; projections are derived.
 * A projection may be deleted and reconstructed at any time without loss.
 *
 * Spec reference: audit/SPECS/CONDUIT_WRP_BRIDGE.md
 * Plan reference: #0174
 *
 * Design principles:
 * - All interfaces are immutable (readonly)
 * - All functions are pure (no side effects)
 * - Canonical ordering is applied before any state reduction
 * - Stratification is derived after state resolution
 */

/* ===================================================================
 * 1. CORE TYPES — Receipts
 * =================================================================== */

/**
 * Conduit receipt type — the event grammar of the pipeline.
 * These 16 values encode all lifecycle events that flow through conduit-mcp.
 *
 * Source: conduit-mcp/src/receipts.ts — ALLOWED transitions map
 * (includes REQUEUED, CANCELLED, ABANDONED, API_LIMIT from the transition map)
 */
export type ConduitReceiptType =
  | "HOLD"            // Execution paused (not blocked — intentional pause)
  | "PLANNING"        // Planner is elucidating scope
  | "PLAN_CREATE"     // Plan fully defined, ready for execution
  | "CRITIQUE"        // Critic reviewing the plan
  | "CRITIQUE_PASS"   // Critique approved → can implement
  | "CRITIQUE_REJECT" // Critique failed → back to planning
  | "IMPLEMENTATION"  // Builder is executing the plan
  | "CCNF_EXECUTION"  // CCNF conformance sub-event during implementation
  | "REVIEW"          // Reviewer is reviewing implementation
  | "REVIEW_PASS"     // Implementation approved (terminal success)
  | "REVIEW_REJECT"   // Implementation rejected → must re-implement
  | "BLOCK"           // Any role blocks progress (exception)
  | "PLAN_BLOCK"      // Planner blocks the plan (exception)
  | "API_LIMIT"       // Rate limit hit (watchdog exception)
  | "REQUEUED"        // Circuit breaker reset → plan re-dispatched
  | "CANCELLED"       // Plan cancelled (terminal)
  | "ABANDONED";      // Plan abandoned (terminal)

/**
 * Monotonic per-plan stream ordering key.
 * MUST be used for deterministic replay.
 *
 * Sort order: (sequence ASC, created_at ASC, receipt_id ASC)
 *
 * The sequence field provides an explicit insertion-order guard that prevents
 * clock skew, retry semantics, or concurrent writes from producing ambiguous
 * state reconstructions.
 *
 * Invariant: sequence is monotonically increasing per plan_id, no gaps.
 * Invariant: receipt_id is globally unique (UUID v4).
 */
export interface ReceiptOrderKey {
  /** Plan number this receipt belongs to (e.g., "0053") */
  planId: string;
  /** Monotonically increasing 0-based sequence number per plan */
  sequence: number;
  /** ISO 8601 timestamp of receipt creation */
  createdAt: string;
  /** UUID v4 — tiebreaker for same-timestamp receipts */
  receiptId: string;
}

/**
 * Canonical Conduit receipt row.
 * Represents one row from vision.receipts.
 */
export interface ConduitReceipt extends ReceiptOrderKey {
  /** Receipt type — the lifecycle event */
  type: ConduitReceiptType;
  /** Agent role that issued the receipt */
  agentRole: string;
  /** Optional session ID (e.g., "builder-20260605-120000") */
  sessionId?: string;
  /** Optional ticket ID this receipt is associated with */
  ticketId?: string;
  /** Optional path to proof artifact */
  artifactPath?: string;
  /** One-line summary of the receipt */
  summary: string;
  /** Arbitrary JSON metadata */
  metadata: Record<string, unknown>;
  /** Token usage tracking */
  tokensUsed?: number;
}

/* ===================================================================
 * 2. CORE TYPES — WRP Protocol States
 * =================================================================== */

/**
 * 11 WRP states defined in schemas/wrp/wrp-state-machine.json
 */
export type WRPState =
  | "CREATED"       // Initial — work request created but not ingested
  | "INTAKE"        // Active — being validated, parsed, assigned
  | "PLANNING"      // Active — decomposition strategy being defined
  | "CRITIQUE"      // Active — plan being reviewed for feasibility
  | "SPECIFICATION" // Active — detailed specification being produced
  | "APPROVED"      // Gate — formally approved for execution
  | "QUEUED"        // Active — waiting for executor
  | "EXECUTING"     // Active — actively being executed
  | "COMPLETED"     // Terminal — successfully completed
  | "ARCHIVED"      // Terminal — archived, read-only
  | "FAILED";       // Terminal — failed (may retry via new version)

/**
 * State categories from the WRP state machine.
 */
export type WRPStateCategory =
  | "initial"
  | "active"
  | "gate"
  | "terminal";

/**
 * Get the category of a WRP state.
 * Pure function — no external dependencies.
 */
export function wrpStateCategory(state: WRPState): WRPStateCategory {
  switch (state) {
    case "CREATED": return "initial";
    case "INTAKE":
    case "PLANNING":
    case "CRITIQUE":
    case "SPECIFICATION":
    case "QUEUED":
    case "EXECUTING": return "active";
    case "APPROVED": return "gate";
    case "COMPLETED":
    case "ARCHIVED":
    case "FAILED": return "terminal";
  }
}

/* ===================================================================
 * 3. STATE TRANSITION MAP — Receipt → WRP
 * =================================================================== */

/**
 * Pure mapping: ConduitReceiptType → WRPState.
 *
 * This is the semantic interpretation function — it translates pipeline
 * event grammar into protocol intent states.
 *
 * Specification: Conduit → WRP Bridge v0.1 §4.3
 */
export function receiptToWrpState(type: ConduitReceiptType): WRPState {
  switch (type) {
    case "HOLD":            return "QUEUED";  // Hold maps to QUEUED in WRP — paused, not failed
    case "PLANNING":        return "INTAKE";
    case "PLAN_CREATE":     return "PLANNING";
    case "CRITIQUE":        return "CRITIQUE";
    case "CRITIQUE_PASS":   return "SPECIFICATION";
    case "CRITIQUE_REJECT": return "PLANNING";
    case "IMPLEMENTATION":  return "EXECUTING";
    case "CCNF_EXECUTION":  return "EXECUTING";  // CCNF conformance is a sub-event within execution
    case "REVIEW":          return "APPROVED";
    case "REVIEW_PASS":     return "COMPLETED";
    case "REVIEW_REJECT":   return "EXECUTING";
    case "BLOCK":           return "FAILED";
    case "PLAN_BLOCK":      return "FAILED";
    case "API_LIMIT":       return "FAILED";
    case "REQUEUED":        return "QUEUED";
    case "CANCELLED":       return "ARCHIVED";
    case "ABANDONED":       return "FAILED";
  }
}

/**
 * WRP adjacency matrix: valid transitions between WRP states.
 * Derived from schemas/wrp/wrp-state-machine.json adjacency_matrix.matrix.
 *
 * Valid transitions return true. All other state pairs return false.
 * Terminal states (COMPLETED, ARCHIVED, FAILED) have no outgoing transitions.
 */
const WRP_ADJACENCY_MATRIX: Record<WRPState, Record<WRPState, boolean>> = {
  CREATED:       { CREATED: false, INTAKE: true,  PLANNING: false, CRITIQUE: false, SPECIFICATION: false, APPROVED: false, QUEUED: false, EXECUTING: false, COMPLETED: false, ARCHIVED: false, FAILED: false },
  INTAKE:        { CREATED: false, INTAKE: false, PLANNING: true,  CRITIQUE: false, SPECIFICATION: false, APPROVED: false, QUEUED: false, EXECUTING: false, COMPLETED: false, ARCHIVED: false, FAILED: true  },
  PLANNING:      { CREATED: false, INTAKE: false, PLANNING: false, CRITIQUE: true,  SPECIFICATION: false, APPROVED: false, QUEUED: false, EXECUTING: false, COMPLETED: false, ARCHIVED: false, FAILED: true  },
  CRITIQUE:      { CREATED: false, INTAKE: false, PLANNING: true,  CRITIQUE: false, SPECIFICATION: true,  APPROVED: false, QUEUED: false, EXECUTING: false, COMPLETED: false, ARCHIVED: false, FAILED: true  },
  SPECIFICATION: { CREATED: false, INTAKE: false, PLANNING: false, CRITIQUE: true,  SPECIFICATION: false, APPROVED: true,  QUEUED: false, EXECUTING: false, COMPLETED: false, ARCHIVED: false, FAILED: true  },
  APPROVED:      { CREATED: false, INTAKE: false, PLANNING: false, CRITIQUE: false, SPECIFICATION: true,  APPROVED: false, QUEUED: true,  EXECUTING: false, COMPLETED: false, ARCHIVED: false, FAILED: true  },
  QUEUED:        { CREATED: false, INTAKE: false, PLANNING: false, CRITIQUE: false, SPECIFICATION: false, APPROVED: false, QUEUED: false, EXECUTING: true,  COMPLETED: false, ARCHIVED: false, FAILED: true  },
  EXECUTING:     { CREATED: false, INTAKE: false, PLANNING: false, CRITIQUE: false, SPECIFICATION: false, APPROVED: false, QUEUED: false, EXECUTING: false, COMPLETED: true,  ARCHIVED: false, FAILED: true  },
  COMPLETED:     { CREATED: false, INTAKE: false, PLANNING: false, CRITIQUE: false, SPECIFICATION: false, APPROVED: false, QUEUED: false, EXECUTING: false, COMPLETED: false, ARCHIVED: true,  FAILED: false },
  ARCHIVED:      { CREATED: false, INTAKE: false, PLANNING: false, CRITIQUE: false, SPECIFICATION: false, APPROVED: false, QUEUED: false, EXECUTING: false, COMPLETED: false, ARCHIVED: false, FAILED: false },
  FAILED:        { CREATED: false, INTAKE: false, PLANNING: false, CRITIQUE: false, SPECIFICATION: false, APPROVED: false, QUEUED: false, EXECUTING: false, COMPLETED: false, ARCHIVED: false, FAILED: false },
};

/**
 * Pure function: check if a transition between WRP states is valid.
 *
 * Returns true iff the WRP adjacency matrix allows from → to.
 * Convergence behavior: invalid transitions are silently skipped
 * (the state machine converges to the latest valid state rather than
 * erroring on out-of-order or unexpected receipts).
 */
export function isValidTransition(from: WRPState, to: WRPState): boolean {
  return WRP_ADJACENCY_MATRIX[from]?.[to] === true;
}

/* ===================================================================
 * 4. PROJECTION OUTPUT TYPES
 * =================================================================== */

/**
 * Abstraction levels from the stratification ontology.
 * Spec: audit/SPECS/STRATIFICATION.md
 */
export type AbstractionLevel = "L1" | "L2" | "L3" | "L4";

/**
 * Visibility scopes for role-based access.
 */
export type VisibilityScope = "builder" | "architect" | "planner" | "reviewer" | "all";

/**
 * Chunk kinds from schemas/core/stratification-ontology.json
 */
export type ChunkKind =
  | "OVERVIEW" | "DEFINITION" | "DATA_MODEL" | "ALGORITHM"
  | "PROTOCOL" | "CONFIGURATION" | "CONSTRAINTS" | "RATIONALE"
  | "EXAMPLE" | "USAGE" | "ERROR" | "META";

/**
 * A single projected document chunk with stratification metadata.
 */
export interface StratifiedChunk {
  /** Content of the chunk */
  content: string;
  /** Abstraction level assigned by Layer 2 */
  level: AbstractionLevel;
  /** Content type classification */
  chunkKind: ChunkKind;
  /** Role visibility filter */
  visibilityScope: VisibilityScope;
  /** How binding the content is (from ontology) */
  normativeStrength?: "normative" | "informative" | "example" | "historical";
}

/**
 * Cross-reference between projected plans.
 * Derived from dependencies, shared files, and state transitions.
 */
export interface CrossReference {
  /** Relationship type (e.g., "wrp:depends_on", "wrp:implements") */
  relType: string;
  /** Source entity ID (plan number or system name) */
  sourceId: string;
  /** Target entity ID (plan number or system name) */
  targetId: string;
  /** Optional metadata about the relationship */
  metadata?: Record<string, unknown>;
}

/**
 * A single WRP event in the state derivation trace.
 */
export interface WRPEvent {
  /** Receipt ID that triggered this event */
  receiptId: string;
  /** Receipt type that caused the transition */
  receiptType: ConduitReceiptType;
  /** WRP state before the transition */
  fromState: WRPState;
  /** WRP state after the transition */
  toState: WRPState;
  /** Whether the transition was valid per the adjacency matrix */
  valid: boolean;
  /** Timestamp from the receipt */
  timestamp: string;
}

/**
 * Final resolved projection: the complete output of the reducer.
 *
 * Full state history derived from receipt replay.
 * All fields are deterministic given the input receipt stream.
 */
export interface WRPProjection {
  /* ── Identity ── */
  /** Plan number (e.g., "0053") */
  planId: string;
  /** Plan title */
  title: string;
  /** Project name */
  project: string;

  /* ── Core state ── */
  /** Final resolved WRP state after deterministic reduction */
  wrpState: WRPState;
  /** Full state derivation trace — ordered list of applied events */
  stateHistory: WRPEvent[];
  /** IDs of receipts that contributed to the final state */
  appliedReceiptIds: string[];

  /* ── Derivation metadata ── */
  /** Total receipts consumed */
  totalReceipts: number;
  /** Receipts skipped due to invalid transitions */
  skippedReceipts: number;
  /** Whether the projection is based on a partial receipt stream */
  partial: boolean;
  /** Whether the earliest receipt was not sequence 0 */
  incompleteStart: boolean;
  /** Errors encountered during reduction */
  errors: Array<{ receiptId: string; message: string }>;

  /* ── Stratification (Layer 2) ── */
  /** Overall abstraction level */
  abstractionLevel: AbstractionLevel;
  /** Stratified document chunks */
  chunks: StratifiedChunk[];
  /** Default visibility scope for this plan */
  visibilityScope: VisibilityScope;

  /* ── Cross-references (Layer 3) ── */
  /** Derived cross-plan relationships */
  crossReferences: CrossReference[];

  /* ── Plan metadata (from conduit.plans) ── */
  goal: string;
  filesAffected: string[];
  acceptanceCriteria: string[];
  dependencies: string[];
  promptRef?: string;
}

/* ===================================================================
 * 5. STRATIFICATION HEURISTICS (Layer 2)
 * =================================================================== */

/**
 * Deterministic stratification heuristic.
 *
 * level = f(state, metadata)
 *
 * Spec: Conduit → WRP Bridge v0.1 §6.2
 */
export function determineAbstractionLevel(
  state: WRPState,
  hasCrossSystemImpact: boolean,
  hasArchitecturalContent: boolean,
  hasStructuralContent: boolean,
): AbstractionLevel {
  // L4: cross-system governance boundary or termination events
  if (hasCrossSystemImpact || state === "ARCHIVED" || state === "FAILED") {
    return "L4";
  }
  // L3: validated execution decisions or architectural confirmation
  if (hasArchitecturalContent || state === "APPROVED" || state === "COMPLETED") {
    return "L3";
  }
  // L2: active structural execution phase
  if (hasStructuralContent || state === "SPECIFICATION" || state === "EXECUTING") {
    return "L2";
  }
  // L1: early lifecycle or intent formation phase
  return "L1";
}

/**
 * Map abstraction level to default visibility scope.
 */
export function levelToVisibilityScope(level: AbstractionLevel): VisibilityScope {
  switch (level) {
    case "L1": return "builder";
    case "L2": return "all";
    case "L3": return "architect";
    case "L4": return "architect";
  }
}

/* ===================================================================
 * 6. DETERMINISTIC ORDERING CONTRACT
 * =================================================================== */

/**
 * Canonical receipt comparator.
 *
 * Sort order: (sequence ASC, created_at ASC, receipt_id ASC)
 *
 * This is the SINGLE critical variable for projection stability.
 * Every reducer MUST sort by this key before state reduction.
 *
 * Spec: Conduit → WRP Bridge v0.1 §3.1
 */
export function compareReceipts(a: ReceiptOrderKey, b: ReceiptOrderKey): number {
  // 1. Sequence (monotonic per-plan stream order)
  if (a.sequence !== b.sequence) {
    return a.sequence - b.sequence;
  }
  // 2. Created_at (ISO 8601 string comparison is lexicographically valid)
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  // 3. Receipt ID (UUID tiebreaker)
  if (a.receiptId < b.receiptId) return -1;
  if (a.receiptId > b.receiptId) return 1;
  return 0;
}

/**
 * Sort receipts using canonical ordering.
 * Pure function — does not mutate input.
 */
export function sortReceipts(receipts: ConduitReceipt[]): ConduitReceipt[] {
  return [...receipts].sort(compareReceipts);
}

/* ===================================================================
 * 7. CORE PROJECTION FUNCTION CONTRACT
 * =================================================================== */

/**
 * Pure, deterministic projection reducer.
 *
 * Reduce an ordered list of Conduit receipts into a WRPProjection.
 *
 * Contract:
 * - Must not access external systems
 * - Must produce identical output for identical input
 * - Invalid transitions are silently skipped (convergence semantics)
 *
 * Spec: Conduit → WRP Bridge v0.1 §5
 */
export function reduceToProjection(
  planId: string,
  title: string,
  project: string,
  goal: string,
  filesAffected: string[],
  acceptanceCriteria: string[],
  dependencies: string[],
  promptRef: string | undefined,
  receipts: ConduitReceipt[],
): WRPProjection {
  // Step 1: Sort deterministically
  const sorted = sortReceipts(receipts);

  // Step 2: Fold through state machine
  let currentState: WRPState = "CREATED";
  const stateHistory: WRPEvent[] = [];
  const appliedIds: string[] = [];
  let skipped = 0;
  const errors: Array<{ receiptId: string; message: string }> = [];

  for (const receipt of sorted) {
    const candidate = receiptToWrpState(receipt.type);
    const valid = isValidTransition(currentState, candidate);

    stateHistory.push({
      receiptId: receipt.receiptId,
      receiptType: receipt.type,
      fromState: currentState,
      toState: candidate,
      valid,
      timestamp: receipt.createdAt,
    });

    if (valid) {
      currentState = candidate;
      appliedIds.push(receipt.receiptId);
    } else {
      skipped++;
      errors.push({
        receiptId: receipt.receiptId,
        message: `Invalid transition: ${currentState} → ${candidate} (via ${receipt.type})`,
      });
    }
  }

  // Step 3: Detect incomplete streams
  const partial = receipts.length === 0;
  const incompleteStart = receipts.length > 0 && receipts[0].sequence !== 0;

  // Step 4: Stratification (Layer 2)
  const hasCrossSystemImpact = false; // Would require cross-plan analysis
  const hasArchitecturalContent = goal.length > 200 || goal.includes("architecture") || goal.includes("design");
  const hasStructuralContent = filesAffected.length > 0;

  const abstractionLevel = determineAbstractionLevel(
    currentState,
    hasCrossSystemImpact,
    hasArchitecturalContent,
    hasStructuralContent,
  );

  const visibilityScope = levelToVisibilityScope(abstractionLevel);

  // Step 5: Build chunks
  const chunks: StratifiedChunk[] = buildChunks(
    title, goal, filesAffected, acceptanceCriteria,
    currentState, abstractionLevel, visibilityScope,
  );

  // Step 6: Cross-references (Layer 3)
  const crossReferences: CrossReference[] = buildCrossReferences(
    planId, dependencies, filesAffected, promptRef,
  );

  return {
    planId,
    title,
    project,
    wrpState: currentState,
    stateHistory,
    appliedReceiptIds: appliedIds,
    totalReceipts: receipts.length,
    skippedReceipts: skipped,
    partial,
    incompleteStart,
    errors,
    abstractionLevel,
    chunks,
    visibilityScope,
    crossReferences,
    goal,
    filesAffected,
    acceptanceCriteria,
    dependencies,
  };
}

/** @internal Build stratified chunks from plan metadata. */
function buildChunks(
  title: string,
  goal: string,
  filesAffected: string[],
  acceptanceCriteria: string[],
  state: WRPState,
  level: AbstractionLevel,
  scope: VisibilityScope,
): StratifiedChunk[] {
  const chunks: StratifiedChunk[] = [];

  // Title → OVERVIEW chunk
  chunks.push({
    content: title,
    level,
    chunkKind: "OVERVIEW",
    visibilityScope: scope,
    normativeStrength: "normative",
  });

  // Goal → DEFINITION or RATIONALE chunk
  if (goal) {
    chunks.push({
      content: goal,
      level,
      chunkKind: goal.length > 200 ? "RATIONALE" : "DEFINITION",
      visibilityScope: scope,
      normativeStrength: "normative",
    });
  }

  // Files affected → CONFIGURATION chunk
  if (filesAffected.length > 0) {
    chunks.push({
      content: filesAffected.join("\n"),
      level,
      chunkKind: "CONFIGURATION",
      visibilityScope: "all",
      normativeStrength: "informative",
    });
  }

  // Acceptance criteria → CONSTRAINTS chunk
  if (acceptanceCriteria.length > 0) {
    chunks.push({
      content: acceptanceCriteria.join("\n"),
      level,
      chunkKind: "CONSTRAINTS",
      visibilityScope: "all",
      normativeStrength: "normative",
    });
  }

  // Terminal state → ERROR or META chunk
  if (state === "FAILED") {
    chunks.push({
      content: `Plan terminated in FAILED state`,
      level: "L4",
      chunkKind: "ERROR",
      visibilityScope: "architect",
      normativeStrength: "informative",
    });
  } else if (state === "COMPLETED" || state === "ARCHIVED") {
    chunks.push({
      content: `Plan reached terminal state: ${state}`,
      level: "L3",
      chunkKind: "META",
      visibilityScope: "architect",
      normativeStrength: "historical",
    });
  }

  return chunks;
}

/**
 * Cross-reference relation type constants.
 * Taxonomy: audit/SPECS/CROSSREF_TAXONOMY.md, schemas/relationships/wrp-crossref-taxonomy.jsonld
 */
export const CROSSREF_TYPES = {
  WRP_DEPENDS_ON:     "wrp:depends_on" as const,
  WRP_IMPLEMENTS:     "wrp:implements" as const,
  WRP_TRACKED_BY:     "wrp:tracked_by" as const,
  WRP_IMPACTS_SYSTEM: "wrp:impacts_system" as const,
  WRP_SUPERSEDES:     "wrp:supersedes" as const,
};

/** @internal Build cross-references from dependencies, filesAffected, and promptRef. */
function buildCrossReferences(
  planId: string,
  dependencies: string[],
  filesAffected: string[],
  promptRef?: string,
): CrossReference[] {
  const refs: CrossReference[] = [];

  // wrp:depends_on — explicit plan dependencies
  for (const dep of dependencies) {
    const depId = dep.replace(/^#0*/, "");
    refs.push({
      relType: CROSSREF_TYPES.WRP_DEPENDS_ON,
      sourceId: planId,
      targetId: depId,
      metadata: { dependencyType: "explicit" },
    });
  }

  // wrp:impacts_system — shared files_affected entries
  // Each unique top-level path segment becomes a system impact.
  const seen = new Set<string>();
  for (const file of filesAffected) {
    const system = file.split("/")[0];
    if (system && !seen.has(system)) {
      seen.add(system);
      refs.push({
        relType: CROSSREF_TYPES.WRP_IMPACTS_SYSTEM,
        sourceId: planId,
        targetId: system,
        metadata: { file },
      });
    }
  }

  // wrp:implements — plan implements a WorkRequest referenced by promptRef
  if (promptRef) {
    refs.push({
      relType: CROSSREF_TYPES.WRP_IMPLEMENTS,
      sourceId: planId,
      targetId: promptRef,
      metadata: { kind: "prompt" },
    });
  }

  return refs;
}

/* ===================================================================
 * 8. PROJECTION INVARIANTS (DOCUMENTED CONSTRAINTS)
 * =================================================================== */

/**
 * I1 — All WRP state MUST be derived from receipts only.
 *
 * Enforcement: reduceToProjection() only reads its input parameters.
 * No global state, no DB access, no filesystem access.
 *
 * I2 — WRPProjection is disposable and recomputable.
 *
 * Enforcement: The output type contains only derived data. Any copy
 * is as valid as the original.
 *
 * I3 — Same receipts + same ordering = identical output.
 *
 * Enforcement: All functions are pure. compareReceipts() is a total
 * order. reduceToProjection() is a deterministic fold.
 *
 * I4 — Projection must support full or partial replay.
 *
 * Enforcement: reduceToProjection() processes any prefix of the full
 * receipt stream and produces a valid substate projection.
 */
