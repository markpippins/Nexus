# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Agenda Generator for DeepSeek.html
**Model:** DeepSeek V4
**Total candidates:** 16
---
## 1. Cognitive Ontology Architecture — Replace Event-Driven with Observation-Driven Design
**Status:** `Agreed`

### Architectural Intent
Shift the system architecture from a flat event-driven model (Event → State Change) to a cognitive ontology that layers observation, interpretation, motivation, priority, and action. Events are not important; observations are important. Priorities emerge from observations in the presence of motivations. This is the foundational architectural shift that transforms Cascade from an event server into a reality reconstruction domain.

### Requirements & Acceptance Criteria
- [ ] System must distinguish between raw observations (what happened) and interpreted priorities (what matters)
- [ ] Priority must be a computed product of Observation × Motivation, never an inherent property of the observation itself
- [ ] The Observation layer must be kept as close to ground truth as possible — no meaning attached at ingest time
- [ ] Motivations must be defined as a separate, independently versioned set of concerns (Maintain Consistency, Reduce Drift, Complete Work, Preserve Invariants, Improve Understanding)

### Unresolved Follow-Ups
- What is the exact schema for Motivation objects — are they static config, learned weights, or user-defined?
- How does the system bootstrap initial Motivations before any learning has occurred?

---

## 2. Observation → Motivation → Priority → Action Pipeline Specification
**Status:** `Agreed`

### Architectural Intent
Define a four-layer pipeline where raw Observations flow through Motivation evaluation to produce Priorities, which then drive Actions. This replaces the flat event→state-change model with a structured cognitive processing chain. The pipeline separates signal detection (Cascade), signal interpretation (Analyst), and signal response (Conduit) into distinct, testable stages.

### Requirements & Acceptance Criteria
- [ ] Observations must be source-attributed, timestamped, typed, and include evidence (e.g., File changed, Git commit appeared, Service became unavailable)
- [ ] Motivations must have a weight/priority field that determines their influence on priority scoring
- [ ] Priority is a join table linking observation_id to motivation_id with a computed score and rationale
- [ ] The pipeline must be observable end-to-end for debugging and CIR measurement

### Harvested Code Artifacts
#### Purpose: Core type definitions for the Observation → Motivation → Priority pipeline
```typescript
Observation {
  id
  source
  timestamp
  type
  evidence
}

Motivation {
  id
  description
  weight
}

Priority {
  observation_id
  motivation_id
  score
  rationale
}
```

### Unresolved Follow-Ups
- What scoring algorithm computes Priority.score from Observation + Motivation?
- How are conflicting priorities (same observation, competing motivations) resolved?

---

## 3. Meta-Observational Layer — Introspection, Reflection, and Perspective
**Status:** `Proposed`

### Architectural Intent
Introduce a meta-observational layer above the core pipeline that governs how priorities are formed. Perspective defines the interpretive frame, Reflection tracks belief changes over time, and Introspection captures current beliefs. These are not the same class of thing as raw Observations — they are meta-constructs that operate on the system's own internal state rather than external events.

### Requirements & Acceptance Criteria
- [ ] Perspective must answer: 'From which frame am I interpreting this?'
- [ ] Reflection must answer: 'What has changed in my beliefs over time?'
- [ ] Introspection must answer: 'What do I currently believe?'
- [ ] These constructs must be stored alongside but separately from raw Observations to avoid category confusion

### Harvested Code Artifacts
#### Purpose: Meta-observational construct type definitions
```typescript
Perspective {
  id
  frame
  active
}

Introspection {
  id
  belief
  confidence
  timestamp
}

Reflection {
  id
  previous_belief
  current_belief
  delta
  timestamp
}
```

### Unresolved Follow-Ups
- How does Perspective switch/update — is it event-driven or manually toggled?
- What is the cadence for Reflection — continuous, periodic, or triggered by significant deltas?
- How are Introspection beliefs represented — as structured data, natural language assertions, or embeddings?

---

## 4. Role-to-System Mapping for Cognitive Pipeline
**Status:** `Agreed`

