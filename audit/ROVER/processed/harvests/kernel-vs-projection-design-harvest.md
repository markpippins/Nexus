# Harvested Specification & Code Repository

**Source:** `/home/codex/dev/nexus/audit/ROVER/processed/chats/kernel-vs-projection-design.html`
**Rover Pipeline:** BS4 HTML → chunk → agent inference → compiled
**Inference Engine:** Architect (human-in-the-loop)
**Date:** 2026-06-27
**Spec Count:** 4 Specification Candidates extracted

---

## 1. Two-Layer WRP Reduce Architecture: Kernel + Projection
**Status:** `Agreed`

### Architectural Intent
Define a two-layer architecture for the WRP Reduce function. Layer 1 (Kernel Reduce) is a strict, generic, all-or-nothing state machine that takes KernelState + LOSMIR and produces new KernelState with 4 explicit phases. Layer 2 (Projection Builder) is a derived, disposable view builder that extracts one plan from KernelState and applies stratification, chunking, and cross-reference filtering with convergence semantics. This resolves the tension between spec strictness and existing pragmatic convergence behavior.

### Requirements & Acceptance Criteria
- [ ] Kernel Reduce MUST be a pure function: no IO, no randomness, no global state
- [ ] 4 explicit phases: Receipt Materialization, Plan State Construction, Transition Application, Graph Index Update
- [ ] All-or-nothing semantics: if any phase raises, KernelState is unchanged
- [ ] Projection Builder MUST be disposable and recomputable from KernelState at any time
- [ ] Projection Builder MAY use convergence semantics (skip invalid transitions)
- [ ] Projection Builder MUST support stratification (L1-L4), chunk building, and cross-reference filtering
- [ ] Existing WRPProjectionBuilder code MUST be refactored to call KernelReduce internally

### Harvested Code Artifacts
#### Purpose: Kernel Reduce function signature and type definition
```python
@dataclass
class KernelState:
    plans: dict[str, PlanState]        # Map<PlanId, PlanState>
    receipts: dict[str, ReceiptState]   # Map<ReceiptId, ReceiptState>
    transitions: list[TransitionLog]    # TransitionLog[]
    references: GraphIndex              # Cross-plan reference graph
    version: int                        # Monotonic version counter

def reduce(state: KernelState, ir: list[ConduitReceipt]) -> KernelState:
    """Pure, deterministic, all-or-nothing kernel state transition."""
    # Phase 1: Receipt Materialization (insert-only)
    # Phase 2: Plan State Construction (fold over receipts)
    # Phase 3: Transition Application (adjacency matrix)
    # Phase 4: Graph Index Update (edge-insert only)
    return new_state
```

### Unresolved Follow-Ups
- Should KernelState be in-memory only or persisted to SQLite?
- How does the kernel handle concurrent Reduce() calls?
- What is the error return type: exception or Result<State, Error>?

---

## 2. WRP KernelState Type with Cross-Plan State Management
**Status:** `Agreed`

### Architectural Intent
Define the canonical KernelState type that holds all plans, receipts, transitions, and cross-references in one composite state structure. Enables cross-plan conflict detection, GraphIndex construction, and temporal queries across the entire plan corpus. Each Reduce invocation affects one plan within the multi-plan store (event sourcing pattern).

### Requirements & Acceptance Criteria
- [ ] KernelState MUST hold Map<PlanId, PlanState> for multi-plan awareness
- [ ] KernelState MUST hold Map<ReceiptId, ReceiptState> for receipt indexing
- [ ] KernelState MUST hold TransitionLog[] for full audit trail
- [ ] KernelState MUST hold GraphIndex for cross-plan reference resolution
- [ ] KernelState MUST track version number, incrementing on state-modifying IR only
- [ ] No-op IR (no state change) MUST NOT increment version
- [ ] PlanState MUST be derivable from receipts for that plan: PlanState = Fold(Receipts[planId])

### Unresolved Follow-Ups
- Should PlanState be eagerly computed or lazily derived on access?
- Version collision strategy when two Reduce calls target different plans?

---

## 3. GraphIndex: Cross-Plan Reference Graph with Adjacency List
**Status:** `Proposed`

### Architectural Intent
Implement the GraphIndex as a simple adjacency list that maps entity IDs to their outgoing cross-references. Built during Phase 4 of Reduce by scanning plan dependencies, receipts, and explicit cross-ref data. Uses the existing crossref_taxonomy (14 types: wrp:depends_on, wrp:supersedes, ag:references_plan, kv:sourced_from, etc.) as the edge type vocabulary.

### Requirements & Acceptance Criteria
- [ ] GraphIndex MUST be Map<entityId, List<CrossRefEdge>> — adjacency list format
- [ ] CrossRefEdge MUST have: relType (from taxonomy), targetId, metadata dict
- [ ] Phase 4 MUST scan dependencies, files_affected, and promptRef for cross-refs
- [ ] GraphIndex MUST support the GraphSelector traversal from the Temporal Query Model (Spec 6)
- [ ] Built incrementally — each Reduce() invocation adds/updates edges for the affected plan

### Harvested Code Artifacts
#### Purpose: GraphIndex type definition with adjacency list
```python
type CrossRefEdge = {
    relType: str;       # From crossref_taxonomy (e.g., wrp:depends_on)
    targetId: str;      # Target entity ID (plan number, system name, etc.)
    metadata: dict;     # Optional metadata (e.g., {dependencyType: explicit})
};

type GraphIndex = dict[str, list[CrossRefEdge]];  # sourceId -> outgoing edges
```

### Unresolved Follow-Ups
- Does the GraphSelector depth parameter require k-hop expansion or just direct edges?
- Should GraphIndex also store incoming edges for reverse traversal?

---

## 4. 4-Phase Reduce Decomposition with All-or-Nothing Semantics
**Status:** `Agreed`

### Architectural Intent
Decompose the existing monolithic single-fold reduce into 4 explicit, testable phases: Receipt Materialization (insert receipts into kernel store), Plan State Construction (fold receipts per plan into PlanState), Transition Application (validate and apply transitions via adjacency matrix), and Graph Index Update (scan and build cross-plan references). All-or-nothing: if any phase fails, the entire snapshot is rejected and KernelState is unchanged.

### Requirements & Acceptance Criteria
- [ ] Phase 1 (Receipt Materialization): Insert LOSMIR receipts into KernelState.receipts — must be insert-only, no overwrites
- [ ] Phase 2 (Plan State Construction): Fold over receipts per planId to produce/update PlanState for each affected plan
- [ ] Phase 3 (Transition Application): Validate each transition against adjacency matrix; reject invalid transitions with all-or-nothing
- [ ] Phase 4 (Graph Index Update): Scan dependencies, files, and references; update GraphIndex adjacency edges
- [ ] If Phase 3 finds ANY invalid transition, the entire snapshot is rejected (all-or-nothing)
- [ ] Each phase MUST be independently testable with pure function inputs/outputs

### Unresolved Follow-Ups
- Should Phase 2 eagerly compute all plan states or only plans mentioned in this IR snapshot?
- What is the exact error type for phase failure?

---
