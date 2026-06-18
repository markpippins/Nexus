# Codex Session Refactors

| Refactor | Why | Expected Benefit | Dependencies |
|---|---|---|---|
| Replace stale `IR_Diff` references with `IR_EventEnvelope` | `IR_Diff` is referenced but does not exist; current code constructs event envelopes | Restores import/runtime coherence and aligns docs/code with current IR model | Confirm no remaining legitimate `IR_Diff` design is intended |
| Split semantic replay artifact from `MaterializedReplayView` | `MaterializedReplayView` is duplicated and runtime uses the graph-state version | Removes type-name ambiguity between semantic projection and canonical replay | New semantic result/projection type |
| Keep `MaterializedReplayView` graph-state-only | CCNF reference and Rust verifier imply canonical replay is deterministic state plus hash | Preserves clean integrity/replay boundary | Update old consumers to stop expecting `.closures` |
| Add `SemanticProjection` type | `context_assembler.py` only needs `resolved_concepts` and `resolves_edges` | Gives semantic attribution a first-class artifact without coupling it to replay state | Decide location in `graph_models.py` or separate module |
| Add `SemanticProjectionBuilder.from_envelopes(...)` | Current exact projection logic exists inside `EnvelopeInterpreter_V1` | Extracts reusable semantic projection from `IR_EventEnvelope` stream | Stable event ordering rule |
| Rename or retire closure-oriented `ReplayEngine` in `replay_kernel.py` | It is not canonical replay; it is semantic interpretation/projection | Prevents confusion with graph-state `replay_engine.py` | `SemanticProjectionBuilder` and new return type |
| Update `context_assembler.py` to consume semantic projection | It currently depends on `latest_view.closures`, which no longer exists at runtime | Fixes active consumer without weakening `MaterializedReplayView` | Projection storage/passing decision |
| Remove duplicate `MaterializedReplayView` definition | Python overwrites the first definition, leaving dead misleading code | Makes runtime model explicit and easier to maintain | Semantic replacement type available |
| Enrich graph mutations with concept/resolve semantics | Current graph mutations only preserve trajectory status | Enables future projection from mutation history or graph state | Define mutation vocabulary and canonical encoding |
| Introduce interaction chunking before trajectory detection | Desired unit is interaction, not turn, though they overlap | Improves intent and trajectory extraction fidelity | Define chunk boundary heuristics/schema |
| Clarify `WorkflowIntent` layer | Onboarding notes suggest a missing bridge between semantic IR and CCNF transport | Separates conversation meaning from execution request transport | CCNF mapping rules and intent schema |
| Document active vs aspirational workflow state | `.agent` contains desired architecture, but current runtime is partial | Avoids treating aspirational pipeline docs as live control flow | Continue following `AGENTS.md` current-reality rule |

