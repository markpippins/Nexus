# Phase 3 — Observation Model v1

## 1. Definition

Phase 3: Observation Layer

Phase 3 is a pure projection layer over (ExecutionGraph + EventLog + ReplayState) that produces derived semantic views for inspection, analysis, and debugging.

It is:

- **not** part of execution
- **not** part of compilation
- **not** part of replay truth
- **a read-only semantic interpreter over system history**

## 2. Position in Architecture

```
Phase 1: Specification Compiler
    Prompt → Requirements → WorkRequestGraph

Phase 1.5: Lowering Compiler
    WorkRequestGraph → ExecutionGraph

Phase 2: Execution Runtime
    ExecutionGraph → EventLog

Phase 3: Observation Layer
    (EventLog + ExecutionGraph + ReplayState)
              ↓
         Observational Views
```

## 3. Core Principle

Observation is **not** state. Observation is a function of history, not a participant in it.

```
ObservationView = f(EventLog, ExecutionGraph, ReplayState)
```

But:

```
Observation ∉ EventLog
Observation ∉ ExecutionGraph
Observation ∉ Runtime State
```

## 4. View AST (Observation Type System)

Phase 3 introduces a View AST. These are high-level semantic interpretations, distinct from raw replay observations.

### 4.1 Base View Node

```json
{
  "observation_id": "OBS-001",
  "type": "GraphView | NodeView | TraceView | DependencyView | FailureView | SystemView",
  "source_range": {
    "start_event": 1200,
    "end_event": 1450
  },
  "projection_time": "REPLAY | LIVE | SNAPSHOT",
  "derived_from": {
    "event_log_hash": "abc123",
    "execution_graph_hash": "def456",
    "replay_state_hash": "ghi789"
  },
  "content": {},
  "ephemeral": true
}
```

### 4.2 GraphView

Structural interpretation of ExecutionGraph over time:

- active node count per phase
- topology summary (immutable, but reveal structural properties)
- execution density heatmap (concurrent vs sequential regions)
- completion ratio per lifecycle state

### 4.3 NodeView

Per-node semantic interpretation:

- lifecycle timeline (state transitions with timestamps)
- input/output trace (artifact refs per transition)
- executor performance metrics (duration, retries)
- retry chain (linked list of retry attempts)

### 4.4 TraceView

Causal chain reconstruction:

- full event lineage for a given node or subtree
- dependency walk (upstream and downstream)
- root-cause tracing (failure → causal ancestor chain)

Equivalent to: `event → event → event` (causal closure).

### 4.5 DependencyView

Derived DAG from runtime behavior:

- actual vs intended dependency execution order
- blocked paths and their root cause
- critical path analysis (longest chain)
- parallelization efficiency

### 4.6 FailureView

Semantic failure reconstruction:

- FailureNode lineage (failure → retry → failure → terminal)
- retry trees (branching retry attempts)
- propagation graphs (failed node → blocked dependents)
- failure mode classification per F1–F11 taxonomy

### 4.7 SystemView

Distributed system perspective:

- host activity maps (which hosts executed what)
- lease distribution over time
- claim conflicts (two hosts attempting same node)
- scheduler load balance (node distribution across hosts)

## 5. Observation Engine (Phase-3 Interpreter)

### 5.1 Definition

The Observation Engine is a pure query interpreter over derived state:

```
observe(query, EventLog, ExecutionGraph, ReplayState) → ObservationView
```

It:

1. optionally replays event range via Replay Engine
2. reconstructs intermediate ReconstructedState at requested point
3. projects semantic interpretation onto View AST
4. emits ephemeral view (in-memory only)

### 5.2 Execution Model

| Property | Value |
|---|---|
| Side effects | None |
| Persistence | None |
| Deterministic | Yes |
| Replayable | Yes |
| Cacheable | Optional |

### 5.3 Formal Composition

```
Observation = Projection(Interpretation(Replay(EventLog)))
```

Expanded:

```
EventLog → Replay Engine → ReconstructedState → Observation Interpreter → View AST
```

### 5.4 Required Invariant

Replay-level observations MUST NOT be used as input to Observation Engine semantic reducers.