### Architectural Intent
Assign each existing system component a specific responsibility in the cognitive pipeline. Cascade produces Observations, Receipts, Timelines, and Signals. Analyst consumes Observations + Motivations and produces Priorities. Conduit consumes Priorities and produces Actions. PEB/Engineer constrains Motivation → Priority → Action through invariants. This creates clean separation of concerns and testable interfaces between components.

### Requirements & Acceptance Criteria
- [ ] Cascade must never attach meaning to observations — it is a pure signal producer
- [ ] Analyst must have access to the full Motivation catalog to compute priorities correctly
- [ ] Conduit must only act on computed Priorities, never on raw Observations
- [ ] PEB/Engineer invariants must be enforceable at the Motivation, Priority, and Action levels
- [ ] Each role's outputs must be persisted as audit artifacts for replay and CIR analysis

### Harvested Code Artifacts
#### Purpose: Role-to-system mapping specification
```text
Cascade:
  Produces: Observation | Receipt | Timeline | Signal

Analyst:
  Consumes: Observation + Motivation
  Produces: Priority

Conduit:
  Consumes: Priority
  Produces: Action

PEB / Engineer:
  Constrains: Motivation | Priority | Action (through invariants)
```

### Unresolved Follow-Ups
- Are Receipt and Signal subtypes of Observation or separate artifact types?
- Does Analyst need its own persistence layer for computed Priorities, or does Cascade store them?
- How are PEB invariants defined — as code, configuration, or learned constraints?

---

## 5. Cascade Evolution Path — From Event Server to Reality Reconstruction Domain
**Status:** `Proposed`

### Architectural Intent
Define Cascade's long-term evolution from a simple event server (Event → Observation → Receipt → Timeline) into a full reality reconstruction domain (Observation → Motivation → Priority → Introspection → Reflection → Perspective). The evolution is additive — Cascade's identity remains constant while its capabilities expand through new artifact types and processing layers.

### Requirements & Acceptance Criteria
- [ ] Cascade's initial deployment must support at minimum: Event ingestion, Observation production, Receipt generation, Timeline construction
- [ ] Each evolution phase must be backward-compatible with existing artifact types
- [ ] New artifact types (Introspection, Reflection, Perspective) must conform to Cascade's existing storage and query patterns
- [ ] The evolution must be versioned so CIR can compare across phases

### Unresolved Follow-Ups
- What is the trigger for phase transitions — feature completeness, stability metrics, or user demand?
- How does Voyager's compression interact with the expanded artifact types in later phases?

---

## 6. Dual-Meaning Outcome Model — Realized History vs Intended Structure
**Status:** `Agreed`

### Architectural Intent
Formally separate 'outcome' into two distinct concepts: Outcome_realized (post-event ground-truth trace in the event spine, e.g., LOSM state transitions, CIR-observed results, Eval judgments) and Outcome_intended (pre-event projected future state manifold, e.g., acceptance criteria, plan compilation graph, tactic expectation models, cluster-conditioned priors). These must never be merged into a single concept — collapsing them causes the system to treat intended structure as if it were observed truth, which is the failure mode in most agentic systems.

### Requirements & Acceptance Criteria
- [ ] Outcome_realized and Outcome_intended must be stored in separate schemas/tables
- [ ] CIR must compute: CIR = distance(Outcome_realized, Outcome_intended)
- [ ] The system must reject any code path that reads Outcome_intended as if it were Outcome_realized
- [ ] Every execution receipt must link its realized outcome back to its originating intended outcome for traceability

### Harvested Code Artifacts
#### Purpose: Formal definition of the outcome model and CIR computation
```text
Outcome_realized ≠ Outcome_intended

CIR = distance(Outcome_realized, Outcome_intended)

Projected Outcome Manifold  (intent space)
Observed Outcome Trace     (reality space)

Learning = improving the mapping, not the outcomes themselves
```

### Unresolved Follow-Ups
- What is the distance function — cosine similarity, structural diff, or a composite metric?
- How are partial matches handled when only some acceptance criteria are met?

---

## 7. Three-Space Architecture — Intent, Execution, and Learning Spaces
**Status:** `Agreed`

