# Harvested Specification & Code Repository
**Source:** /home/codex/dev/chats/Multi-Stage Semantic Compiler.html
**Model:** DeepSeek V4
**Total candidates:** 4
---
## 1. Multi-Stage Semantic Compiler — Three Stacked Machines: Semantic Compiler + Deterministic Runtime + Temporal/Event Reality Layer
**Status:** `Specified`

### Architectural Intent
Define the system as three stacked machines with strict IR transitions: (1) Semantic Compiler — WorkRequest IR (intent layer, front-door semantic IR) → Lowering Pass (IR boundary enforcement) → ExecutionGraph (lowered executable program representation, explicitly frozen). (2) Deterministic Runtime Substrate — ExecutionGraph execution, distributed scheduler, validators. (3) Temporal/Event Reality Layer — CER (immutable event state, universal trace substrate), CCNF (deterministic identity), Replay Engine (time-travel execution model, pure fold interpreter over event space). Above all: Governance/Cognition Layer (PEB + CIRS as metalevel constraint system).

### Requirements & Acceptance Criteria
- [ ] Three stacked machines with strict phase boundaries
- [ ] Semantic Compiler: WorkRequest IR → Lowering Pass → ExecutionGraph
- [ ] Deterministic Runtime: ExecutionGraph execution + scheduler + validators
- [ ] Temporal/Event Reality: CER + CCNF + Replay Engine
- [ ] Governance Layer (PEB + CIRS) above all — not part of runtime
- [ ] Lowering Pass is the semantic commitment point — after it, intent is no longer fluid

---

## 2. Lowering Pass as IR Boundary Enforcement Layer and Semantic Commitment Point
**Status:** `Specified`

### Architectural Intent
Define the Lowering Pass (Phase 1.5) as the critical IR boundary enforcement layer — not 'just a transformation' but the semantic commitment point where intent stops being fluid. Responsibilities: executor selection (which model/worker executes each node), dependency resolution (graph ordering), channel materialization (event bus wiring), lifecycle expansion (node-level state machines). After lowering, the ExecutionGraph is frozen — immutable, deterministic, and ready for the runtime substrate. This is the LLVM-like 'semantic commitment point' analogous to SSA conversion.

### Requirements & Acceptance Criteria
- [ ] Lowering Pass owns: executor selection, dependency resolution, channel materialization, lifecycle expansion
- [ ] After lowering: ExecutionGraph is frozen — immutable and deterministic
- [ ] Lowering is the boundary between Semantic Compiler and Deterministic Runtime
- [ ] Lowering must be deterministic — same input produces same ExecutionGraph
- [ ] Lowering failures must produce structured error reports, not partial ExecutionGraphs

---

## 3. CER/CCNF as Event-Sourced Truth Substrate — Replay Engine as Temporal Interpreter
**Status:** `Specified`

### Architectural Intent
Define CER (Canonical Event Record) as the universal trace substrate and CCNF (Content-Addressed Canonical Name Format) as deterministic identity for events. Every execution transitions become immutable CER events. The Replay Engine acts as a temporal interpreter — a pure fold over event space that reconstructs state from CER only. This enables replay, debugging, and distributed reconstruction without ambiguity. CER is orthogonal to the ExecutionGraph: the graph is what will happen, CER is what happened.

### Requirements & Acceptance Criteria
- [ ] CER: immutable event record capturing every execution state transition
- [ ] CCNF: deterministic content-addressed identity for events
- [ ] Replay Engine: pure fold over CER event space, reconstructs state
- [ ] CER is orthogonal to ExecutionGraph — graph = plan, CER = history
- [ ] Cer must support distributed reconstruction without ambiguity

---

## 4. PEB/CIRS as Metalevel Governance Kernel Above All Compiler Stages
**Status:** `Specified`

### Architectural Intent
Define PEB (Policy Enforcement Boundary) and CIRS (Canonical Invariant Rule Set) as the metalevel constraint system that governs all compiler stages from above. PEB = state transition authority that gates whether the system is allowed to proceed through each stage. CIRS = rule system governing correctness — comprising static analyzers (S1-S10), runtime verifiers (R1-R10), authority graph enforcement (AEI), and permission layer (HAEC). PEB/CIRS are not part of runtime — they are meta-level constraints that the compiler and runtime must satisfy.

### Requirements & Acceptance Criteria
- [ ] PEB: state transition authority — gates progression through each stage
- [ ] CIRS: static analyzers (S1-S10) + runtime verifiers (R1-R10) + AEI + HAEC
- [ ] PEB/CIRS are metalevel — not part of compiler or runtime
- [ ] Compiler stages must satisfy PEB/CIRS constraints before proceeding
- [ ] Governance layer is above all three stacked machines

---
