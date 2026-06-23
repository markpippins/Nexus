# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Nexus - Agentic Pipeline Overview.html
**Model:** DeepSeek V4
**Total candidates:** 4
---
## 1. Bootloader Agentic Pipeline — Event-Sourced, Human-in-the-Loop Workflow from Idea to Integration
**Status:** `Implemented`

### Architectural Intent
Define the bootloader agentic pipeline: a semi-automated, event-sourced Python pipeline managing workflow from raw idea capture through vocabulary extraction, requirements formalization, TypeSpec generation, compilation, refactoring, and integration — with human-in-the-loop approval at every step. Architecture: converse/ with main.py (orchestrator loop, 2s tick), agents/ (architect + LLM wrapper), handlers/ (6 step handlers with base class + dispatcher), validators/ (event schema + loader), projections/ (state tracking), prompts/ (templates per step). Event store is flat files (intentional — bootloader constraint).

### Requirements & Acceptance Criteria
- [ ] 6 step handlers: vocabulary, requirements, typespec, compile, refactor, integrate
- [ ] Strict STEP_ORDER enforcement with rejection for skipped steps
- [ ] Human-in-the-loop: pending → pending_approval → approved/rejected
- [ ] StepRejected resets step to pending with stored rejection reason
- [ ] Event-sourced: 13 event types, append-only event log
- [ ] Offset resilience: structured JSON offsets with processed_ids
- [ ] Ollama integration with fallback to placeholder artifacts
- [ ] CLI: capture, status, next, request, approve, reject commands

---

## 2. Three-Phase Evolution of Agentic Systems — Execution → Coordination → Self-Evolution
**Status:** `Agreed`

### Architectural Intent
Formalize the three evolutionary phases of agentic systems: Phase 1 (Execution) — system reliably does work via event→handler→outcome with retry loops, approval gates, and safe failure. Phase 2 (Coordination) — multiple agents coexist via identity, memory beyond context windows, and policy over prompting. Most projects die here because they fail to build governance (roles, authority, ownership, arbitration, shared vocabulary, memory continuity). Phase 3 (Self-Evolution) — agents propose changes to workflows, ontologies, policies, and their own architecture. The system becomes reflexive.

### Requirements & Acceptance Criteria
- [ ] Phase 1: Execution — reliable agency with event→handler→outcome
- [ ] Phase 2: Coordination — identity, org memory, policy > prompting
- [ ] Phase 2 danger zone: need governance (roles, authority, arbitration)
- [ ] Phase 3: Self-evolution — agents propose system changes
- [ ] Nexus is finishing Phase 1, entering Phase 2

---

## 3. LLM-as-Operating-Agent — From Representational AI to Operational AI
**Status:** `Agreed`

### Architectural Intent
Transition from LLM-as-text-generator (representational AI: build prompt → send to model → parse text → write files) to LLM-as-operating-agent (operational AI: read repo → edit real files → run compiler/tests → observe results → retry). This introduces closed-loop cognition: Perception → Action → Environment → Feedback → Adaptation. The system gains learning behavior without training — no weights change, yet outcomes improve through iteration. This is the same structural jump that separates autocomplete from autonomous engineering agents.

### Requirements & Acceptance Criteria
- [ ] Old pipeline: build prompt → send to model → parse → write files
- [ ] New pipeline: read repo → edit files → run compiler/tests → observe → retry
- [ ] Closed-loop cognition: Perception → Action → Environment → Feedback → Adaptation
- [ ] Learning without training: improved outcomes through iteration
- [ ] Capability polymorphism: same event, different execution body (agent/script/human)

---

## 4. TLA+ and CUE Formalization — Correctness Before Scaling Agent Autonomy
**Status:** `Proposed`

### Architectural Intent
Introduce TLA+ for core correctness/safety/liveness of the event kernel and approval system, and CUE for schema and constraint guarantees on agent workflows and resources. TLA+ should model: event queue, state transitions, handler pre/postconditions, retry behavior, KernelPanic triggers. CUE should constrain: agent manifests, JSON inputs, TypeSpec outputs, token/compute budgets. Introduce after bootloader/kernel is stable but BEFORE scaling agent autonomy — the cost of retrofitting correctness scales superlinearly in agent systems.

### Requirements & Acceptance Criteria
- [ ] TLA+ for: event kernel state machine, handler actions, retry logic, KernelPanic
- [ ] CUE for: agent manifests, JSON/TypeSpec schemas, resource budgets
- [ ] Introduce after kernel stable, before scaling agent autonomy
- [ ] TLA+ = dynamic behavior guarantees, CUE = static structural correctness
- [ ] Formal models updated as civil service and economy layers evolve

---
