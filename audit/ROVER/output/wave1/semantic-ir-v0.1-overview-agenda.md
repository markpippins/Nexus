# Harvested Specification & Code Repository

**Source:** `Semantic IR v0.1 Overview.html` (Bulk Export — State Ontology, LOSM-IR Package, WRP Protocol Spec, Event Migration)
**Rover Pipeline:** BS4 → chunk → architect inference → compiled
**Date:** 2026-06-29
**Spec Count:** 5 Specification Candidates extracted

---

## 1. LOSM-IR Package Architecture v0.1
**Status:** `Agreed`

### Architectural Intent
LOSM-IR (LOSM Intermediate Representation) is the canonical semantic contract layer defining the formal type system for work requests, plans, specs, and execution lifecycle — independent of any storage or execution backend. Pure Pydantic/dataclass module with zero I/O.

### Requirements & Acceptance Criteria
- [ ] **Package**: `losm-ir v0.1.0`, depends only on `pydantic>=2.0`, requires Python >=3.11
- [ ] **14 Python modules**:

| Module | What it defines |
|--------|----------------|
| `work_request.py` | WorkRequestDCO — full model: intent, decomposition (steps+deps), requirements (functional/non-functional/system/tool), constraints (forbidden actions, safety, resource limits), success criteria, execution state, lineage, artifacts, metadata |
| `states.py` | WorkflowState (9 lifecycle phases) + WorkStatus (11 operational pipeline states) + `work_status_to_phase()` projection |
| `transition.py` | VALID_TRANSITIONS table, `validate_transition()` pure function, TransitionError. Feedback loops: VALIDATION→EXECUTION/PLAN_GENERATION, PLAN_REVIEW→PLAN_GENERATION |
| `execution.py` | ExecutionIR — status (pending/running/success/failure), step results, logs, metrics, retry count, failure summary |
| `execution_receipt.py` | ExecutionReceipt — immutable receipt: work_request_id, executor_id, mutations list, result (SUCCESS/FAILED/PARTIAL), lineage parent |
| `executor_registry.py` | ExecutorRegistry — register executors by ID with supported action types and invocation contracts (CLI/HTTP/module) |
| `plan.py` | PlanIR — goal interpretation, constraints, assumptions, ordered execution steps |
| `spec.py` | SpecIR — spec_id, plan_id, intent, steps (command, input/output contracts, execution policy, dependencies), failure policy |
| `validation.py` | ValidationIR — status (success/failure/partial), score, issues, recommendation, logs |
| `critique.py` | CritiqueIR — scores, typed+severity issues, advisory recommendation (APPROVE/REJECT/REVISE), rationale |
| `graph.py` | Simple Graph/Node/Edge dataclasses |
| `trace.py` | TraceOutput, `trace_hash()` (deterministic hash from morphism steps), TraceFamily (set of traces with hash-based equality) |
| `constraints.py` | ConstraintViolation exception with witness data |
| `__init__.py` | Re-exports all public types |

- [ ] Design characteristics: Pure semantic layer — no I/O, no storage, no DB; two-tier state model; feedback loops in state machine; single Pydantic dependency
- [ ] Aligns with plans #009 (Formal WorkRequest Schema) and #010 (Formal Plan Schema)

### Harvested Code Artifacts
#### Purpose: LOSM-IR module catalog & WorkRequestDCO
```
14 modules, single pydantic dependency, pure semantic layer.
WorkRequestDCO: intent + decomposition + requirements + constraints + success criteria + execution state + lineage + artifacts + metadata
```

### Unresolved Follow-Ups
- No tests visible in the package — test directory needed
- Was this code actually generated or was this a design proposal?

---

## 2. Two-Tier State Model — WorkflowState vs WorkStatus v0.1
**Status:** `Agreed`

### Architectural Intent
Two state enums coexist across the LOSM codebase representing the same lifecycle at different abstraction levels. WorkStatus (11 states, operational, DB-backed) projects down to WorkflowState (9 states, IR-level, human-readable). They should be unified with WorkStatus as canonical and WorkflowState as a computed projection.

