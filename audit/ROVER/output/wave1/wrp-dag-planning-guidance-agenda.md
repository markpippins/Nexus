# Harvested Specification & Code Repository

**Source:** `WRP DAG Planning Guidance.html` (Bulk Export — WRP v1.1 IR delta, DAG, tenancy)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 4 Specification Candidates extracted

---

## 1. WRP v1.1 IR Delta — DAG, Tenancy, and Policy Hooks v0.1
**Status:** `Agreed`

### Architectural Intent
A non-breaking extension to WRP v1.0 that adds structure (DAG, tenancy, policy hooks) without changing execution semantics. WRP v1.1 formalizes what v1.0 already implied and introduces recursion as a declared capability, not runtime behavior. The system stops being a pipeline and becomes a **tenant-isolated, replayable, declarative cognitive graph system with inert recursion hooks**.

### Requirements & Acceptance Criteria
- [ ] **Design Principle**: WRP v1.1 does NOT change execution semantics. It only adds structure, formalizes what v1.0 implied, and introduces recursion as declared capability
- [ ] **WRP v1.0** (unchanged): `WorkRequest → Kernel → Receipt` (linear list of nodes)
- [ ] **WRP v1.1**: `WorkRequest → WorkRequestNode → WorkRequestDAG` with Kernel remaining unchanged
- [ ] **Core Addition: Tenant-Aware Event Envelope**:
  ```python
  @dataclass(frozen=True)
  class EventEnvelope:
      event_id: str; timestamp: str
      tenant_id: str      # NEW: mandatory isolation boundary
      trace_id: str       # execution lineage
      kernel_id: str      # execution context
      event_type: str; payload: dict
  ```
  Invariants: tenant_id immutable; events MUST NOT be shared across tenants; trace_id is tenant-scoped unique lineage root
- [ ] **WorkRequest v1.1** (minimal extension):
  ```python
  @dataclass
  class WorkRequest:
      request_id: str; tenant_id: str; trace_id: str
      intent: dict; context: dict    # unchanged
      parent_request_id: Optional[str] = None  # NEW: DAG hook
      policy: Optional[dict] = None            # NEW: probabilistic hook (inactive)
  ```
- [ ] **New IR Object: WorkRequestNode** — DAG Abstraction:
  ```python
  @dataclass
  class WorkRequestNode:
      request: WorkRequest
      children: list["WorkRequestNode"]
      state: str    # DRAFT / APPROVED / EXECUTED
      depth: int
  ```
- [ ] **New IR Object: WorkRequestDAG** — Graph Layer:
  ```python
  @dataclass
  class WorkRequestDAG:
      root: WorkRequestNode
      nodes: dict[str, WorkRequestNode]
      edges: list[tuple[str, str]]  # parent_id -> child_id
      tenant_id: str; trace_id: str
  ```
  This is NOT executed directly — it is a **compiled representation**, analogous to AST before evaluation
- [ ] **Shadow Execution Rule**: Kernel executes a WorkRequestNode → Receipt → optionally emits child WorkRequests (NOT auto-executed yet). Recursion is declared, recorded, but not activated
- [ ] **System Evolution**:
  - v1.0: WorkRequest → Kernel → Receipt (linear)
  - v1.1: WorkRequest → WorkRequestNode → WorkRequestDAG (compiled DAG)
  - v1.2: WorkRequestDAG → traversal engine → recursive kernel execution
- [ ] **Final form**: "A tenant-isolated, replayable, declarative cognitive graph system with inert recursion hooks"

### Harvested Code Artifacts
#### Purpose: WRP evolution map
```
v1.0:  WorkRequest → Kernel → Receipt                       (linear execution)
v1.1:  WorkRequest → WorkRequestNode → WorkRequestDAG        (compiled DAG, inert)
v1.2:  WorkRequestDAG → traversal engine → recursive exec    (active traversal)
v1.3:  DAG traversal → stochastic policy-driven paths        (probabilistic)
```

#### Purpose: Tenant-aware EventEnvelope
```python
@dataclass(frozen=True)
class EventEnvelope:
    event_id: str
    timestamp: str
    tenant_id: str       # mandatory isolation boundary
    trace_id: str        # execution lineage
    kernel_id: str       # execution context
    event_type: str
    payload: dict
```

#### Purpose: WorkRequestDAG
```python
@dataclass
class WorkRequestDAG:
    root: WorkRequestNode
    nodes: dict[str, WorkRequestNode]
    edges: list[tuple[str, str]]
    tenant_id: str
    trace_id: str
```

### Unresolved Follow-Ups
- The "WRP Compilation Pass Spec" was proposed as the next artifact — does this exist yet?
- How does the DAG structure interact with the conduit-mcp plan lifecycle?

---

## 2. WRP Multi-Tenant Isolation Model v0.1
**Status:** `Agreed`

### Architectural Intent
Every event, work request, and DAG carries a `tenant_id` that enforces strict isolation boundaries. Kernel instances are scoped to tenants, DAGs cannot cross tenant boundaries, and replay must filter by tenant. This enables "same system, multiple isolated universes."

### Requirements & Acceptance Criteria
- [ ] **Hard rules**:
  - Every event must carry `tenant_id`
  - Kernel instances are scoped: `Kernel[tenant_id]`
  - DAGs cannot cross tenant boundaries
  - Replay MUST filter by tenant
- [ ] **Optional future**: shared kernels across tenants only via explicit bridge nodes
- [ ] **Tenant isolation invariants**:
  - I1 Replayability: Same DAG + same strategy → same receipts
  - I2 Isolation: No cross-tenant execution possible
  - I3 Kernel purity: Kernel remains unaware of DAG structure
  - I4 Trace integrity: Every receipt maps to node_id + trace_id + tenant_id
