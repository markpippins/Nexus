# Causal Resolution Metadata Installed

Nexus shifted the merge engine from acting as a static rule manager to serving as a Context-Aware Causal Resolution system. The framework isolates topology overlap groups and relays associated identity/intention logic straight to semantic evaluation interfaces. 

### 1. The Context Data Objects
The system attaches timeline-level and instruction-level provenance trackers directly into the structural trace vectors:
```python
@dataclass
class InstructionMetadata:
    actor_id: str
    timestamp: int
    semantic_tag: str = "default"
    confidence: float = 1.0

@dataclass
class TimelineMetadata:
    creator_id: str
    reason: str
```
### 2. The Conflict Clusterer
The engine no longer executes isolated pair-by-pair rejection sequences. `detect_conflict_groups` runs structural intersection tests across the divergent state layers ($Write_A \cap ReadWrite_B$). Sequences that touch localized geometries are assembled logically into `ConflictGroups`. 

The strategy layer (`ResolutionStrategy`) captures `ConflictGroups` mapping alongside contextual metadata parameters representing the lowest-common-ancestor bounds (`ResolutionContext`). Strategies like `CausalPriorityStrategy` decode this context to dictate mathematical supremacy natively—bypassing linear time rules.

### 3. Policy Execution Tests
- `test_causal_priority_strategy()` spins up identical parallel overlaps targeting `"Config"` values, but simulates an Actor tagging distinction (one tagged as originating from `"user"`, the other `"system"` AI output). The system successfully reads the `InstructionMetadata.actor_id` field mapped from the Trace index and functionally favors the user dimension block, discarding linear `LastWriteWins` heuristics automatically.