### Architectural Intent
Formalize the system architecture into three distinct semantic spaces, not just abstraction levels. Intent Space (planning) contains strategies, tactics, acceptance criteria, ContextCluster priors, and projected outcome manifolds — it answers 'What state do we want to move toward?' Execution Space (reality) contains Conduit, LOSM kernel, state transitions, and execution receipts — it answers 'What actually happened?' Learning Space (mapping) contains CIR, Eval, Voyager, ConflictEvents, and losm-store aggregation — it answers 'How wrong or right was our intent relative to reality?' Planning is not 'above' implementation — it is a different coordinate system operating at coarser resolution.

### Requirements & Acceptance Criteria
- [ ] Each space must have its own persistence schema with clear boundaries
- [ ] Intent Space operates at coarse-grained state transformations (cluster-level)
- [ ] Execution Space operates at fine-grained transitions (event-level)
- [ ] Learning Space operates at statistical alignment between the two
- [ ] Intent must never directly mutate execution state — it can only propose, constrain, and define expected outcomes
- [ ] All execution must be mediated through Conduit + LOSM

### Harvested Code Artifacts
#### Purpose: Three-space architecture type definitions
```typescript
// Intent Space — coarse-grained state transformations
IntentSpace {
  strategies: Strategy[]
  tactics: Tactic[]
  acceptance_criteria: AcceptanceCriteria[]
  context_cluster_priors: ContextClusterPrior[]
  projected_outcome_manifolds: ProjectedOutcomeManifold[]
}

// Execution Space — fine-grained transitions
ExecutionSpace {
  state_transitions: StateTransition[]
  execution_receipts: ExecutionReceipt[]
}

// Learning Space — statistical alignment
LearningSpace {
  cir_measurements: CIRMeasurement[]
  eval_judgments: EvalJudgment[]
  compressed_observations: CompressedObservation[]
  conflict_events: ConflictEvent[]
}
```

### Unresolved Follow-Ups
- How does Voyager's compression interact with the three-space model — does it compress across spaces or within them?
- What are the synchronization guarantees between spaces — eventual consistency or transactional?

---

## 8. IntentGraph — Persistent, Versioned, Replayable Multi-Step Intent Structure
**Status:** `Proposed`

### Architectural Intent
Create IntentGraph as a first-class persistent artifact in losm-store that encodes multi-step intent (strategy → tactic → sub-tactic) as a typed directed acyclic graph of decision commitments. Currently strategies, tactics, and execution steps are temporally generated but not structurally persisted, causing loss of intent structure after execution, weak comparability between runs, and CIR learning without full causal graph context. IntentGraph turns planning from a transient artifact into a versioned, inspectable, replayable data structure.

### Requirements & Acceptance Criteria
- [ ] IntentGraph must be stored in losm-store with versioning support
- [ ] Must support status transitions: DRAFT → EXECUTED → REPLAYABLE → INVALIDATED
- [ ] Must link to ContextSignature and ContextCluster for region-of-validity tracking
- [ ] Must include an acceptance_schema (AcceptanceCriteria) at the graph level
- [ ] Must support replay: re-running the same IntentGraph under different models and comparing outcomes
- [ ] Must support diffing: comparing intent versions across runs

### Harvested Code Artifacts
#### Purpose: IntentGraph core type definition with node and edge types
```typescript
IntentGraph {
  graph_id: string
  context_signature_id: string
  context_cluster_id: string
  nodes: IntentNode[]
  edges: IntentEdge[]
  root_strategy_id: string
  acceptance_schema: AcceptanceCriteria
  version: number
  status: "DRAFT" | "EXECUTED" | "REPLAYABLE" | "INVALIDATED"
}

IntentNode =
  | StrategyNode
  | TacticNode
  | SubTacticNode
  | ConstraintNode
  | ExpectedOutcomeNode

IntentEdge {
  from: IntentNode
  to: IntentNode
  relation:
    | "refines"
    | "depends_on"
    | "constrains"
    | "decomposes"
    | "expects"
}
```

### Unresolved Follow-Ups
- How do IntentGraphs evolve — merge, split, and mutate safely without breaking replayability?
- What is the storage format — JSON in losm-store or a native graph database?
- How are circular dependencies detected and prevented in the DAG?
- What happens when a node in an executed IntentGraph is invalidated — does the entire graph become INVALIDATED?

---