### Requirements & Acceptance Criteria
- [ ] **WorkflowState** (9 states, `losm_ir/states.py`): NEW, PLAN_DONE, CRITIQUED, SPEC_READY, EXECUTED, VALIDATED, COMPLETE, FAILED, BLOCKED
- [ ] **WorkStatus** (11 states, `losm_store/models.py`): NEW, INTAKE, PLAN_GENERATION, PLAN_REVIEW, PLAN_APPROVAL_GATE, SPEC_GENERATION, EXECUTION, VALIDATION, COMPLETION, BLOCKED, FAILED
- [ ] **Relationship**: many-to-one from WorkStatus to WorkflowState (conceptual compression)
- [ ] **Key divergence**: CRITIQUED exists only in WorkflowState — no WorkStatus counterpart
- [ ] **Style divergence**: WorkflowState uses past-participle (EXECUTED, VALIDATED); WorkStatus uses gerund/noun (EXECUTION, VALIDATION) — cosmetic but indicates independent evolution
- [ ] **Same lifecycle, different abstraction levels**: WorkStatus decomposes planning into 3 sub-steps and entry into 2 sub-steps; WorkflowState treats phases as atomic
- [ ] **Transition table** routes on WorkStatus (would lose fidelity at WorkflowState granularity):
  ```
  NEW → INTAKE, FAILED, BLOCKED
  INTAKE → PLAN_GENERATION, FAILED, BLOCKED
  PLAN_GENERATION → PLAN_REVIEW, FAILED, BLOCKED
  PLAN_REVIEW → PLAN_APPROVAL_GATE, PLAN_GENERATION, FAILED, BLOCKED
  PLAN_APPROVAL_GATE → SPEC_GENERATION, PLAN_GENERATION, FAILED, BLOCKED
  SPEC_GENERATION → EXECUTION, FAILED, BLOCKED
  EXECUTION → VALIDATION, FAILED, BLOCKED
  VALIDATION → COMPLETION, EXECUTION, PLAN_GENERATION, FAILED, BLOCKED
  BLOCKED → all except COMPLETION
  COMPLETION → terminal
  FAILED → terminal
  ```

### Harvested Code Artifacts
#### Purpose: State enum consolidation recommendation
```
WorkStatus stays canonical (DB-backed, transition-routed)
WorkflowState becomes computed projection: work_status_to_phase()

Migration order:
1. Add work_status_to_phase() to losm_ir
2. Move WorkStatus enum to losm_ir
3. Move validate_transition to losm_ir (Plan 0026)
4. Deprecate direct WorkflowState use → prefer work_status_to_phase()
5. Remove WorkflowState or keep as alias for backward compat
```

### Unresolved Follow-Ups
- CRITIQUED reconciliation: is critique a pause point or a review artifact?
- Has this migration been executed (Plan 0026 referenced)?

---

## 3. WRP v1.0 Protocol Specification — Four Canonical Artifacts v0.1
**Status:** `Agreed`

### Architectural Intent
WRP is formally defined as a versioned event-sourced protocol for lifecycle-driven execution of WorkRequestDCO objects across distributed cognitive runtimes. It has 4 canonical artifacts: data contract, event contract, lifecycle contract, and transport contract.

### Requirements & Acceptance Criteria
- [ ] **WRP definition**: A versioned event-sourced protocol for lifecycle-driven execution of WorkRequestDCO objects across distributed cognitive runtimes
- [ ] **Four canonical artifacts**:
  1. **WorkRequest Schema** (data contract) — JSON Schema formalizing WorkRequestDCO with versioning boundaries
  2. **WRP Event Schema** (event contract) — Event types and payload structures
  3. **WRP State Machine** (lifecycle contract) — State transitions and lifecycle rules
  4. **WRP API** (transport contract) — Transport layer for cross-runtime communication
- [ ] **WorkRequest JSON Schema** (wrp/schema/work_request.schema.json):
  ```json
  {
    "$id": "wrp.workrequest.v1",
    "type": "object",
    "required": ["id", "version", "intent", "execution_state"],
    "properties": {
      "id": { "type": "string" },
      "version": { "type": "integer" },
      "intent": {
        "type": "object",
        "properties": {
          "problem_statement": { "type": "string" },
          "desired_outcome": { "type": "string" },
          "domain": { "type": "string" },
          "priority": { "type": "string", "enum": ["low","medium","high","critical"] },
          "abstraction_level": { "type": "string" }
        }
      },
      "execution_state": {
        "type": "object",
        "properties": {
          "status": { "type": "string", "enum": ["pending","decomposed","in_progress","blocked","validating","completed","failed"] }
        }
      }
    }
  }
  ```

### Harvested Code Artifacts
#### Purpose: WRP v1.0 protocol spec structure
```
WRP = versioned event-sourced protocol for lifecycle-driven execution of WorkRequestDCO

4 canonical artifacts:
1. WorkRequest Schema (data contract)  — JSON Schema at wrp/schema/work_request.schema.json
2. WRP Event Schema (event contract)   — event types + payloads
3. WRP State Machine (lifecycle)       — transitions + lifecycle rules
4. WRP API (transport contract)        — cross-runtime transport
```

### Unresolved Follow-Ups
- Does `wrp/schema/work_request.schema.json` exist on disk as a real schema file?
- Are the other 3 schemas (Event, State Machine, API) also defined?

---

## 4. WRP Event-Sourced Migration — 8-Step Plan v0.1
**Status:** `Agreed`

### Architectural Intent
The system has three competing state machines (WorkStatus, WorkflowState, kernel runtime). The migration consolidates them into a single WRPState + event stream, transforming LOSM into a fully event-sourced cognitive runtime governed by a unified lifecycle protocol.