- [ ] **Effect**: "same system, multiple isolated universes"
- [ ] The tenant model is the first hard boundary in the system — identity separation before structural or execution changes

### Harvested Code Artifacts
#### Purpose: Tenant isolation rules
```
Hard rules:
  - Every event must carry tenant_id
  - Kernel[tenant_id] — scoped instances
  - DAGs cannot cross tenant boundaries
  - Replay MUST filter by tenant

Invariants:
  I1: Same DAG + same strategy → same receipts
  I2: No cross-tenant execution possible
  I3: Kernel remains unaware of DAG structure
  I4: Every receipt maps to node_id + trace_id + tenant_id
```

### Unresolved Follow-Ups
- How does tenant_id map to the actual system — is it a deployment tenant or a logical namespace?
- What is the tenant provisioning lifecycle?

---

## 3. Probabilistic Execution Policy Model v0.1
**Status:** `Deferred`

### Architectural Intent
A deferred policy model for probabilistic execution that is defined now but not activated until WRP v1.2+. The policy is stored in the WorkRequest but ignored by Kernel v1.0 and v1.1.

### Requirements & Acceptance Criteria
- [ ] **ExecutionPolicy schema**:
  ```python
  @dataclass
  class ExecutionPolicy:
      strategy: str  # "deterministic", "sampled", "weighted"
      weights: Optional[dict[str, float]] = None
      seed: Optional[int] = None
  ```
- [ ] **Key constraint**: Policies are stored in WorkRequest, ignored by Kernel v1.0, activated only in v1.2+
- [ ] **Separation of concerns**: Identity separation (tenant_id) → Structure separation (DAG) → Execution separation (probabilistic policy) — in exactly that order
- [ ] If inverted: probability contaminates determinism, DAG becomes non-replayable, tenants lose isolation guarantees
- [ ] **Future v1.2 unlocks**: DAG becomes an execution landscape; traversal engine is the "agent walking the landscape"; kernel is just a "local evaluator"

### Harvested Code Artifacts
#### Purpose: ExecutionPolicy schema
```python
@dataclass
class ExecutionPolicy:
    strategy: str  # "deterministic", "sampled", "weighted"
    weights: Optional[dict[str, float]] = None
    seed: Optional[int] = None
```

### Unresolved Follow-Ups
- What is the WRP Compilation Pass that bridges between v1.1 and v1.2?
- Cycle detection for future recursion safety?

---

## 4. Staged WRP Evolution Plan (v1.0 → v1.3) v0.1
**Status:** `Agreed`

### Architectural Intent
A clearly staged evolution path from linear execution to probabilistic multi-tenant cognitive graph system. Each stage is backward-compatible and preserves the invariants of previous stages.

### Requirements & Acceptance Criteria
- [ ] **WRP v1.0** (current): Linear execution kernel. WorkRequest → Kernel → Receipt
- [ ] **WRP v1.1** (this delta): Compiled DAG representation. Adds WorkRequestNode, WorkRequestDAG, tenant-aware EventEnvelope, inert recursion hooks. Non-breaking — v1.0 semantics unchanged
- [ ] **WRP v1.2** (next): Traversal-based execution engine. WorkRequestDAG → traversal engine → recursive kernel execution. DAG becomes an execution landscape, traversal engine is the "agent walking the landscape", kernel is just a "local evaluator"
- [ ] **WRP v1.3** (future fork): Either probabilistic execution (stochastic policy-driven DAG traversal, cognition branching) or multi-tenant runtime isolation (concurrent DAGs, shared infra, isolated cognition graphs)
- [ ] **After v1.2 unlocks**: True recursion (nodes spawning executable subgraphs), controlled probabilistic cognition (sampling execution paths), multi-tenant cognitive isolation (parallel independent DAG universes)
- [ ] **Key insight**: Recursion is built as a **controlled runtime phenomenon, not a structural accident**
- [ ] **Architectural separation order** (non-negotiable): Identity (tenant_id) → Structure (DAG) → Execution (probabilistic)

### Harvested Code Artifacts
#### Purpose: Complete staged evolution
```
v1.0  linear execution kernel
        WorkRequest → Kernel → Receipt

v1.1  compiled DAG representation
        WorkRequest → WorkRequestNode → WorkRequestDAG
        Kernel remains unchanged
        Recursion declared but inert

v1.2  traversal-based execution engine
        WorkRequestDAG → traversal engine → recursive kernel exec
        DAG = execution landscape; traversal = agent; kernel = local evaluator

v1.3  probabilistic execution OR multi-tenant runtime isolation
        Stochastic policy-driven path sampling
        OR concurrent isolated DAGs on shared infra
```

### Unresolved Follow-Ups
- Is there a concrete implementation plan / roadmap for the v1.0 → v1.1 → v1.2 transitions?
- What is the "WRP Compilation Pass Spec" that bridges IR design to executable system?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | WRP v1.1 IR Delta — DAG, Tenancy, Policy | Agreed | EventEnvelope, WorkRequestNode, WorkRequestDAG; inert recursion; compiled representation |
| 2 | WRP Multi-Tenant Isolation Model | Agreed | Kernel[tenant_id], no cross-tenant DAGs, I1–I4 invariants |
| 3 | Probabilistic Execution Policy Model | Deferred | ExecutionPolicy schema; deferred to v1.2+; correct separation order |
| 4 | Staged WRP Evolution Plan (v1.0→v1.3) | Agreed | Linear → compiled DAG → traversal → probabilistic; backward-compatible stages |

---

*Extracted from `chats/WRP DAG Planning Guidance.html`, 21 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
