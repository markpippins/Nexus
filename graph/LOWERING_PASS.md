>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# Lowering Pass v1 — Phase 1.5 Compiler Boundary

## 1. Definition

The Lowering Pass is a formal compiler stage that transforms the abstract WorkRequestGraph (high-level IR) into the concrete ExecutionGraph (low-level runtime AST).

```
WorkRequestGraph (intent IR) → [Lowering Pass] → ExecutionGraph (executable AST)
```

This is exactly analogous to IR lowering in a traditional compiler:

| Compiler Stage | This System |
|---|---|
| Parse | Prompt → Requirements |
| Semantic Analysis | Requirements → WorkRequests |
| IR Generation | WorkRequestGraph |
| **Lowering** | **WorkRequestGraph → ExecutionGraph** |
| Runtime | Scheduler |

## 2. Purpose

WorkRequests describe **what** must happen. The ExecutionGraph describes **how** it will run.

Lowering introduces everything WorkRequests lack:
- Executor selection (which runtime handles this capability)
- Lifecycle phasing (prepare, execute, finalize)
- Dependency projection (intent-level edges → node-level edges)
- Data channel resolution (explicit artifact paths)
- Constraint lowering (declarative hints → scheduler hints)
- State initialization (all nodes enter `pending`)

## 3. Input Model: WorkRequestGraph

```typescript
type WorkRequestGraph = {
  workRequests: Map<WorkRequestId, WorkRequest>
  dependencies: DependencyEdge[]
}

type WorkRequest = {
  id: WorkRequestId
  requirementRefs: RequirementId[]
  capability: CapabilityName
  inputs: InputSpec
  outputs: OutputSpec
  constraints?: ConstraintSet
}

type DependencyEdge = {
  from: WorkRequestId
  to: WorkRequestId
  type: "data" | "ordering" | "resource"
}
```

### 3.1 Key Property

WorkRequests are **not executable**. They lack:
- Executor binding
- Runtime lifecycle
- Retry policy
- Scheduling semantics
- State

### 3.2 Boundary Invariant

The WorkRequestGraph MUST NOT carry control-plane artifacts:

```
WorkRequestGraph ∉ { routing metadata, execution modes, execution flags, pipeline stage decisions }
```

This is enforced by:
- the type schema (no fields exist for these values)
- validator invariant V8 (`VALIDATOR_SPEC.md §7`)
- the `requirements-capture` boundary contract (`REQUIREMENTS_CAPTURE_BOUNDARY.md §7 E3`)

Any WorkRequestGraph that violates this is architecturally invalid and MUST be rejected by the lowering pass's validation step (Step 1, §5.1).

## 4. Output Model: ExecutionGraph

```typescript
type ExecutionGraph = {
  id: ExecutionGraphId
  nodes: Map<ExecutionNodeId, ExecutionNode>
  edges: ExecutionEdge[]
  metadata: ExecutionMetadata
}

type ExecutionNode = {
  id: ExecutionNodeId
  workRequestRef: WorkRequestId
  internal_phase: "prepare" | "execute" | "finalize"
  executor_selection: ExecutorSelection | null
  lifecycle_state: "pending"
  inputs: InputSpec
  outputs: OutputSpec
  scheduling_hints: SchedulingHints
  retry_policy: RetryPolicy
  event_refs: string[]
}

type ExecutionEdge = {
  from: ExecutionNodeId
  to: ExecutionNodeId
  type: "data" | "control" | "resource"
  artifactRef?: ArtifactPath
}

type ExecutionMetadata = {
  createdFrom: WorkRequestGraphId
  createdAt: timestamp
  version: string
}

type ExecutorSelection = {
  executorId: string
  executionMode: string
  resourceProfile: ResourceProfile
}

type SchedulingHints = {
  priority?: number
  concurrencyGroup?: string
  resourceTags?: string[]
}
```

## 5. Lowering Algorithm

### 5.1 Signature

```typescript
function lower(wrGraph: WorkRequestGraph): ExecutionGraph
```

### 5.2 Step 0 — Validate Input Graph

**Preconditions** (all must hold):
- Graph is acyclic (no dependency cycles)
- All dependency targets exist in the work request set
- Every `capability` is recognized by the ExecutorRegistry
- Every `inputs` spec is satisfiable (required fields present, types match)

**Failure**: If any precondition fails, emit `LoweringError` and halt. No graph is produced.

### 5.3 Step 1 — Executor Selection

For each WorkRequest, select a concrete executor capable of fulfilling its capability.

```
rule: WR.capability ∈ ExecutorRegistry.capabilities
```

| Candidates | Action |
|---|---|
| 0 | LoweringError — halt |
| 1 | Select directly |
| 2+ | Apply tiebreakers: cost model ↓, concurrency efficiency ↑ |

