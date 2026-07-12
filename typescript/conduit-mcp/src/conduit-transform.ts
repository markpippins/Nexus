/**
 * conduit-transform.ts
 *
 * Conduit Transform: Typed State Transition
 * (Plan 1063)
 *
 * A Conduit Transform is the fundamental unit of state evolution in the
 * pipeline. It is defined as:
 *
 *   (StateView, Context) → Result<(StateDelta, Output, Trace), ValidationFailure>
 *
 * Key concepts:
 *   - Agents are generators of candidate Transform instances
 *   - RGEM is the rule system validating Context+Transform compatibility
 *   - Conduit is meta-transforms over Context
 *   - Big Pickle is a reduction over Trace graphs
 *
 * Context is behavioral, not spatial: it defines allowable operations on
 * state, not premises. A Premise is a rule-applied projection of state;
 * a Conclusion is a committed transform output.
 */

import { Opcode, WorkRequestStep } from "./work-request-isa.js";
import { AgentRole } from "./types.js";

// ── Result type (discriminated union) ────────────────────────────────────

export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ── StateView: what a transform is allowed to see ────────────────────────

/**
 * A read-only projection of the current pipeline state.
 * Transforms receive a StateView — they cannot access the full state,
 * only the subset they are permitted to observe.
 *
 * The view is scoped by:
 *   - planId: which plan this transform operates within
 *   - readablePaths: filesystem paths the transform may read
 *   - visibleReceipts: receipt history visible to this transform
 *   - envContext: environment variables and runtime config
 */
export interface StateView {
  /** Plan number this view is scoped to */
  planId: string;
  /** Project name from the plan */
  project: string;
  /** Goal string from the plan */
  goal: string;
  /** Files affected by the plan (declared) */
  filesAffected: string[];
  /** Acceptance criteria for the plan */
  acceptanceCriteria: string[];
  /** Dependencies (plan numbers that must be completed first) */
  dependencies: string[];
  /** Filesystem paths the transform is permitted to read */
  readablePaths: string[];
  /** Receipt history visible to this transform (filtered by role/scope) */
  visibleReceipts: ReceiptSummary[];
  /** Environment context: runtime config, model selection, etc. */
  envContext: Record<string, unknown>;
  /** Current derived status of the plan */
  currentStatus: string;
}

/** Summarized receipt for StateView — avoids leaking full metadata */
export interface ReceiptSummary {
  type: string;
  agentRole: string;
  summary: string;
  createdAt: string;
}

// ── Context: behavioral constraints on the transform ─────────────────────

/**
 * Context is behavioral, NOT spatial. It defines what operations a
 * transform is allowed to perform, not what state it can see.
 *
 * Context is validated by RGEM (Rule-Grid Evaluation Matrix):
 *   - allowedOpcodes: the closed set of ISA opcodes this transform may use
 *   - allowedPaths: filesystem paths the transform may write to
 *   - maxSteps: maximum number of steps in the transform
 *   - timeoutMs: execution timeout
 *   - modelConstraints: which models are permitted for this transform
 */
export interface Context {
  /** Allowed ISA opcodes (subset of the closed set) */
  allowedOpcodes: Opcode[];
  /** Filesystem paths the transform may write to */
  allowedPaths: string[];
  /** Maximum number of steps in the transform */
  maxSteps: number;
  /** Execution timeout in milliseconds */
  timeoutMs: number;
  /** Model constraints: which inference models are permitted */
  modelConstraints: ModelConstraint;
  /** Role of the agent generating this transform */
  agentRole: AgentRole;
  /** RGEM rule IDs that validated this context */
  rgemRuleIds: string[];
}

export interface ModelConstraint {
  /** Allowed model identifiers (e.g., "opencode/big-pickle") */
  allowedModels: string[];
  /** Minimum model quality tier */
  minTier: "fast" | "balanced" | "quality";
  /** Whether fallback models are allowed */
  allowFallback: boolean;
}

// ── StateDelta: what the transform is allowed to change ──────────────────

/**
 * The output state changes produced by a transform.
 * This is the "write set" — everything the transform modified.
 *
 * StateDelta is validated against Context.allowedPaths and
 * Context.allowedOpcodes before being committed.
 */
export interface StateDelta {
  /** Files created or modified */
  fileChanges: FileChange[];
  /** New receipts issued */
  newReceipts: ReceiptDelta[];
  /** Plan status transition (if any) */
  statusTransition?: StatusTransition;
  /** New WorkRequest steps emitted (if any) */
  workRequestSteps?: WorkRequestStep[];
  /** Cross-references created (if any) */
  newCrossRefs?: CrossRefDelta[];
}

export interface FileChange {
  path: string;
  changeType: "create" | "modify" | "delete";
  /** SHA-256 hash of the new content (null for deletes) */
  contentHash: string | null;
  /** Number of lines changed */
  linesAdded: number;
  linesRemoved: number;
}