### Requirements & Acceptance Criteria
- [ ] **Before**: ❌ 3 competing state machines — WorkStatus (store) + WorkflowState (IR) + kernel state (runtime)
- [ ] **After**: ✔ WRPState + event stream — one lifecycle authority, one transition system, one runtime protocol
- [ ] **Paradigm shift**: Kernel becomes a projection over event history (not imperative execution)
- [ ] **8-step migration order** (must be exact):
  1. Introduce WRP package (no integration — standalone)
  2. Add shadow event emitters everywhere (fire-and-forget alongside existing logic)
  3. Persist WRP events in DB (events table alongside existing state)
  4. Build replay engine (rebuild state from WRP events)
  5. Switch shell runtime loop to WRP events (runtime reads/writes WRP)
  6. Redirect kernel invocation to event bridge (kernel fires/catches events)
  7. Deprecate WorkStatus / WorkflowState usage (migrate consumers)
  8. Remove legacy transition system (clean up)
- [ ] **After migration**: "a fully event-sourced cognitive runtime governed by a unified lifecycle protocol (WRP)"
- [ ] **Benefits**: deterministic replay, observable reasoning, policy evolution tied to execution, distributed execution correctness, UI-level introspection of cognition
- [ ] **The real significance**: No longer a workflow system/orchestration engine/AI pipeline — it is "a protocolized computational substrate for structured reasoning systems"
- [ ] **Next expansions after WRP v1.0**:
  - A. Multi-tenant WRP (many kernels, shared event space)
  - B. Hierarchical WRP (WorkRequest DAGs as nested runtimes)
  - C. Probabilistic WRP (non-deterministic policy execution + sampling)

### Harvested Code Artifacts
#### Purpose: 8-step event-sourced migration
```
Before: 3 competing state machines (WorkStatus + WorkflowState + kernel runtime)
After:  WRPState + event stream

Migration (exact order):
1. WRP package (standalone)
2. Shadow event emitters
3. Persist events in DB
4. Replay engine
5. Shell runtime → WRP events
6. Kernel → event bridge
7. Deprecate old states
8. Remove legacy transitions
```

### Unresolved Follow-Ups
- Has this migration been started or is it still a plan?
- Does the WRP package from Step 1 exist at all in the codebase?

---

## 5. Three-Axis WRP Expansion Roadmap v0.1
**Status:** `Deferred`

### Architectural Intent
After WRP v1.0 is established, the system expands along three orthogonal axes: multi-tenancy, hierarchy/nesting, and probabilistic execution. These are expansion planes off the WRP v1.0 core, not sequential versions.

### Requirements & Acceptance Criteria
- [ ] **Axis A: Multi-tenant WRP** — Many kernels, shared event space. Tenant isolation at the event stream level rather than the kernel level
- [ ] **Axis B: Hierarchical WRP** — WorkRequest DAGs as nested runtimes. True recursive cognitive system rather than flat pipeline. WorkRequestDAG + nested execution + recursive kernel invocation
- [ ] **Axis C: Probabilistic WRP** — Non-deterministic policy execution + sampling. Stochastic cognition branching
- [ ] **This was identified as "the next real inflection point"** — three meaningful expansions off the WRP protocol foundation
- [ ] **Key line**: "That's where this becomes a true recursive cognitive system rather than a flat pipeline"

### Harvested Code Artifacts
#### Purpose: WRP expansion axes
```
A. Multi-tenant WRP   → many kernels, shared event space
B. Hierarchical WRP    → WorkRequest DAGs as nested runtimes (recursive cognition)
C. Probabilistic WRP   → non-deterministic policy execution + sampling
```

### Unresolved Follow-Ups
- How does this relate to the WRP DAG Planning Guidance document's v1.0→v1.3 staged evolution plan?
- Are these axes meant to be worked in parallel or sequentially?

---

## Summary

| # | Spec | Status | Key Contribution |
|---|------|--------|-----------------|
| 1 | LOSM-IR Package Architecture | Agreed | 14-module Pydantic IR package; WorkRequestDCO; pure semantic layer |
| 2 | Two-Tier State Model — WorkflowState vs WorkStatus | Agreed | 9-state → 11-state projection; WorkStatus canonical; migration plan |
| 3 | WRP v1.0 Protocol Specification — Four Canonical Artifacts | Agreed | Data/Event/Lifecycle/Transport contracts; JSON Schema for WorkRequest |
| 4 | WRP Event-Sourced Migration — 8-Step Plan | Agreed | Consolidate 3 state machines → WRPState + event stream; kernel as event projection |
| 5 | Three-Axis WRP Expansion Roadmap | Deferred | Multi-tenant, Hierarchical (DAG), Probabilistic axes off WRP v1.0 |

---

*Extracted from `chats/Semantic IR v0.1 Overview.html`, 41 chunks processed (Bulk Export). Rover pipeline: BS4 → chunk → architect extraction → compiled.*