Produces:

```typescript
ExecutorSelection {
  executorId: string
  executionMode: string
  resourceProfile: ResourceProfile
}
```

**Formal guarantee**: Every WorkRequest maps to exactly one executor selection.

### 5.4 Step 2 — Node Expansion

Each WorkRequest expands into a canonical triple of execution lifecycle nodes:

```
WorkRequest WR
   ↓
[PrepareNode] → [ExecuteNode] → [FinalizeNode]
```

| Phase | Responsibility |
|---|---|
| `prepare` | Environment setup, resource acquisition, input validation |
| `execute` | Primary computation — the core work |
| `finalize` | Output commit, resource release, side-effect finalization |

**Canonical expansion rule**:

```
expand(WR) => [
  ExecutionNode { id, workRequestRef, internal_phase: "prepare",  ... },
  ExecutionNode { id, workRequestRef, internal_phase: "execute",  ... },
  ExecutionNode { id, workRequestRef, internal_phase: "finalize", ... }
]
```

**Why expansion exists**: WorkRequests are atomic logically but execution is not atomic operationally. Separating prepare/execute/finalize enables checkpointing, partial retry, and clean output commitment.

**Edge insertion within expansion**:

```
PrepareNode ──[control]──→ ExecuteNode ──[control]──→ FinalizeNode
```

### 5.5 Step 3 — Dependency Projection

Convert WorkRequest-level dependency edges into ExecutionNode-level edges.

**Rule**: If `WR_A → WR_B`, then:

```
FinalizeNode(A) ──[control]──→ PrepareNode(B)
```

This guarantees:
- Outputs are committed before consumption
- Scheduler has precise ordering constraints
- Deterministic replay across node boundaries

**Projection matrix**:

| WR Edge Type | Projected As |
|---|---|
| `data` | `Finalize(A) → Prepare(B)` + DataChannel edge with artifactRef |
| `ordering` | `Finalize(A) → Prepare(B)` (control edge only) |
| `resource` | `Finalize(A) → Prepare(B)` + resource tag propagation |

### 5.6 Step 4 — Data Channel Resolution

For each data dependency, create an explicit runtime data channel.

```
ExecutionEdge {
  from: FinalizeNode(A).id,
  to: PrepareNode(B).id,
  type: "data",
  artifactRef: ".pipeline/RESPONSE_RECORDS/{A.id}.json"
}
```

**Effect**: Runtime never guesses data flow. Every data transfer has an explicitly resolved path.

### 5.7 Step 5 — Constraint Lowering

Convert declarative WorkRequest constraints into concrete scheduler hints.

| WorkRequest Constraint | Lowered Form |
|---|---|
| `requires: "gpu"` | `scheduling_hints.resourceTags = ["gpu"]` |
| `serialize: true` | `scheduling_hints.concurrencyGroup = "mutex:{WR.id}"` |
| `priority: "high"` | `scheduling_hints.priority = 1` |
| `timeout: "30s"` | `retry_policy.timeout_ms = 30000` |
| `retry: 3` | `retry_policy.max_retries = 3` |

### 5.8 Step 6 — Lifecycle Initialization

All nodes enter the same initial state:

```
lifecycle_state = "pending"
```

Graph-level metadata is populated:

```typescript
ExecutionMetadata {
  createdFrom: wrGraph.id,
  createdAt: now(),
  version: "1"
}
```

### 5.9 Step 7 — Graph Assembly

Collect all expanded nodes, projected edges, and metadata into the final ExecutionGraph.

```typescript
execGraph.nodes = all expanded nodes (keyed by id)
execGraph.edges = projected edges + intra-expansion edges
execGraph.metadata = ExecutionMetadata
```

### 5.10 Static Validation Gate

> **Precondition**: `validate_authority()` must have passed before lowering is invoked. Authority validation is a compile-time existence gate — it determines whether lowering is permitted. If AEI1–AEI4 produce any FATAL violation, the lowering pass MUST NOT start. No `ExecutionGraph` is built from an invalid system architecture. See [`VALIDATOR_SPEC.md §V11`](./VALIDATOR_SPEC.md).

Before freezing, the assembled graph MUST pass the static validator:

```
validate_static(execGraph) → list<ValidationFailure>
```

If any ERROR or FATAL `ValidationFailure` is returned, compilation aborts. No ExecutionGraph is emitted.

See [`VALIDATOR_SPEC.md`](./VALIDATOR_SPEC.md) for the full rule set (S1–S10) and severity model.

### 5.11 Step 8 — Freeze

After validation passes, the graph is frozen (topology locked):

## 6. Pseudocode Reference

