# Codex Session Next Steps

## Ordered Implementation Queue

1. Preserve audit continuity.
   - Continue writing prompts to `.codex/PROMPTS/`.
   - Continue writing responses to `.codex/RESPONSES/`.
   - Write generated implementation plans to `nexus/graph/IMPLEMENTATION_PLANS/`.

2. Add a narrow implementation plan for semantic projection.
   - Store it in `nexus/graph/IMPLEMENTATION_PLANS/`.
   - Scope it to replacing closure consumption without broad architecture changes.

3. Add `SemanticProjection` and `SemanticProjectionBuilder`.
   - Include fields:
     - `resolved_concepts`
     - `resolves_edges`
   - Initial builder should support `from_envelopes(envelopes)`.
   - Use current `replay_kernel.py` semantics exactly:
     - `added_nodes` adds resolved concepts
     - `removed_nodes` removes resolved concepts
     - `emitted_edges` appends resolve edges

4. Add focused tests for semantic projection.
   - Added node appears in `resolved_concepts`.
   - Removed node is absent from `resolved_concepts`.
   - Emitted edges are preserved in order.
   - Multiple trajectories remain distinguishable if the chosen projection shape is per-trajectory.

5. Refactor `replay_kernel.py`.
   - Stop importing `MaterializedReplayView`.
   - Stop returning `MaterializedReplayView(closures=...)`.
   - Return `SemanticReplayResult` or `SemanticProjection` instead.
   - Preserve transition synthesis/gating only if it is still needed by semantic analysis.

6. Refactor `context_assembler.py`.
   - Replace `latest_view.closures.values()` with semantic projection consumption.
   - Keep current output behavior:
     - populate `WorkingSet.resolved_concepts`
     - populate `WorkingSet.resolves_edges`
   - Do not make it depend on `GraphState`.

7. Remove the stale duplicate `MaterializedReplayView` definition.
   - Keep only the graph-state version:
     - `run_id`
     - `schema_version`
     - `final_graph_state`
   - Verify graph replay tests still pass.

8. Run targeted importer tests.
   - Start with `test_kernel_determinism.py`.
   - Add/run new semantic projection tests.
   - Run import checks around `diff_engine.py`, `replay_kernel.py`, `replay_engine.py`, and `context_assembler.py`.

9. Define graph mutation vocabulary for semantic attribution.
   - Decide whether concept resolution uses existing graph mutation primitives or new semantic mutation wrappers.
   - Include provenance sufficient to reconstruct attribution without re-reading envelopes.

10. Extend kernel lowering.
    - Emit graph mutations for concept nodes and resolve edges.
    - Keep trajectory status mutations.
    - Ensure mutation event hashes remain deterministic.

11. Add `SemanticProjectionBuilder.from_graph_mutations(...)`.
    - Only after mutation events carry enough semantic information.
    - Treat it as exact replay, not inference.

12. Revisit interaction chunking.
    - Define interaction boundary rules.
    - Insert interaction chunks before trajectory detection.
    - Preserve message/turn references as provenance.

13. Revisit `WorkflowIntent`.
    - Define the bridge from semantic IR/projection into CCNF `ExecutionRequest`.
    - Keep CCNF transport distinct from semantic extraction.

14. Update docs.
    - Document the three-layer model:
      - semantic extraction
      - semantic projection / mutation lowering
      - canonical graph replay
    - Explicitly state that closures are not canonical replay state.
