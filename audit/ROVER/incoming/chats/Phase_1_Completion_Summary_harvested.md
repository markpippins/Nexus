# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Phase 1 Completion Summary.html
**Model:** DeepSeek V4
**Total candidates:** 8
---
## 1. Phase 1 MEEP Vertical Slice — Verified Deterministic Prompt-to-Replay Pipeline
**Status:** `Completed`

### Architectural Intent
Phase 1 delivers a functionally complete, verified deterministic vertical slice: Prompt → IRL → IR → Spec Compiler → Lowering/Freeze → Scheduled Execution → CER Append → Replay. All 140 tests pass with deterministic replay verified. System executes in sub-50ms with zero external dependencies. All implementation plans in REVIEW_PASS status. This is the proven execution loop that Phase 2-5 builds upon — the 'seed' from which the full runtime grows.

### Requirements & Acceptance Criteria
- [ ] Full prompt-to-replay loop must execute end-to-end
- [ ] All 140 tests must pass including deterministic replay
- [ ] Sub-50ms execution with zero external dependencies
- [ ] CER must be authoritative append-only event log
- [ ] All Phase 1 implementation plans must be in REVIEW_PASS

---

## 2. Phase 1.5 — AST Preprocessor: Normalize Inputs into Typed Front-End Artifacts
**Status:** `Proposed`

### Architectural Intent
Introduce a front-end normalization layer that classifies raw input into explicit structural forms before compilation. Raw prompts, control directives, and planning commands are classified into typed InputKind (EXECUTION_REQUEST, PLAN_REQUEST, CONTROL_DIRECTIVE, QUERY, REJECT) and emitted as ParsedInputEnvelope with normalized input, front-end AST, and routing decisions. This completes the left edge of the pipeline — without it, compiler hardening risks hardening a moving target. 4 sub-plans: artifact contract, preprocessor core, routing and reject semantics, fixture corpus.

### Requirements & Acceptance Criteria
- [ ] Raw inputs must be classified into typed front-end categories (InputKind enum)
- [ ] ParsedInputEnvelope must include: envelope_id, raw_input, normalized_input, source_metadata, input_kind, front_end_ast, routing_decision
- [ ] Envelope must be immutable once emitted
- [ ] Compiler must consume envelope/AST, not raw prompt text
- [ ] Control directives must be explicit AST forms, not magic strings checked later
- [ ] Preprocessor output must be deterministic for equivalent normalized input

---

## 3. Phase 2 — Compiler Hardening: Rigid, Validated, Deterministic Compiler Contract
**Status:** `Proposed`

### Architectural Intent
Transform the current working compiler path into a trustworthy semantic boundary. Define canonical ExecutionGraph contract (graph id, node/edge ids, handler bindings, dependency relations, input/output descriptors, provenance, freeze marker). Add compiler validation pass (unresolved references, illegal node kinds, invalid topology, missing bindings). Add lowering validation with freeze enforcement — all accepted lowered graphs must be frozen. Add canonicalization for stable identity. Add golden artifact suite for compiler conformance. 6 sub-plans from ExecutionGraph contract through compile-time reject semantics.

### Requirements & Acceptance Criteria
- [ ] ExecutionGraph must be canonical first-class contract with stable identity rules
- [ ] Compiler validation must reject: unresolved references, illegal nodes, illegal edges, missing bindings, unsupported dependencies, malformed artifacts
- [ ] Lowering must guarantee freeze on every accepted output — no bypass path
- [ ] Canonicalization: equivalent semantic inputs → equivalent compiled artifacts
- [ ] Golden artifact suite: snapshot ParsedInputEnvelope → semantic IR → compiled graph → lowered graph → frozen ExecutionGraph for representative inputs

---

## 4. Phase 3 — Execution Kernel: Lifecycle, Receipts, Readiness, and CER Authority
**Status:** `Proposed`

### Architectural Intent
Replace the loosely coupled 'scheduler + handlers + CER writer' with a real kernel that owns execution lifecycle, readiness, transition rules, receipts, and deterministic CER emission. Define ExecutionSession with 7 node states (PENDING→READY→RUNNING→COMPLETED/FAILED/BLOCKED/SKIPPED) and 6 session states. Normalize handler output as ExecutionReceipt (session id, node id, handler id, status, input/output digests, side-effects, timing, error payload). Kernel owns readiness via dependency resolution engine. CER is emitted from kernel transitions, not ad hoc station behavior. 6 sub-plans through WorkRequest Runtime alignment.