```typescript
function lower(wrGraph: WorkRequestGraph): ExecutionGraph {
  validate(wrGraph)

  const execGraph = new ExecutionGraph()
  const index = new Map<WorkRequestId, ExecutionNode[]>()

  for (const wr of wrGraph.workRequests) {
    const selection = selectExecutor(wr)
    const nodes = expandLifecycle(wr, selection)
    execGraph.addNodes(nodes)
    index.set(wr.id, nodes)
  }

  for (const dep of wrGraph.dependencies) {
    const sourceNodes = index.get(dep.from)
    const targetNodes = index.get(dep.to)
    const sourceFinalize = sourceNodes.find(n => n.internal_phase === "finalize")
    const targetPrepare = targetNodes.find(n => n.internal_phase === "prepare")

    const edge: ExecutionEdge = {
      from: sourceFinalize.id,
      to: targetPrepare.id,
      type: dep.type === "data" ? "data" : "control",
      artifactRef: dep.type === "data" ? resolveArtifactRef(sourceFinalize) : undefined
    }
    execGraph.addEdge(edge)
  }

  applyConstraints(execGraph)
  initializeLifecycle(execGraph)
  emitLoweringEvents(execGraph)

  // Static validator gate — abort on ERROR/FATAL
  const violations = validate_static(execGraph)
  const fatals_or_errors = violations.filter(v => v.severity in {ERROR, FATAL})
  if (fatals_or_errors.length > 0) {
    emitValidationFailures(fatals_or_errors)
    abort("Static validation failed — no ExecutionGraph produced")
  }

  execGraph.freeze()  // topology locked
  return execGraph
}
```

## 7. Formal Invariants

### 7.1 Determinism

```
same WorkRequestGraph + same ExecutorRegistry → identical ExecutionGraph
```

No randomness allowed. Selection tiebreakers must be deterministic (e.g., lexicographic on executor ID).

### 7.2 Completeness

```
∀ wr ∈ WorkRequestGraph:
    ∃ nodes ∈ ExecutionGraph | ∀ node ∈ nodes: node.workRequestRef = wr.id
```

Every WorkRequest maps to at least one ExecutionNode.

### 7.3 Dependency Preservation

```
If wrGraph has edge WR_A → WR_B:
    then execGraph has path Finalize(A) → ... → Prepare(B)
```

Intent-level ordering is enforced at execution level.

### 7.4 Scheduler Independence

Lowering produces structure. The scheduler produces behavior. The two must remain separate — lowering does not execute work, the scheduler does not reinterpret intent.

### 5.12 Step 9 — Event Emission

Lowering itself emits events that make the compilation step replayable:

| Event | Trigger |
|---|---|
| `ExecutionGraphCreated` | Graph assembled, pre-validation |
| `ExecutorSelected` | Per-WorkRequest executor selection complete |
| `ExecutionNodeGenerated` | Each expanded node created |
| `DependencyLowered` | Each WorkRequest edge projected |
| `LoweringComplete` | Graph frozen, handed to Phase 2 |

## 9. Error Model

| Error | Step | Recovery |
|---|---|---|
| Cyclic dependency graph | Step 0 | Halt, report cycle path |
| Unknown capability | Step 0 | Halt, report unmapped capability |
| Unsatisfiable inputs | Step 0 | Halt, report missing fields |
| No matching executor | Step 1 | Halt, report capability gap |
| Node ID collision | Step 2 | Halt, system bug |
| Edge projection target missing | Step 3 | Halt, system bug |

All errors produce a `LoweringError` event before halting.

## 10. Architectural Position

```
Phase 1: Intent Compiler
  Prompt → Requirements → WorkRequests → WorkRequestGraph
                                              ↓
Phase 1.5: Lowering Compiler  ⬅  You are here
  WorkRequestGraph → ExecutionGraph
                                              ↓
Phase 2: Runtime Interpreter
  ExecutionGraph → Scheduler → Events → Outputs
```

This makes the full system a **two-stage compiler with an event-sourced runtime**:

| Stage | Role |
|---|---|
| Phase 1 (Intent) | Front-end: parse, analyze, generate IR |
| Phase 1.5 (Lowering) | Middle-end: lower IR to executable form |
| Phase 2 (Runtime) | Back-end: interpret executable form, produce trace |

## 11. What Lowering Enables

- **Dry-run execution**: Validate the ExecutionGraph without running it
- **Static validation**: Catch errors before any executor runs
- **Cost estimation**: Compute resource requirements from expanded nodes
- **Simulation**: Walk the lowered graph without executors
- **Partial execution**: Execute a subset of nodes for testing
- **Replay debugging**: Deterministically reconstruct the graph from events
- **Distributed scheduling**: Ship subgraphs to remote schedulers
- **Deterministic recovery**: Rebuild scheduler state from the frozen graph + event stream
