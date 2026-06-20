# Harvested Specification & Code Repository

**Source:** `/home/codex/dev/chats/Semantic IR v0.1 Overview.html`

**Chunks processed:** 19  **Failed:** 0

**Total candidates:** 3

---

















## 1. WRP v1.0 — Formal Protocol Specification (Schema + Events + State Machine + API)
**Status:** `Agreed`

### Architectural Intent
WRP is defined as a versioned event-sourced protocol for lifecycle-driven execution of WorkRequestDCO objects across distributed cognitive runtimes. 4 canonical artifacts: (1) WorkRequest Schema — versioned JSON schema, (2) WRP Event Schema — base contract with causation_id/correlation_id + lifecycle events (WRP_INGESTED, WRP_PLANNED, WRP_EXECUTED, WRP_VALIDATED, WRP_CONVERGED), (3) WRP State Machine — 11 states with formal adjacency matrix and invariants (Only VALIDATION→COMPLETED; Only EXECUTION→VALIDATION; CRITIQUE cannot execute; CONVERGED is orthogonal), (4) WRP API — OpenAPI for Spring↔Python bridge. 3-level versioning: Protocol, Event (additive only), WorkRequest. Cross-system consistency: ALL systems must agree on WRPState transitions.

### Requirements & Acceptance Criteria
- [ ] WRP must be a typed event-sourced protocol — not an architecture document
- [ ] WorkRequest Schema must have versioned JSON schema with $id
- [ ] WRP Event Schema must have base contract (event_id, wrp_id, type, timestamp, version, causation_id, correlation_id, payload) plus concrete event types
- [ ] WRP State Machine must be single source of truth with 11 states (CREATED→INTAKE→PLANNING→CRITIQUE→SPECIFICATION→EXECUTION→VALIDATION→COMPLETED/FAILED/BLOCKED/CONVERGED) and formal adjacency matrix
- [ ] WRP API must define 4 endpoints: create WorkRequest, emit event, get state, replay
- [ ] 3-level versioning: Protocol version, Event version (additive only), WorkRequest version
- [ ] Cross-system consistency: Spring emits events, Python kernel executes, DB stores, Nexus visualizes

### Unresolved Follow-Ups
- Should WRP state machine live in losm-ir or a new losm-wrp package?
- What is the exact causation_id computation rule?

---

## 1. WRP Migration Plan — 4-Phase Rollout from Legacy to WRP-Compliant Runtime
**Status:** `Agreed`

### Architectural Intent
Incremental structural replacement with compatibility layers. Phase 1 (Shadow): Introduce WRP package, mirror events only, no behavior change. Phase 2 (Dual-write): Replace transition validation with WRP-aware wrapper, kernel becomes event subscriber. Phase 3 (WRP Primary): Invert control — execution driven by WRP events, kernel becomes reactive. Phase 4 (Legacy Collapse): Remove WorkStatus as driver, replace WorkflowState with projection, shell becomes event router. Final dependency: Spring -> WRP Event API -> Event Store -> WRP Runtime Engine -> Cognitive Kernel -> State Space -> Snapshot Store -> Nexus.

### Requirements & Acceptance Criteria
- [ ] Phase 1: New losm-wrp package with shadow event emitters — NO behavior change
- [ ] Phase 2: Dual-write validation — both legacy and WRP transitions validated, WRP events persist
- [ ] Phase 3: WRP events become the execution driver — kernel becomes reactive subscriber
- [ ] Phase 4: Legacy state machines removed, shell becomes event router only
- [ ] 8-step migration order: (1) Introduce WRP package, (2) Shadow emitters, (3) Persist WRP events in DB, (4) Build replay engine, (5) Switch shell to WRP events, (6) Redirect kernel to event bridge, (7) Deprecate WorkStatus/WorkflowState, (8) Remove legacy transition system

### Unresolved Follow-Ups
- Should the migration happen before or after MEEP bootstrap?
- Does losm-store schema need changes for WRP event persistence?

---

## 1. WRP Future Extensions — DAG, Multi-Tenant, Probabilistic Execution
**Status:** `Proposed`

### Architectural Intent
Three expansions beyond WRP v1.0: (A) Multi-tenant WRP — many kernels sharing event space with tenant isolation, (B) Hierarchical WRP — WorkRequest DAGs as nested runtimes with recursive kernel invocation, (C) Probabilistic WRP — non-deterministic policy execution with sampling. The most natural next step is WRP DAG extension (WorkRequestDAG + nested execution + recursive kernel invocation), transforming from flat pipeline to recursive cognitive system.

### Requirements & Acceptance Criteria
- [ ] WRP DAG: WorkRequest decomposition into sub-workflows, each with own WRP lifecycle
- [ ] Multi-tenant: Shared event space with kernel isolation per tenant
- [ ] Probabilistic: Non-deterministic policy execution with sampling support
- [ ] All extensions must preserve core WRP invariants: determinism, append-only, freeze boundary

### Unresolved Follow-Ups
- Should WRP DAG be planned now or deferred until WRP v1.0 is running?
- Does the current event schema support tenant_id?

---
