# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/WRP DAG Planning Guidance.html
**Model:** DeepSeek V4
**Total candidates:** 3
---
## 1. WRP v1.1 — Tenant-Isolated DAG IR with Inert Recursion Hooks
**Status:** `Specified`

### Architectural Intent
Extend WRP v1.0 with three non-breaking additions: Tenant-Aware Event Envelope (tenant_id immutable, mandatory isolation boundary, trace_id lineage), WorkRequest DAG structure (WorkRequestNode + WorkRequestDAG with parent_request_id edges), and Probabilistic Policy Model (ExecutionPolicy declared but not executed — inert in v1.0, activated in v1.2+). Key constraints: no cross-tenant event sharing, DAG is not executed directly (compiled representation only), policies stored but ignored by Kernel v1.0. This introduces identity, structure, and execution separation simultaneously without breaking determinism.

### Requirements & Acceptance Criteria
- [ ] EventEnvelope: tenant_id (immutable, mandatory), trace_id (tenant-scoped lineage root), kernel_id (execution context)
- [ ] WorkRequest v1.1: parent_request_id (DAG hook), policy (declarative only, not executed)
- [ ] WorkRequestNode: request + children + state + depth — tree of nodes
- [ ] WorkRequestDAG: root + nodes + edges + tenant_id + trace_id — compiled representation
- [ ] Tenant isolation rules: every event carries tenant_id, Kernel scoped per tenant, DAGs cannot cross tenant boundaries, Replay filters by tenant

### Harvested Code Artifacts
#### Purpose: EventEnvelope v1.1 with tenant isolation
```python
@dataclass(frozen=True)
class EventEnvelope:
    event_id: str
    timestamp: str
    tenant_id: str  # NEW: mandatory isolation boundary
    trace_id: str    # execution lineage
    kernel_id: str   # execution context
    event_type: str
    payload: dict
```

### Unresolved Follow-Ups
- How are shared kernels across tenants handled — via explicit bridge nodes or prohibited entirely?
- What is the max depth constraint for DAG to prevent accidental recursive explosion?

---

## 2. WRP v1.1 Compilation Pass — 6-Pass Deterministic Pipeline
**Status:** `Specified`

### Architectural Intent
Define a multi-pass deterministic compiler pipeline: Pass 1 (Normalize) ensures structural consistency and injects missing trace_ids. Pass 2 (Tenant Binding) guarantees single-tenant coherence — mixed tenants fail compilation. Pass 3 (DAG Construction) builds explicit graph from parent_request_id edges — must be forest or single rooted tree. Pass 4 (Structural Validation) detects cycles (illegal), validates no orphan nodes, enforces depth constraints. Pass 5 (Execution Compatibility) verifies every node still executable as Kernel.execute(WorkRequest). Pass 6 (Policy Annotation) attaches metadata only — no execution decisions. Compiler invariants: determinism, tenant isolation, kernel compatibility, no semantic drift, pure function.

### Requirements & Acceptance Criteria
- [ ] Pass 1 Normalize: ensure required fields, inject missing trace_id, normalize optional fields
- [ ] Pass 2 Tenant Binding: ALL requests must share same tenant_id — mixed tenants fail
- [ ] Pass 3 DAG Construction: index by request_id, root nodes where parent_request_id is None
- [ ] Pass 4 Structural Validation: cycle detection via DFS, orphan validation, depth constraint
- [ ] Pass 5 Execution Compatibility: every node must still be executable as Kernel.execute(WorkRequest)
- [ ] Pass 6 Policy Annotation: strategy tags, weights, seeds — NO execution decisions, branching, or sampling

### Unresolved Follow-Ups
- What is the formal cycle detection algorithm — DFS with visited set or Tarjan's SCC?
- How are multiple roots handled in batch DAG mode?

---

## 3. WRP v1.2 — Execution Traversal Engine with Hierarchical Receipts
**Status:** `Specified`

### Architectural Intent
Define the Traversal Engine that interprets WorkRequestDAG and executes nodes via Kernel safely. ExecutionContext binds tenant_id, trace_id, strategy (DFS/BFS/Topological), kernel, and mode (deterministic/experimental). ExecutionCursor replaces stack frames for traceable recursion. Hierarchical ExecutionReceipt replaces flat log — returns tree of receipts. Recursive Boundary Rule: nodes MAY emit child WorkRequests but they are NOT auto-executed — they enter a Pending Execution Queue. Probabilistic policies IGNORED unless mode='experimental'. System invariants: replayability, isolation, kernel purity, trace integrity.

### Requirements & Acceptance Criteria
- [ ] ExecutionContext: immutable during traversal — tenant_id, trace_id, strategy, kernel, mode
- [ ] Traversal strategies: DFS (default, preserves causal locality), BFS (parallelizable), Topological (strict DAG order)
- [ ] Hierarchical ExecutionReceipt: node_id, tenant_id, trace_id, result, children[], status — tree, not flat log
- [ ] Recursive Boundary Rule: child WorkRequests enter PendingExecutionQueue — NOT auto-executed
- [ ] Probabilistic policies only active in experimental mode — deterministic mode ignores them

### Unresolved Follow-Ups
- When does the Pending Execution Queue drain — after current node completes, after current level, or manually?
- What is the formal state machine for ExecutionCursor — does it support pause/resume/checkpoint?

---