## 9. IntentGraph Edge Semantics — Structured Decomposition of Intent
**Status:** `Proposed`

### Architectural Intent
Define five edge relation types for IntentGraph that encode intent semantics, not just execution flow. 'refines' indicates a child node adds detail to a parent strategy. 'depends_on' indicates execution ordering — the target must complete before the source can proceed. 'constrains' indicates the target node limits the valid state space of the source. 'decomposes' indicates the source is broken into sub-components represented by the target. 'expects' links a node to its ExpectedOutcomeNode, defining what successful execution looks like. Together these make the graph a structured decomposition of intent into enforceable transformations.

### Requirements & Acceptance Criteria
- [ ] Each edge must have exactly one relation type from the defined set
- [ ] 'refines' edges must point from more specific to more general nodes
- [ ] 'depends_on' edges define partial ordering for execution traversal
- [ ] 'constrains' edges must reference enforceable constraint definitions
- [ ] 'expects' edges must link to ExpectedOutcomeNode instances with measurable criteria
- [ ] The graph must be validated for semantic consistency (no contradictory edges) before execution

### Unresolved Follow-Ups
- Can edges have weights or confidence scores?
- How are edge semantics validated — static analysis, runtime checks, or both?
- What happens when an 'expects' edge is violated — rollback, retry, or record-and-continue?

---

## 10. Execution as IntentGraph Traversal — Plan Compiler to LOSM Projection
**Status:** `Proposed`

### Architectural Intent
Define execution as a traversal of IntentGraph rather than a translation. A Plan Compiler projects the IntentGraph into a LOSM-compatible Execution Graph, which Conduit then executes. This means execution is a projection of intent graph into a runnable state machine — not a rewrite of intent. The key capability this unlocks is replayability: the same IntentGraph can be re-run under different models, with outcomes compared. Intent versions can be diffed, and the same intent graph can be tested in different ContextClusters to measure cluster-specific performance.

### Requirements & Acceptance Criteria
- [ ] Plan Compiler must produce deterministic Execution Graphs from a given IntentGraph
- [ ] Execution Graphs must be LOSM-compatible (consumable by Conduit without translation)
- [ ] The projection must preserve IntentGraph node/edge identity for CIR attribution
- [ ] Replay must be semantically identical — same IntentGraph, same inputs → comparable execution traces
- [ ] Diffing must identify structural changes (added/removed/modified nodes and edges) between IntentGraph versions

### Harvested Code Artifacts
#### Purpose: Execution Graph type — LOSM-compatible projection of IntentGraph
```typescript
ExecutionGraph {
  intent_graph_id: string
  intent_graph_version: number
  nodes: ExecutionNode[]
  edges: ExecutionEdge[]
  projected_at: timestamp
  compiler_version: string
}

ExecutionNode {
  intent_node_id: string
  losm_transition: LOSMTransition
  preconditions: Constraint[]
  expected_outcomes: ExpectedOutcome[]
}

ExecutionEdge {
  from: ExecutionNode
  to: ExecutionNode
  ordering: "sequential" | "parallel" | "conditional"
}
```

### Unresolved Follow-Ups
- How does the Plan Compiler handle nodes with unmet dependencies at compilation time?
- What is the failure mode if a LOSM transition fails mid-graph — partial rollback or full abort?
- How are conditional branches in the IntentGraph (via 'constrains' edges) resolved at execution time?

---

## 11. Voyager as Intent Pattern Miner — Compressing Historical IntentGraph Executions
**Status:** `Proposed`

### Architectural Intent
Reposition Voyager from a general state compressor to a specialized compressor over historical IntentGraph executions. It produces recurring intent structures, identifies unstable subgraphs, and surfaces high-success graph motifs. This transforms Voyager from state compression into intent pattern mining over time — it discovers which intent structures work reliably and which don't, feeding back into ContextCluster and tactic weight updates.

### Requirements & Acceptance Criteria
- [ ] Voyager must ingest executed IntentGraphs with their associated CIR scores
- [ ] Must produce recurring intent structures (common subgraph patterns across successful executions)
- [ ] Must identify unstable subgraphs (patterns with high CIR deviation across runs)
- [ ] Must surface high-success graph motifs for reuse in future planning
- [ ] Compression output must be queryable by ContextCluster to update cluster-specific tactic weights

