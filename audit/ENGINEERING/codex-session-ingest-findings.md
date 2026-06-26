# Codex Session Ingest Findings

## Current Ingest Pipeline

- `nexus/python/ingest/html-importer` is the active Python ingest workspace for HTML conversation transcripts.
- The current flow is broadly:
  - HTML transcript parsing
  - normalized message/turn representation
  - graph construction
  - trajectory reconstruction
  - semantic labeling / interaction classification
  - observation, question, and constraint synthesis
  - `IR_EventEnvelope` emission
- The parser boundary is still mostly message/turn oriented. The desired boundary is interaction oriented, where an interaction may span or split turns.
- `IR_EventEnvelope` is the current semantic/internal event artifact. It carries fields such as:
  - `added_nodes`
  - `modified_nodes`
  - `removed_nodes`
  - `emitted_edges`
  - `emitted_observations`
  - `emitted_questions`
  - `emitted_constraints`
  - semantic labels and archetypes
- `python/event-pipeline` exists, but it is an older local JSON/event workflow engine. It is not the current canonical replay model and does not yet represent the desired NATS/distributed pipeline.
- `go/wrp/ccnf-ref` and `rust/wrp/ccnf-verifier` define the strategic canonical direction: deterministic state folding, canonical receipts, replay verification, and hashable state.

## Observed Bottlenecks

- The ingest stack has semantic extraction pieces, but interaction chunking is not yet first-class.
- `IR_Diff` was referenced by docs/code, but the actual model has moved toward `IR_EventEnvelope`.
- `MaterializedReplayView` is defined twice in `graph_models.py`:
  - old semantic shape: `closures`
  - new canonical shape: `final_graph_state`
- Python keeps only the later `MaterializedReplayView(final_graph_state)` definition at runtime.
- `replay_kernel.py` still assumes the old closure-based replay output and tries to instantiate `MaterializedReplayView(closures=...)`.
- `replay_engine.py` uses the newer graph-state replay path:
  - `KernelResultTraceEntry`
  - `GraphMutationEvent`
  - `GraphStateReducer`
  - `GraphState`
  - `MaterializedReplayView(final_graph_state=...)`
- `context_assembler.py` is not merely stale legacy code. It consumes semantic projection data currently not produced by the graph-state path:
  - `closure.resolved_concepts`
  - `closure.resolves_edges`
- Current graph mutation events emitted by `nexus_kernel.py` mostly encode trajectory status changes, not concept resolution or semantic resolve edges.

## Proposed Architecture

The system should be treated as layered, not as competing replay implementations.

```text
HTML transcript
  -> interaction chunks
  -> trajectories
  -> semantic event envelopes
  -> semantic projection
  -> graph mutation events
  -> canonical graph state
  -> hash / receipt / verification
```

Layer responsibilities:

- Semantic extraction layer:
  - parses transcript meaning
  - identifies interactions, intent, trajectories, constraints, observations, questions
  - emits `IR_EventEnvelope`
- Semantic projection layer:
  - derives concept-level resolution attribution
  - currently equivalent to the useful part of `ReconstructedClosureSet`
  - should expose `resolved_concepts` and `resolves_edges`
- Mutation lowering layer:
  - translates semantic events/projections into `GraphMutationEvent`
  - should eventually emit concept and resolution mutations, not only trajectory status
- Canonical replay layer:
  - folds mutation events into `GraphState`
  - computes deterministic hashes
  - aligns with CCNF reference/verifier expectations

## Decisions Made

- `MaterializedReplayView` should remain the canonical graph-state replay view.
- `MaterializedReplayView` should not carry closures.
- The closure-based output should be renamed or replaced by a semantic artifact such as `SemanticReplayResult`, `SemanticProjection`, or `ClosureAnalysisView`.
- `replay_kernel.py` should stop returning `MaterializedReplayView`.
- `context_assembler.py` should consume a semantic projection, not canonical replay state.
- `ReconstructedClosureSet` is not garbage. It is evidence of a still-needed semantic projection layer.
- Exact semantic projection from `IR_EventEnvelope` is feasible now.
- Exact semantic projection from current `GraphMutationEvent` is not feasible yet because mutation events do not preserve concept-resolution information.
- The immediate safe implementation is `SemanticProjectionBuilder.from_envelopes(...)`.
- A later implementation can add `SemanticProjectionBuilder.from_graph_mutations(...)` only after graph mutations carry concept/resolve semantics.

## Unresolved Questions

- What is the exact interaction-chunk model and boundary rule?
- Should semantic projection be stored per trajectory, per conversation, per workspace, or all three?
- Should `ReconstructedClosureSet` be renamed and narrowed, or should a new `SemanticProjection` type replace it?
- Should `context_assembler.py` consume projections stored on `ConversationGraph`, or should projections be passed in explicitly?
- What graph mutation vocabulary should represent concept resolution?
- Should concept-resolution graph mutations use existing primitives (`CreateNode`, `DeleteNode`, `AddEdge`, `RemoveEdge`) or new typed semantic mutations?
- How should semantic projection hashes relate to canonical graph-state hashes, if at all?
- Where should the eventual `WorkflowIntent` layer sit between semantic IR and CCNF `ExecutionRequest`?

