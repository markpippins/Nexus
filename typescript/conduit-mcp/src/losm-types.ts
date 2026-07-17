/**
 * losm-types.ts
 *
 * LOSM (Lifecycle-Oriented State Machine) Type Definitions
 * (Plans 1069, 1070, 1071, 1072)
 *
 * This file defines the type contracts for:
 *   - WorkRequest Lifecycle as Unit of Update (#1069)
 *   - Projection Engine: Immutable Read Layer Over Event Spine (#1070)
 *   - NATS Event Contracts: Command/Event/Transition/Policy Subjects (#1071)
 *   - LOSM Minimal Kernel: Command→Policy→Transition→Event→Version (#1072)
 */

import { WorkRequestDocument } from "./work-request-isa.js";
import { AgentRole } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════
//  Plan 1072 — LOSM Minimal Kernel
//  Command → Policy → Transition → Event → Version
// ═══════════════════════════════════════════════════════════════════════

/**
 * The only loop in LOSM: Command → Policy → Transition → Event → Version.
 * The kernel only validates, transitions, and emits events.
 * It NEVER calls projections — strict separation of truth (kernel) from
 * interpretation (projections) and agency (scheduler).
 */

export type KernelCommandType =
  | "CREATE_ARTIFACT"
  | "REFINE_ARTIFACT"
  | "BRANCH_ARTIFACT"
  | "MERGE_ARTIFACTS"
  | "TRANSFORM_ARTIFACT"
  | "TERMINATE_ARTIFACT";

export interface KernelCommand {
  id: string;
  type: KernelCommandType;
  artifactId: string;
  payload: Record<string, unknown>;
  issuedBy: string;
  issuedAt: string;
}

export type PolicyDecision =
  | { allowed: true; conditions?: string[] }
  | { allowed: false; reason: string; failingRuleId?: string };

export interface PolicyRule {
  id: string;
  /** Command types this rule applies to */
  appliesTo: KernelCommandType[];
  /** Evaluate the rule against the command + current state */
  evaluate: (command: KernelCommand, currentState: ArtifactVersion) => PolicyDecision;
}

export type TransitionType =
  | "Refine"     // Same artifact, new version with improvements
  | "Branch"     // Create a divergent copy from a version
  | "Merge"      // Combine two branches into one
  | "Transform"  // Structural change (e.g., schema migration)
  | "Terminate"; // End-of-life for an artifact

export interface Transition {
  id: string;
  type: TransitionType;
  fromVersionId: string;
  toVersionId: string;
  preconditions: string[];
  postconditions: string[];
  evidence: string[];
  executedAt: string;
}

export interface KernelEvent {
  id: string;
  type: string;
  transitionId: string;
  artifactId: string;
  versionId: string;
  payload: Record<string, unknown>;
  emittedAt: string;
}

/**
 * ArtifactVersion — never update, always create a new version.
 * The event spine is immutable and append-only.
 */
export interface ArtifactVersion {
  id: string;
  artifactId: string;
  versionNumber: number;
  parentId: string | null;
  state: Record<string, unknown>;
  createdAt: string;
  /** Hash of the state for integrity verification */
  stateHash: string;
}

/**
 * The minimal kernel loop: Command → Policy → Transition → Event → Version
 */
export interface KernelLoop {
  command: KernelCommand;
  policyDecision: PolicyDecision;
  transition?: Transition;
  event?: KernelEvent;
  newVersion?: ArtifactVersion;
}

// ═══════════════════════════════════════════════════════════════════════
//  Plan 1069 — WorkRequest Lifecycle as Unit of Update
// ═══════════════════════════════════════════════════════════════════════

/**
 * The unit of update is a WorkRequest lifecycle transition.
 * Only a transition in the lifecycle of a WorkRequest changes the system.
 *
 * Events explain WHAT happened; WorkRequests explain WHY.
 *
 * Lifecycle: CIR appears → WR created → Plan generated → Decision approved
 *            → Execution occurs → Receipt recorded → PGE updated
 */

export type WorkRequestLifecyclePhase =
  | "cir_appears"        // Cognitive Intent Request detected
  | "wr_created"         // WorkRequest created from CIR
  | "plan_generated"     // Implementation plan generated
  | "decision_approved"  // Decision approved by governance
  | "execution_occurs"   // Execution of the WorkRequest
  | "receipt_recorded"   // Receipt recorded as proof
  | "pge_updated";       // Policy Governance Engine updated