### Unresolved Follow-Ups
- What is the compression algorithm — subgraph isomorphism detection, embedding similarity, or frequency analysis?
- How does Voyager distinguish between 'this subgraph is unstable' and 'this ContextCluster is inherently unpredictable'?
- What is the minimum number of executions needed before Voyager can produce meaningful pattern insights?

---

## 12. Graph-Localized CIR — Node and Edge-Level Deviation Attribution
**Status:** `Proposed`

### Architectural Intent
Evolve CIR from a global 'did the tactic work?' measurement into a graph-localized attribution system. CIR attaches to specific IntentGraph nodes, edges, and subgraphs to identify which part of the intent graph failed to map correctly to execution reality. This enables precise learning feedback: instead of knowing a strategy failed, the system knows exactly which tactic node and which edge relation caused the deviation.

### Requirements & Acceptance Criteria
- [ ] CIR must produce attribution records referencing IntentGraph node IDs and edge IDs
- [ ] Failed node attribution must identify the specific IntentNode that deviated from expected outcome
- [ ] Violated edge attribution must identify the edge relation (e.g., 'expects') that was broken
- [ ] Deviation magnitude must be quantified for prioritization
- [ ] Attribution data must feed back into ContextCluster weight updates and Voyager pattern mining

### Harvested Code Artifacts
#### Purpose: Graph-localized CIR attribution record
```typescript
CIRAttribution {
  intent_graph_id: string
  intent_graph_version: number
  failed_node?: {
    node_id: string
    node_type: "StrategyNode" | "TacticNode" | "SubTacticNode" | "ConstraintNode" | "ExpectedOutcomeNode"
  }
  violated_edge?: {
    edge_id: string
    relation: "refines" | "depends_on" | "constrains" | "decomposes" | "expects"
  }
  deviation: "low" | "medium" | "high" | "critical"
  subgraph_affected?: string[]
  recommended_action?: string
}
```

### Unresolved Follow-Ups
- How are cascading failures attributed — if node A fails causing node B to fail, does B get its own CIR record?
- What is the threshold for 'deviation: critical' vs 'deviation: high'?
- How are subgraph boundaries determined for subgraph_affected attribution?

---

## 13. IntentGraph Versioning and Safe Mutation — Merge, Split, and Evolve Without Breaking Replayability
**Status:** `Proposed`

### Architectural Intent
Define how IntentGraphs evolve safely over time. Graphs must support merging (combining two related intent structures), splitting (extracting a subgraph into a standalone reusable component), and mutation (replacing nodes/edges with improved versions). All mutations must preserve replayability — any previously executed version must remain replayable against its original execution traces. This turns the system into a versioned cognition system rather than just a structured planner.

### Requirements & Acceptance Criteria
- [ ] IntentGraph versions must be immutable once executed — mutations create new versions
- [ ] Merge must produce a new IntentGraph with combined nodes/edges and a new version number
- [ ] Split must extract a subgraph into a standalone IntentGraph while preserving the original
- [ ] Previously executed versions must remain replayable indefinitely
- [ ] CIR consistency must be maintained across versions — version N+1's CIR must be comparable to version N's
- [ ] Version lineage must be tracked (which graph was derived from which)

### Harvested Code Artifacts
#### Purpose: IntentGraph versioning and lineage tracking types
```typescript
IntentGraphVersion {
  graph_id: string
  version: number
  parent_version?: number
  derived_from?: string[]  // graph IDs that were merged
  extracted_from?: { graph_id: string, version: number }  // if split
  mutation_type: "create" | "merge" | "split" | "mutate"
  created_at: timestamp
  status: "DRAFT" | "EXECUTED" | "REPLAYABLE" | "INVALIDATED" | "SUPERSEDED"
}

// Safe mutation operations:
// merge(graphA, graphB) → new IntentGraph with combined DAG
// split(graph, subgraphRootId) → extracted IntentGraph + pruned original
// mutate(graph, nodeReplacements[], edgeReplacements[]) → new version
```

### Unresolved Follow-Ups
- How are merge conflicts resolved when two graphs have contradictory 'constrains' edges?
- What makes a subgraph 'extractable' — must it be a connected component?
- How many versions are retained before archival/compression?

