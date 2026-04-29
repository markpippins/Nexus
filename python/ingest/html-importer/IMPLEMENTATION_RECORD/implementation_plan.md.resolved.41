# Implementation Plan: Causal Resolution Context

This plan upgrades the `ConceptMergeEngine` to evaluate deterministic causal context alongside structural overlaps to support meaning-driven conflict resolution scenarios.

## Proposed Changes

### 1. Developer Specification Documentation
- **[NEW] `layer_v_resolution_context_prompt.md`**: Maps out the exact object structure of the causal parameter payload.

### 2. Causal Metadata Objects
- **[MODIFY] `graph_models.py`**:
  - Add `InstructionMetadata`:
    ```python
    @dataclass
    class InstructionMetadata:
        actor_id: str
        timestamp: int
        semantic_tag: Optional[str] = None
        confidence: Optional[float] = None
    ```
  - Bind `metadata` to `InstructionRecord` (since the execution entry encapsulates the instruction in time):
    ```python
    @dataclass
    class InstructionRecord:
        instruction: GraphMutation
        state_hash: str
        metadata: Optional[InstructionMetadata] = None
    ```
  - Add `TimelineMetadata`:
    ```python
    @dataclass
    class TimelineMetadata:
        timeline_id: str
        creator_id: str
        reason: str
    ```
  - Integrate `metadata: Optional[TimelineMetadata] = None` into `Timeline`.

### 3. Strategy Interfacing
- **[MODIFY] `nexus_merge.py`**:
  - Add `ResolutionContext`:
    ```python
    @dataclass
    class ResolutionContext:
        base_state_hash: str
        instruction_a: InstructionRecord
        instruction_b: InstructionRecord
        path_a_metadata: Optional[TimelineMetadata]
        path_b_metadata: Optional[TimelineMetadata]
        lca_index: int
    ```
  - Upgrade the `ResolutionStrategy` interface constraint: `def resolve(self, delta_a, delta_b, conflict_targets, context)` $\rightarrow$ wait, if we are evaluating `LastWriteWins`, it needs discrete conflict mappings over individual instructions or over the holistic arrays. Since `delta_a` and `delta_b` are arrays, the context would be a `List[ResolutionContext]` or an overarching `MergeContext`.
  *(Actually, since conflicts happen instruction vs instruction, the resolution strategy should iterate through the conflicting pairings and evaluate `ResolutionContext` individually for each `Read/Write` collision).*

### 4. Integration Routing
- **[MODIFY] `test_kernel_determinism.py`**:
  - Instantiate parallel actions tagged by differing `actor_id` markers (e.g. `USER` vs `AI`) and build a custom `PrioritizeUserStrategy(ResolutionStrategy)` to computationally verify the engine successfully unpacks runtime metadata logic instead of linear overwrites.

## Open Questions
> [!IMPORTANT]
> How would you prefer `ResolutionContext` to map onto `delta_a` and `delta_b` arrays? Should the `ResolutionStrategy.resolve()` accept the overarching lists `(delta_a, delta_b)` alongside an overarching `TimelineMergeContext`, or should the engine break down the subset of intersecting individual instructions and fire `.resolve(instruction_a, instruction_b, context)` strictly for mathematically colliding pairs?
