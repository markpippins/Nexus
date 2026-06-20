# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Semantic IR v0.1 Overview.html
**Model:** DeepSeek V4
**Total candidates:** 4
---
## 1. LOSM-IR v0.1.0 — Formal Type System for Work Requests, Plans, Specs, and Lifecycle
**Status:** `Implemented`

### Architectural Intent
LOSM-IR is the formal type system for work requests, plans, specs, and lifecycle using Pydantic >= 2.0. It comprises 14 Python modules with WorkRequestDCO, states.py, transition.py, and execution.py as key components. The state model has WorkStatus (11 states, DB-backed, operational) and WorkflowState (9 states, IR-level, human-readable). Recommendation: merge by making WorkStatus the canonical enum and introduce work_status_to_phase() as a calculated projection — eliminating dual-state confusion.

### Requirements & Acceptance Criteria
- [ ] 14 Python modules defining the formal type system
- [ ] WorkRequestDCO: canonical data transfer object for work requests
- [ ] WorkStatus (11 states, DB-backed) must be the canonical state enum
- [ ] WorkflowState (9 states, IR-level) must become a calculated projection from WorkStatus
- [ ] work_status_to_phase() function maps operational state to human-readable phase

### Unresolved Follow-Ups
- Are all 14 modules implemented, or are some still in design phase?
- How does the calculated projection (work_status_to_phase) handle states that don't map cleanly?

---

## 2. WRP — Versioned Event-Sourced Protocol for Lifecycle-Driven WorkRequest Execution
**Status:** `Specified`

### Architectural Intent
WRP (Work Request Protocol) is a versioned event-sourced protocol for lifecycle-driven execution of WorkRequestDCO objects across distributed cognitive runtimes. It specifies: WorkRequest Schema (formalized versioning boundaries for WorkRequestDCO), WRP Event Schema (strict event typing with causal and correlation IDs), WRP State Machine (adjacency-matrix-based specification for state transitions), and WRP API Contract (OpenAPI structure for Spring/Python communication). WRP is the protocol that governs how work requests flow through the distributed system.

### Requirements & Acceptance Criteria
- [ ] WorkRequest Schema: formal versioning boundaries for WorkRequestDCO
- [ ] WRP Event Schema: strict event typing with causal and correlation IDs
- [ ] WRP State Machine: adjacency-matrix-based state transition specification
- [ ] WRP API Contract: OpenAPI structure for cross-runtime communication (Spring ↔ Python)
- [ ] Protocol must be versioned — schema evolution without breaking existing deployments

### Unresolved Follow-Ups
- What is the version negotiation protocol when different runtimes use different WRP versions?
- How are adjacency matrix violations detected and handled at runtime?

---

## 3. Four-Phase WRP Migration Plan — Shadow → Dual-Write → Primary → Legacy Collapse
**Status:** `Proposed`

### Architectural Intent
Define a four-phase migration strategy for transitioning the existing codebase to WRP-compliant runtime without disruption. Phase 1 (Shadow WRP): introduce WRP structure alongside existing system, mirror events. Phase 2 (Dual-write): connect WRP to real execution with shadow hooks — both systems process events. Phase 3 (Primary Runtime): shift to event-driven execution where the kernel becomes reactive, WRP is authoritative. Phase 4 (Legacy Collapse): remove redundant components, replace legacy states with WRP equivalents.

### Requirements & Acceptance Criteria
- [ ] Phase 1: Shadow WRP — introduce structure, mirror events, no behavior change
- [ ] Phase 2: Dual-write — WRP connected to real execution, shadow hooks verify correctness
- [ ] Phase 3: Primary Runtime — WRP becomes authoritative, kernel becomes event-reactive
- [ ] Phase 4: Legacy Collapse — remove redundant components, replace legacy states
- [ ] Each phase must be independently deployable and rollbackable

### Unresolved Follow-Ups
- What are the gating criteria for advancing from one phase to the next?
- How long should the dual-write phase run before cutover — measured in time or event volume?

---

## 4. Unified System Architecture — Event-Sourced Cognitive Runtime Governed by WRP
**Status:** `Agreed`

### Architectural Intent
The final system architecture: an event-sourced cognitive runtime governed by the WRP protocol, characterized by deterministic replay and observable reasoning. The system is defined as a pipeline of interpretation → structure → execution → observation → identity. LOSM-IR provides the type system, WRP provides the protocol, and the runtime executes WorkRequestDCO objects through state machines defined by adjacency matrices. All state is derived from the event log — the event log is truth.

### Requirements & Acceptance Criteria
- [ ] Event log is the single source of truth — all state is derived
- [ ] Deterministic replay: same event log → same state reconstruction
- [ ] Observable reasoning: every state transition must be traceable to its triggering event
- [ ] WRP governs lifecycle — no state transition outside the adjacency matrix
- [ ] Cross-runtime communication via WRP API Contract

### Unresolved Follow-Ups
- How does the system handle events that arrive out of causal order?
- What is the snapshot strategy for efficient replay of long event histories?

---