export interface ReceiptDelta {
  type: string;
  agentRole: string;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface StatusTransition {
  from: string;
  to: string;
  reason: string;
}

export interface CrossRefDelta {
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relType: string;
}

// ── Output: the transform's direct result ────────────────────────────────

/**
 * The direct output of a transform — what it produces beyond state changes.
 * This is the "return value" of the transform function.
 */
export interface Output {
  /** Human-readable summary of what the transform accomplished */
  summary: string;
  /** Machine-readable result data */
  data?: Record<string, unknown>;
  /** Artifact paths produced by the transform */
  artifacts?: string[];
  /** Whether the transform recommends a review cycle */
  requiresReview: boolean;
}

// ── Trace: structured explanation of the transform's reasoning ───────────

/**
 * Trace provides a structured explanation of how the transform arrived
 * at its output. This is the "audit trail" for the transform.
 *
 * Trace is the foundation for Big Pickle: a reduction over Trace graphs
 * that enables cross-transform analysis and optimization.
 */
export interface Trace {
  /** SHA-256 hash of the input StateView (for provenance) */
  inputStateHash: string;
  /** RGEM rules that were applied to validate this transform */
  appliedRules: AppliedRule[];
  /** The reasoning path: ordered steps of how the transform proceeded */
  reasoningPath: ReasoningStep[];
  /** Human-readable justification for the transform's decisions */
  justification: string;
  /** Confidence score (0.0–1.0) */
  confidence: number;
  /** ID of the parent transform (if this is a sub-transform) */
  parentTransformId?: string;
  /** Timestamps for performance analysis */
  startedAt: string;
  completedAt: string;
  /** Model used for this transform */
  modelUsed: string;
  /** Token consumption */
  tokensConsumed: TokenUsage;
}

export interface AppliedRule {
  ruleId: string;
  ruleSource: "rgem" | "isa" | "context" | "custom";
  /** Whether the rule passed or failed validation */
  result: "pass" | "fail" | "warn";
  /** Details about what was validated */
  detail: string;
}

export interface ReasoningStep {
  stepIndex: number;
  /** What the transform was thinking at this step */
  description: string;
  /** Which opcode or action was considered */
  action?: string;
  /** Whether this step was executed or skipped */
  executed: boolean;
}

export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

// ── ValidationFailure: why a transform was rejected ──────────────────────

/**
 * ValidationFailure is the error type returned when a transform cannot
 * proceed. Failures are categorized by severity and source.
 */
export interface ValidationFailure {
  /** Category of failure */
  category: ValidationFailureCategory;
  /** Human-readable error message */
  message: string;
  /** Which field or component failed */
  field?: string;
  /** RGEM rule ID that triggered the failure (if applicable) */
  failingRuleId?: string;
  /** Whether this failure is recoverable (retryable) */
  recoverable: boolean;
  /** Suggested fix (if any) */
  suggestion?: string;
  /** Related transform ID (if this failure cascaded from another) */
  relatedTransformId?: string;
}

export type ValidationFailureCategory =
  | "context_violation"    // Transform attempted an operation not allowed by Context
  | "opcode_violation"     // Transform used an opcode not in the allowed set
  | "path_violation"       // Transform attempted to write outside allowed paths
  | "timeout"              // Transform exceeded its execution timeout
  | "model_violation"      // Transform used a model not permitted by constraints
  | "rgem_rejection"       // RGEM rules rejected the transform
  | "dependency_failure"   // A prerequisite transform failed
  | "state_corruption"     // Input state was inconsistent or corrupt
  | "step_limit_exceeded"  // Transform exceeded maxSteps
  | "unknown";             // Unclassified failure

// ── ConduitTransform: the typed state transition function ────────────────

/**
 * The Conduit Transform type signature:
 *
 *   (StateView, Context) → Result<(StateDelta, Output, Trace), ValidationFailure>
 *
 * This is the core abstraction. Every agent operation in the pipeline
 * is a ConduitTransform. The type system ensures that:
 *   1. Transforms only see what StateView allows
 *   2. Transforms only do what Context permits
 *   3. Successful transforms produce a StateDelta + Output + Trace
 *   4. Failed transforms produce a structured ValidationFailure
 *   5. Every transform is auditable via its Trace
 */
export type ConduitTransform = (
  state: StateView,
  context: Context,
) => Promise<Result<TransformSuccess, ValidationFailure>>;

export interface TransformSuccess {
  delta: StateDelta;
  output: Output;
  trace: Trace;
}

// ── Meta-Transforms: Conduit transforms over Context ─────────────────────

/**
 * Conduit is defined as "meta-transforms over Context."
 * A MetaTransform modifies the Context for downstream transforms,
 * rather than modifying state directly.
 *
 * Example: A planner agent may generate a Context that constrains
 * the builder agent's allowed opcodes and paths. The planner's
 * transform is a MetaTransform.
 */
export type MetaTransform = (
  state: StateView,
  context: Context,
) => Promise<Result<Context, ValidationFailure>>;

// ── Big Pickle: reduction over Trace graphs ──────────────────────────────

/**
 * Big Pickle is defined as "a reduction over Trace graphs."
 * It takes multiple Traces from related transforms and produces
 * a summary/analysis that can be used for:
 *   - Cross-transform optimization
 *   - Pattern detection
 *   - Confidence aggregation
 *   - Failure analysis
 */
export type BigPickleReducer<T> = (
  traces: Trace[],
) => T;

/**
 * Common Big Pickle reductions:
 *   - aggregateConfidence: average confidence across traces
 *   - detectPatterns: find recurring reasoning patterns
 *   - summarizeFailures: cluster and summarize validation failures
 */
export const BigPickle: {
  aggregateConfidence: BigPickleReducer<number>;
  detectPatterns: BigPickleReducer<ReasoningStep[]>;
  summarizeFailures: BigPickleReducer<string[]>;
} = {
  aggregateConfidence: (traces) => {
    if (traces.length === 0) return 0;
    return traces.reduce((sum, t) => sum + t.confidence, 0) / traces.length;
  },

  detectPatterns: (traces) => {
    const allSteps = traces.flatMap(t => t.reasoningPath);
    // Count frequency of each reasoning step by description prefix
    const freq = new Map<string, { step: ReasoningStep; count: number }>();
    for (const step of allSteps) {
      const key = step.description.slice(0, 80);
      const existing = freq.get(key);
      if (existing) {
        existing.count++;
      } else {
        freq.set(key, { step, count: 1 });
      }
    }
    // Return only steps that appear in more than one trace (recurring patterns)
    return Array.from(freq.values())
      .filter(v => v.count > 1)
      .map(v => v.step);
  },

  summarizeFailures: (traces) => {
    // Surface low-confidence traces as potential failure indicators
    return traces
      .filter(t => t.confidence < 0.5)
      .map(t => `Low confidence (${t.confidence.toFixed(2)}): ${t.justification}`);
  },
};

// ── TransformInstance: a concrete transform execution with an ID ─────────

/**
 * Represents a specific execution of a ConduitTransform.
 * This is the entity that Trace.parentTransformId and Conclusion.transformId
 * reference — transforms need IDs for traceability and provenance.
 */
export interface TransformInstance {
  /** Unique identifier for this transform execution */
  id: string;
  /** The transform function to execute */
  transform: ConduitTransform;
  /** The state view passed to the transform */
  state: StateView;
  /** The context the transform executes within */
  context: Context;
  /** Current execution status */
  status: TransformStatus;
  /** Result of the transform (set after execution) */
  result?: Result<TransformSuccess, ValidationFailure>;
  /** Timestamps */
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export type TransformStatus =
  | "pending"      // Created but not yet started
  | "running"      // Currently executing
  | "completed"    // Finished successfully
  | "failed"       // Finished with ValidationFailure
  | "cancelled";   // Aborted before completion

// ── Premise and Conclusion ───────────────────────────────────────────────

/**
 * A Premise is a rule-applied projection of state.
 * It represents the state as seen through the lens of a specific rule.
 *
 * A Conclusion is a committed transform output.
 * It represents the result after the transform has been applied and
 * validated.
 */
export interface Premise {
  /** The rule that produced this premise */
  ruleId: string;
  /** The state projection (subset of StateView) */
  projection: Record<string, unknown>;
  /** Whether the premise is satisfied by the current state */
  satisfied: boolean;
}

export interface Conclusion {
  /** The transform that produced this conclusion */
  transformId: string;
  /** The committed StateDelta */
  delta: StateDelta;
  /** Whether the conclusion has been validated */
  validated: boolean;
  /** Timestamp of commitment */
  committedAt: string;
}

// ── Helper: validate a transform against its context ─────────────────────

/**
 * Pre-execution validation: checks that a transform's planned operations
 * are compatible with its Context. This is the RGEM integration point.
 */
export function validateTransformContext(
  plannedSteps: WorkRequestStep[],
  context: Context,
): Result<void, ValidationFailure> {
  // Check step count
  if (plannedSteps.length > context.maxSteps) {
    return err({
      category: "step_limit_exceeded",
      message: `Planned ${plannedSteps.length} steps but context allows maximum ${context.maxSteps}`,
      field: "plannedSteps",
      recoverable: false,
      suggestion: "Reduce the number of steps or request a context with higher maxSteps",
    });
  }

  // Check opcodes
  for (const step of plannedSteps) {
    if (!context.allowedOpcodes.includes(step.op)) {
      return err({
        category: "opcode_violation",
        message: `Step ${step.step} uses opcode ${step.op} which is not allowed by the current context`,
        field: `plannedSteps[${step.step - 1}].op`,
        recoverable: false,
        suggestion: `Allowed opcodes: ${context.allowedOpcodes.join(", ")}`,
      });
    }

    // Check target paths
    if (step.target) {
      const isAllowed = context.allowedPaths.some(allowed => {
        if (allowed.endsWith("/")) return step.target.startsWith(allowed);
        return step.target === allowed || step.target.startsWith(allowed + "/");
      });
      if (!isAllowed) {
        return err({
          category: "path_violation",
          message: `Step ${step.step} targets ${step.target} which is outside allowed paths`,
          field: `plannedSteps[${step.step - 1}].target`,
          recoverable: false,
          suggestion: `Allowed paths: ${context.allowedPaths.join(", ")}`,
        });
      }
    }
  }

  return ok(undefined);
}