export interface WorkRequestLifecycle {
  workRequestId: string;
  cirId: string;
  currentPhase: WorkRequestLifecyclePhase;
  phaseHistory: LifecyclePhaseEntry[];
  planId?: string;
  receiptId?: string;
}

export interface LifecyclePhaseEntry {
  phase: WorkRequestLifecyclePhase;
  enteredAt: string;
  exitedAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * The five information layers:
 *   PGE = governance memory
 *   Execution Context = causal history
 *   WorkRequest IR = executable intent
 *   CIRs = semantic pressure
 *   Receipts = proof
 */
export interface InformationLayers {
  pge: PolicyGovernanceEntry[];
  executionContext: ExecutionContextEntry[];
  workRequestIR: WorkRequestDocument[];
  cirs: CognitiveIntentRequest[];
  receipts: ReceiptProof[];
}

export interface PolicyGovernanceEntry {
  id: string;
  policyId: string;
  decision: string;
  rationale: string;
  timestamp: string;
}

export interface ExecutionContextEntry {
  id: string;
  workRequestId: string;
  causalChain: string[];
  timestamp: string;
}

export interface CognitiveIntentRequest {
  id: string;
  intent: string;
  source: string;
  pressure: number;
  detectedAt: string;
}

export interface ReceiptProof {
  id: string;
  type: string;
  workRequestId: string;
  artifactHash: string;
  timestamp: string;
}

/**
 * Harness pattern: starts workflow → triggers plan → triggers execution
 * → records receipt → emits governance update
 */
export interface HarnessPattern {
  startWorkflow(cir: CognitiveIntentRequest): Promise<string>;
  triggerPlan(workRequestId: string): Promise<string>;
  triggerExecution(planId: string): Promise<string>;
  recordReceipt(workRequestId: string, receipt: ReceiptProof): Promise<void>;
  emitGovernanceUpdate(workRequestId: string): Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════
//  Plan 1070 — Projection Engine: Immutable Read Layer Over Event Spine
// ═══════════════════════════════════════════════════════════════════════

/**
 * Projection = (artifactId, queryContext) → View
 * Pure, immutable function. Never mutates.
 *
 * Projection Service consumes Event Stream → Rebuilder → View Models.
 * All UI, Orb, and agents consume only projections.
 */

export interface QueryContext {
  requesterRole: AgentRole;
  scope: string;
  filters?: Record<string, unknown>;
  pagination?: { offset: number; limit: number };
}

export type View = Record<string, unknown>;

export type Projection = (
  artifactId: string,
  queryContext: QueryContext,
) => Promise<View>;

export interface ProjectionDefinition {
  name: string;
  endpoint: string;
  description: string;
  projection: Projection;
}

export type ProjectionEndpoint =
  | "/projection/state"
  | "/projection/risks"
  | "/projection/conflicts"
  | "/projection/ambiguity"
  | "/projection/diff"
  | "/projection/blockers";

export const PROJECTION_ENDPOINT_CATALOG: Record<ProjectionEndpoint, string> = {
  "/projection/state": "Current artifact state view",
  "/projection/risks": "Risk assessment projection",
  "/projection/conflicts": "Conflict detection projection",
  "/projection/ambiguity": "Ambiguity analysis projection",
  "/projection/diff": "Version diff projection",
  "/projection/blockers": "Blocker identification projection",
};

export interface ProjectionService {
  /** Register a projection definition */
  register(definition: ProjectionDefinition): void;
  /** Execute a projection by endpoint name */
  project(endpoint: ProjectionEndpoint, artifactId: string, ctx: QueryContext): Promise<View>;
  /** Replay events to rebuild a projection */
  replay(eventHistory: KernelEvent[]): Promise<ArtifactVersion>;
  /** Compute metrics from replayed events */
  computeMetrics(version: ArtifactVersion): Record<string, number>;
}

/**
 * Stability metric: f(eventHistory, velocity, entropy)
 * Measures how stable an artifact's projection is.
 */
/**
 * Stability metric function: f(eventHistory, velocity, entropy) → number
 * Measures how stable an artifact's projection is.
 */
export type StabilityMetricFn = (
  eventHistory: KernelEvent[],
  velocity: number,
  entropy: number,
) => number;

/** Computed stability value (0.0–1.0) */
export type StabilityMetric = number;

/**
 * SelfModel = project(systemEvents) — a special projection over the
 * Event Spine that represents the system's understanding of itself.
 */
export type SelfModel = (systemEvents: KernelEvent[]) => Promise<View>;

// ═══════════════════════════════════════════════════════════════════════
//  Plan 1071 — NATS Event Contracts
//  Command/Event/Transition/Policy Subjects
// ═══════════════════════════════════════════════════════════════════════

/**
 * NATS subjects are contract boundaries between kernel services.
 * Strict separation:
 *   Scheduler → losm.command (Kernel consumes)
 *   Kernel → losm.event (Event Store consumes)
 *   Kernel → losm.transition (validation)
 *   Policy decisions on losm.policy
 *   Kernel NEVER calls projections.
 */

export type NATSSubjectCategory =
  | "command"
  | "event"
  | "transition"
  | "policy";

export interface NATSSubject {
  category: NATSSubjectCategory;
  subject: string;
  description: string;
  publisher: string;
  subscriber: string;
}

export const NATS_SUBJECT_CONTRACTS: readonly NATSSubject[] = [
  {
    category: "command",
    subject: "losm.command.create",
    description: "Scheduler emits create commands → Kernel consumes",
    publisher: "scheduler-service",
    subscriber: "kernel-service",
  },
  {
    category: "command",
    subject: "losm.command.refine",
    description: "Scheduler emits refine commands → Kernel consumes",
    publisher: "scheduler-service",
    subscriber: "kernel-service",
  },
  {
    category: "command",
    subject: "losm.command.branch",
    description: "Scheduler emits branch commands → Kernel consumes",
    publisher: "scheduler-service",
    subscriber: "kernel-service",
  },
  {
    category: "command",
    subject: "losm.command.merge",
    description: "Scheduler emits merge commands → Kernel consumes",
    publisher: "scheduler-service",
    subscriber: "kernel-service",
  },
  {
    category: "command",
    subject: "losm.command.transform",
    description: "Scheduler emits transform commands → Kernel consumes",
    publisher: "scheduler-service",
    subscriber: "kernel-service",
  },
  {
    category: "command",
    subject: "losm.command.terminate",
    description: "Scheduler emits terminate commands → Kernel consumes",
    publisher: "scheduler-service",
    subscriber: "kernel-service",
  },
  {
    category: "event",
    subject: "losm.event.created",
    description: "Kernel emits creation events → Event Store consumes",
    publisher: "kernel-service",
    subscriber: "event-store",
  },
  {
    category: "event",
    subject: "losm.event.refined",
    description: "Kernel emits refinement events → Event Store consumes",
    publisher: "kernel-service",
    subscriber: "event-store",
  },
  {
    category: "event",
    subject: "losm.event.transitioned",
    description: "Kernel emits transition events → Event Store consumes",
    publisher: "kernel-service",
    subscriber: "event-store",
  },
  {
    category: "event",
    subject: "losm.event.terminated",
    description: "Kernel emits termination events → Event Store consumes",
    publisher: "kernel-service",
    subscriber: "event-store",
  },
  {
    category: "transition",
    subject: "losm.transition.validate",
    description: "Kernel emits transition validation requests",
    publisher: "kernel-service",
    subscriber: "kernel-service",
  },
  {
    category: "transition",
    subject: "losm.transition.execute",
    description: "Kernel emits transition execution commands",
    publisher: "kernel-service",
    subscriber: "kernel-service",
  },
  {
    category: "policy",
    subject: "losm.policy.evaluate",
    description: "Kernel requests policy evaluation",
    publisher: "kernel-service",
    subscriber: "policy-engine",
  },
  {
    category: "policy",
    subject: "losm.policy.decision",
    description: "Policy engine returns decisions",
    publisher: "policy-engine",
    subscriber: "kernel-service",
  },
];

/**
 * Kernel invariant: Kernel never calls projections.
 * This type enforces that the kernel's interface does not include
 * projection calls.
 */
export interface KernelService {
  /** Consume commands from losm.command.* */
  consumeCommand(command: KernelCommand): Promise<KernelLoop>;
  /** Emit events to losm.event.* */
  emitEvent(event: KernelEvent): Promise<void>;
  /** Validate transitions on losm.transition.* */
  validateTransition(transition: Transition): Promise<PolicyDecision>;
  /** Request policy evaluation on losm.policy.* */
  requestPolicyEvaluation(command: KernelCommand): Promise<PolicyDecision>;
  // NOTE: No projection calls — kernel never calls projections.
}

// ═══════════════════════════════════════════════════════════════════════
//  Plan 1067 — Nebula/KG Split: Work Reality vs Cognitive Structure
// ═══════════════════════════════════════════════════════════════════════

/**
 * Nebula = filing cabinets and todo lists (external work/operational truth).
 * KG = grey matter (cognitive model/concept map).
 *
 * Invariant: KG can reference Nebula but never become Nebula.
 * Steward maintains KG but does not own Nebula reality.
 *
 * Perception ≠ Memory ≠ Action — proper cognition architecture split.
 */

export type SystemDomain =
  | "nebula"    // Operational reality: tasks, artifacts, execution history
  | "kg"        // Cognitive model: semantic clustering, conceptual adjacency
  | "steward";  // Maintenance process for KG

export interface NebulaDomain {
  /** Tasks and todo lists */
  tasks: NebulaTask[];
  /** Artifacts and operational state */
  artifacts: NebulaArtifact[];
  /** Execution history */
  executionHistory: NebulaExecutionRecord[];
}

export interface NebulaTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  createdAt: string;
}

export interface NebulaArtifact {
  id: string;
  type: string;
  path: string;
  content: string;
  updatedAt: string;
}

export interface NebulaExecutionRecord {
  id: string;
  taskId: string;
  outcome: string;
  duration: number;
  timestamp: string;
}

export interface KGDomain {
  /** Semantic clustering of concepts */
  semanticClusters: KGCluster[];
  /** Conceptual adjacency map */
  conceptualAdjacency: KGAdjacency[];
  /** Interpretation graph */
  interpretationGraph: KGNode[];
  /** Retrieval scaffolding */
  retrievalScaffolding: KGScaffold[];
}

export interface KGCluster {
  id: string;
  centroidEntityId: string;
  memberEntityIds: string[];
  coherence: number;
}

export interface KGAdjacency {
  entityId: string;
  adjacentEntityIds: string[];
  adjacencyType: string;
  weight: number;
}

export interface KGNode {
  id: string;
  entityId: string;
  interpretation: string;
  confidence: number;
  /** Reference to Nebula source (never becomes Nebula) */
  nebulaSourceId?: string;
}

export interface KGScaffold {
  id: string;
  queryPattern: string;
  entryPointEntityId: string;
  traversalStrategy: string;
}

/**
 * The split invariant: KG references Nebula but never becomes Nebula.
 * This function validates that a KG node does not contain raw Nebula
 * operational data — only references to it.
 */
export function validateSplitInvariant(
  kgNode: KGNode,
  nebulaArtifacts: NebulaArtifact[],
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // KG nodes may reference Nebula source IDs but must not embed
  // raw Nebula artifact content (exact match or near-duplicate containment)
  if (kgNode.nebulaSourceId) {
    const referenced = nebulaArtifacts.find(a => a.id === kgNode.nebulaSourceId);
    if (referenced) {
      // Check exact duplication
      if (kgNode.interpretation === referenced.content) {
        violations.push(
          `KG node ${kgNode.id} exactly duplicates Nebula artifact content — ` +
          `KG must reference Nebula, not become it`
        );
      }
      // Check containment: interpretation contains substantial raw artifact content
      else if (referenced.content.length > 100 &&
               kgNode.interpretation.includes(referenced.content.slice(0, Math.floor(referenced.content.length * 0.8)))) {
        violations.push(
          `KG node ${kgNode.id} embeds >80% of raw Nebula artifact content — ` +
          `KG must reference Nebula, not become it`
        );
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Steward role: maintains KG, does not own Nebula truth.
 * Steward operations are limited to KG maintenance.
 */
export interface StewardRole {
  /** Maintain semantic clusters in KG */
  updateClusters(): Promise<void>;
  /** Maintain conceptual adjacency */
  updateAdjacency(): Promise<void>;
  /** Maintain interpretation graph */
  updateInterpretations(): Promise<void>;
  /** Build retrieval scaffolding */
  buildScaffolding(): Promise<void>;
  // NOTE: No Nebula mutation — Steward does not own Nebula reality.
}