### Requirements & Acceptance Criteria
- [ ] ExecutionSession: exactly one session identity per graph run; node states transition only through legal kernel transitions
- [ ] ExecutionReceipt: handlers return receipts; kernel interprets receipts — handlers do not mutate session state directly
- [ ] Readiness engine: derived from graph + node states, not handler whim; same graph/session → same ready set
- [ ] CER: kernel-authored events for session start, node readiness/start/completion/failure/block, session completion/failure
- [ ] Replay v2: reconstruct session state, node states, receipt-derived outcomes, terminal status from CER alone

---

## 5. Phase 4 — Observation Station: Semantic Projection Layer Over Execution Artifacts
**Status:** `Proposed`

### Architectural Intent
Build a read-only semantic projection layer over frozen ExecutionGraph, kernel receipts, CER event history, and replayed runtime state. Observation is not logs + dashboards — it turns execution artifacts into interpretable runtime knowledge. Projections: RunProjection (session summary, per-node status, progress, blocked/failure summaries), TimelineProjection (historical run views from CER), DiffProjection (semantic comparison between runs), FailureProjection (structured failure analysis). 5 sub-plans through Observation Station API.

### Requirements & Acceptance Criteria
- [ ] Observation must be derived from authoritative artifacts only (graph + CER + receipts)
- [ ] Projections must be reproducible from same underlying artifacts
- [ ] Live projection must agree with kernel state
- [ ] Historical projection must not require live kernel state — same CER → same projection
- [ ] Diff semantics must be explicit (graph difference, event difference, node outcome difference) — not string-level log comparisons

---

## 6. Phase 5 — Distribution Station: Cross-Process Execution Preserving Semantic Model
**Status:** `Proposed`

### Architectural Intent
Introduce cross-process/cross-machine execution without changing the semantic model from Phases 2-4. Define distribution unit (node, subgraph, or session), remote execution envelope, authority model for session state + CER. Remote execution must preserve kernel/CER semantics: receipt and event identity survive distribution boundaries, replay remains valid for distributed runs, single-writer authoritative transition rules remain clear. 5 sub-plans through Distribution Station API.

### Requirements & Acceptance Criteria
- [ ] Distribution must not create ambiguous ownership of runtime state
- [ ] Remote workers must not become independent semantic authorities — only validated receipts affect kernel state
- [ ] Replay must not depend on undocumented out-of-band ordering rules
- [ ] CER event identity and causality must remain stable across boundaries
- [ ] Distribution is an implementation detail from replay semantics perspective

---

## 7. Cross-Phase Testing Program — Six Persistent Test Suites Across All Phases
**Status:** `Proposed`

### Architectural Intent
Define a persistent testing strategy as its own workstream, not tests attached to each file. T1: Golden Front-End/Compiler Fixtures (snapshot ParsedInputEnvelope through frozen ExecutionGraph for representative inputs). T2: Kernel Lifecycle Conformance (legal node transitions only, session state derivation, readiness, failure propagation). T3: CER Conformance (event ordering, uniqueness, coverage, replay compatibility). T4: Replay Equivalence (reconstructed session + node state + terminal status + receipt outcomes). T5: Observation Projection (live/historical agreement with authoritative state, diff correctness). T6: Local vs Distributed Equivalence (same frozen graph + receipts → equivalent replayed state).

### Requirements & Acceptance Criteria
- [ ] T1: Golden fixtures snapshotted at each phase for regression detection
- [ ] T2: All kernel lifecycle transitions validated — no illegal transitions
- [ ] T3: CER event ordering and uniqueness verified
- [ ] T4: Replay reconstructs full runtime state from CER alone
- [ ] T5: Observation projections agree with authoritative runtime state
- [ ] T6: Distribution changes placement, not semantics

---

## 8. Core Architectural Invariants — The Five Pillars Across All Phases
**Status:** `Agreed`

### Architectural Intent
Define the five core architectural invariants that span all phases. (1) Frozen Graph Boundary: all execution happens against an immutable frozen artifact — execution never modifies its input. (2) CER as Authoritative Ledger: the append-only event stream is the single source of truth for all causal state. (3) Determinism by Default: same input → same IRL → same IR → same execution graph → same CER → same replay. (4) Layered Responsibility: each station (Preprocessor, Compiler, Kernel, Observation, Distribution) is strictly restricted to its role — handlers return receipts, observers observe, distributors transport, kernel decides. (5) Single Semantic Authority: kernel is the sole owner of execution transitions; no other component may change runtime state.

### Requirements & Acceptance Criteria
- [ ] Frozen Graph: execution graph is immutable once lowered — kernel reads frozen state
- [ ] CER Authority: CER is append-only — no mutation, only append; all state is derivable from graph + CER + receipts
- [ ] Determinism: identical under equivalent input — no non-deterministic scheduling or handler behavior
- [ ] Layered: Preprocessor classifies, Compiler generates, Kernel executes, Observation projects, Distribution transports
- [ ] Single Authority: kernel owns state transitions — handlers return receipts, not state mutations

---