---

## 14. IntentGraph as Universal Anchor — All System Concepts Attach to Graph Elements
**Status:** `Agreed`

### Architectural Intent
Establish IntentGraph as the universal anchoring point for all system concepts. ContextClusters anchor to IntentGraph regions, Tactics are nodes in the graph, Acceptance Criteria are graph-level constraints, CIR attaches to node/edge deviations, Eval scores entire graph executions, and ConflictEvents represent inconsistent graph interpretations. This is the 'missing anchor' that makes the entire architecture coherent — everything ties back to a versioned, inspectable, replayable graph structure.

### Requirements & Acceptance Criteria
- [ ] Every ContextCluster must reference the IntentGraph region(s) it was derived from
- [ ] Every Tactic must be instantiated as a node within a specific IntentGraph
- [ ] Acceptance Criteria must be defined at the graph level and inherited by all nodes
- [ ] CIR attributions must link to specific nodes and edges
- [ ] Eval scores must reference the IntentGraph version they evaluated
- [ ] ConflictEvents must identify the inconsistent graph interpretation(s)

### Unresolved Follow-Ups
- How are ContextCluster-to-graph-region mappings maintained as graphs evolve?
- What happens to Eval scores when an IntentGraph is superseded — are they archived or carried forward?

---

## 15. Three-Space System Final Form — Intent, Execution, and Learning as a Mapping System
**Status:** `Agreed`

### Architectural Intent
The final architectural model: a three-space system where Intent Space (IntentGraph) defines what we mean to do, Execution Space (LOSM) records what actually happens, and Learning Space (CIR/Eval/Voyager) measures how we map intent to execution over time. Learning is geometric correction of intent-to-reality mapping per region of decision space. The system does not work with 'outcomes' as a single thing — it works with a mapping system between two structured spaces with CIR as the metric over that mapping.

### Requirements & Acceptance Criteria
- [ ] Intent Space must maintain structured, versioned IntentGraphs with full node/edge semantics
- [ ] Execution Space must produce immutable, timestamped traces of all state transitions
- [ ] Learning Space must continuously compute the divergence between intent projections and execution traces
- [ ] The mapping must be cluster-conditioned — different ContextClusters may have different mapping accuracy
- [ ] All three spaces must be independently queryable and cross-referenceable

### Harvested Code Artifacts
#### Purpose: Final three-space mapping architecture
```text
Intent Space (IntentGraph)
  → what we *mean to do*
  
Execution Space (LOSM)
  → what *actually happens*
  
Learning Space (CIR/Eval/Voyager)
  → how we *map intent to execution over time*

The system operates over multiple representations of
state evolution, each with different resolution and time horizon.

Learning = geometric correction of intent-to-reality mapping
per region of decision space.
```

### Unresolved Follow-Ups
- How does the Learning Space handle systemic drift — when the entire intent-to-reality mapping degrades across all clusters?
- What triggers a full re-evaluation of all IntentGraphs vs incremental CIR updates?

---

## 16. Intent as First-Class Geometric Object — Predictive Geometry Over Future State Space
**Status:** `Agreed`

### Architectural Intent
Elevate intent from a transient planning artifact to a first-class geometric object with structure, comparability, and measurability. Intent has structure (clusters, tactics, constraints), can be compared across time (version diff), and can be measured against reality (CIR). This makes intent a predictive geometry over future state space — it defines the expected shape of the system after applying a tactic, which can then be compared against the actual shape that resulted.

### Requirements & Acceptance Criteria
- [ ] Intent structures must be serializable and versionable in losm-store
- [ ] Intent comparison must support structural diff (which nodes/edges changed) and semantic diff (did the meaning change?)
- [ ] Intent measurement must produce quantitative CIR scores per node, edge, and graph
- [ ] Intent must survive execution — it persists as a versioned artifact, not a transient decision
- [ ] The predictive geometry must be cluster-conditioned: predictions are only valid within their ContextCluster

### Unresolved Follow-Ups
- What is the mathematical representation of the predictive geometry — vector embeddings, graph embeddings, or something else?
- How is 'distance' between intent manifold and outcome trace computed in practice?

---