```
Valid:   ObservationEngine(input) := ReplayEngine(EventLog) → ReconstructedState + EventLog slice
Invalid: ObservationEngine(ReplayObservations)  ← breaks abstraction boundary
```

## 6. Temporal Modes

Observation supports 3 temporal projections:

### 6.1 LIVE

- Observes current event head
- Near-real-time projection
- Partial state acceptable
- Used for: dashboards, live monitoring

### 6.2 SNAPSHOT

- Observes EventLog[0..k] at a deterministic cut
- Fully reproducible
- Used for: reports, audit, comparison

### 6.3 REPLAY

- Uses Replay Engine to reconstruct state at time t
- Strongest form — fully causal
- Used for: debugging, forensic analysis

## 7. Key Invariants

### 7.1 Non-interference

Observation MUST NOT modify:

- ExecutionGraph
- EventLog
- Scheduler state
- Replay state

### 7.2 Derivation Invariance

Given identical input history, the Observation Engine produces identical View AST output.

```
∀ h₁, h₂: h₁ = h₂ ⇒ observe(query, h₁) = observe(query, h₂)
```

### 7.3 Ephemeral Guarantee

All ObservationView objects are session-bound or explicitly discardable. They are never part of the canonical EventLog.

```
∀ v ∈ ObservationView: lifetime(v) ≤ session
```

### 7.4 Causal Consistency

Observation must respect event order: if event A precedes B in EventLog, then any observation that includes both must reflect A ≤ B.

```
A <_log B ⇒ A ≤_obs B
```

## 8. Relationship to Replay Engine

| Component | Role | Output |
|---|---|---|
| Replay Engine | State reconstruction | ReconstructedState |
| Observation Engine | Semantic interpretation | View AST |

```
Replay = reconstruct semantics
Observation = interpret semantics
```

### 8.1 Dependency Chain

```
EventLog
  ↓
Replay Engine (pure fold)
  ↓
ReconstructedState (reconstructed)
  ↓
Observation Engine (semantic projection)
  ↓
View AST (ephemeral)
```

### 8.2 What the Observation Engine calls

```
function observe(query, eventLog, executionGraph):
    replayEngine = new ReplayEngine()
    state = replayEngine.replay(eventLog)
    return projectView(query, state, eventLog, executionGraph)

function projectView(query, state, eventLog, executionGraph):
    switch query.type:
        case "graph":      return GraphView(state, executionGraph)
        case "node":       return NodeView(state, query.node_id)
        case "trace":      return TraceView(state, query.node_id, eventLog)
        case "dependency": return DependencyView(state, executionGraph)
        case "failure":    return FailureView(state, eventLog)
        case "system":     return SystemView(state, eventLog)
```

## 9. Relationship to Event System

Observation is:

- **not** an event producer
- **not** an event consumer in the causal chain
- **only** a reader of event history

It MAY emit debug artifacts externally (logs, UI traces) but these are explicitly **not** part of the EventLog and never participate in causal chains.

## 10. Architectural Stratification (4 Layers)

After Phase 3, the system has four distinct semantic strata:

### Constructive System (Phases 1–2)

Builds and executes computation.

| Layer | Function |
|---|---|
| Compiler | Defines what should happen |
| Runtime | Makes it happen |

### Interpretive System (Phase 3)

Explains computation without affecting it.

| Layer | Function |
|---|---|
| Replay | Reconstructs what happened |
| Observation | Explains what it means |

### Complete Stack

```
Prompt
  ↓
Requirements
  ↓
WorkRequestGraph
  ↓
ExecutionGraph (AST)
  ↓
Distributed Runtime
  ↓
EventLog
  ↓
Replay Engine (state reconstruction)
  ↓
Observation Engine (semantic interpretation)
  ↓
UI / Analytics / Debug Tools
```

## 11. Final System Identity

The architecture is now:

```
           SPECIFICATION
                ↓
          LOWERING COMPILER
                ↓
         EXECUTION GRAPH (AST)
                ↓
        DISTRIBUTED RUNTIME
                ↓
            EVENT LOG
                ↓
          REPLAY ENGINE
                ↓
        OBSERVATION LAYER
```

Phase 3 introduces semantic introspection over deterministic execution history — meaning derived from execution, not execution itself.

---

**Status:** Active Design
**Priority:** Foundation for all observability tooling
