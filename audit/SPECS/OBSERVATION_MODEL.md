> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

# Phase 3 — Observation Model v1

## Related Specifications

| Document | Relationship |
|---|---|
| [`REPLAY_ENGINE.md`](./REPLAY_ENGINE.md) | Temporal reconstruction — Observation Engine uses replay for state reconstruction |
| [`EXECUTION_GRAPH_SCHEMA.md`](./EXECUTION_GRAPH_SCHEMA.md) | ExecutionGraph + EventLog — the primary inputs to observation |
| [`CER_SPEC.md`](./CER_SPEC.md) | Canonical Event Record format — entity_key used for stable entity resolution |
| [`EVENT_GRAMMAR.md`](./EVENT_GRAMMAR.md) | Event type taxonomy — observation views derived from typed events |
| [`COMPILER_ARCHITECTURE.md`](./COMPILER_ARCHITECTURE.md) | Four-phase architecture — Phase 3 is the Observation Layer |

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

Phase 3 introduces a View AST. These are high-level semantic interpretations, distinct from raw replay observations. All views use `entity_key` from CER identity for stable entity resolution.

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
    "cer_log_hash": "abc123",
    "execution_graph_hash": "def456",
    "replay_state_hash": "ghi789"
  },
  "entity_resolution": {
    "ccnf_version": 1,
    "collapse_engine_version": 1
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
- entity_key-based dedup: nodes with identical entity_key counted once
- alias chains resolved via collapse_key for cross-snapshot consistency

### 4.3 NodeView

Per-node semantic interpretation:

- lifecycle timeline (state transitions with timestamps)
- input/output trace (artifact refs per transition)
- executor performance metrics (duration, retries)
- retry chain (linked list of retry attempts)
- entity_key-based identity: node identity stable across renames via collapse_key and alias_keys

### 4.4 TraceView

Causal chain reconstruction:

- full event lineage for a given node or subtree
- dependency walk (upstream and downstream)
- root-cause tracing (failure → causal ancestor chain)
- entity_key-based tracing: follows stable identity across causal chains

Equivalent to: `event → event → event` (causal closure).

### 4.5 DependencyView

Derived DAG from runtime behavior:

- actual vs intended dependency execution order
- blocked paths and their root cause
- critical path analysis (longest chain)
- parallelization efficiency
- identity collapse for cross-snapshot consistency (nodes renamed between snapshots resolved via alias_keys)

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

```python
function observe(query, cer_event_log, executionGraph,
                  ccnf_version=1, collapse_engine_version=1, rehydration_version=1):
    replayEngine = new ReplayEngine()
    state = replayEngine.replay(
        cer_event_log,
        empty_state(),
        ccnf_version,
        collapse_engine_version,
        rehydration_version
    )
    return projectView(query, state, cer_event_log, executionGraph)

function projectView(query, state, cer_event_log, executionGraph):
    switch query.type:
        case "graph":      return GraphView(state, executionGraph, cer_event_log)  # with entity_key dedup
        case "node":       return NodeView(state, query.node_id, cer_event_log)   # with alias resolution
        case "trace":      return TraceView(state, query.node_id, cer_event_log)
        case "dependency": return DependencyView(state, executionGraph, cer_event_log)  # with identity collapse
        case "failure":    return FailureView(state, cer_event_log)
        case "system":     return SystemView(state, cer_event_log)
```

### 8.3 Synthetic Event Handling

The Observation Engine MAY emit SYNTHETIC observation events for inferred causal edges. These are:
- Marked with `synthetic: true` and `derivation_source: [event_ids]`
- NEVER stored in the CER Event Log
- Session-bound ephemeral views only
- Distinguished from CER SYNTHETIC compression strategy events

```python
function infer_causal_edge(source_event, target_event, cer_event_log):
    # Verify both source and target exist in CER log
    # Deterministic inference: if target.causality.parent_event_ids contains
    # source.event_id, the edge is real. Otherwise, it's inferred.
    if target.event_id in source.causality.parent_event_ids:
        return None  # real edge, no inference needed
    # Otherwise emit synthetic observation
    return {
        "type": "SyntheticCausalEdge",
        "synthetic": true,
        "derivation_source": [source.event_id, target.event_id],
        "content": {
            "source_id": source.event_id,
            "target_id": target.event_id,
            "confidence": "inferred"
        }
    }
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
CER Pipeline (stateless transform)
  ↓
CER Event Log (canonical truth)
  ↓
Replay Engine (rehydrate + fold)
  ↓
Snapshot Engine (async compression)
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

## 12. CER Identity Resolution in Views

### 12.1 Principle

CER identity layers (`entity_key`, `collapse_key`, `alias_keys`) provide stable entity resolution across all observation views. The observation engine uses the same identity system as the CER pipeline, producing views that are self-consistent across time.

### 12.2 Per-View Identity Rules

| View | Identity Rule |
|---|---|
| `GraphView` | Nodes deduplicated by `entity_key`. `collapse_key` enables cross-snapshot structural comparison |
| `NodeView` | Node identity is stable through renames via `alias_keys`. The view resolves all aliases to the primary `entity_key` |
| `TraceView` | Traces follow `entity_key` across causal chains. A renamed node retains its trace continuity |
| `DependencyView` | Identity collapse resolves renamed nodes across snapshots for consistent dependency analysis |
| `FailureView` | Failure lineage references `entity_key`, not node_id. Survives node re-creation and renaming |
| `SystemView` | Host and lease identities use `entity_key` for stable distributed system observation |

### 12.3 Identity Table

The observation engine MAY maintain an identity resolution table for the view session:

```json
{
  "entity_key": "abc123...",
  "canonical_type": "node",
  "collapse_key": "executiongraph.node.scheduler",
  "aliases_seen": ["scheduler-v1", "scheduler-v2", "scheduler"],
  "first_seen_event": "event_id",
  "last_seen_event": "event_id"
}
```

This table is session-bound and ephemeral — never stored in the CER Event Log.

---

**Status:** Active Design
**Priority:** Foundation for all observability tooling
