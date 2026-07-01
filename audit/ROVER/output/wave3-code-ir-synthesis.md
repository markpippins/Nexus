# Wave 3 Synthesis — Actionable Code & IR Integration Surface

**Purpose:** Extract the code-heavy, IR-heavy, pluggable material from 17 Wave 2 agendas. Filter out speculative/"wouldn't it be cool if" content. Identify what can be built or integrated *today* against the live conduit-mcp and nebula-mcp surfaces, and what needs design work before implementation.

**Date:** 2026-06-29

---

## Part 1 — Verified Code Spine (Already Exists on Disk)

These are the artifacts confirmed by filesystem survey. They are not aspirational — they are running or shippable code.

### 1.1 LOSM-IR Package (14 modules) — `/nexus/python/vision/losm-ir/`
- Pure Pydantic semantic layer, zero I/O, one dependency
- **Key types**: `WorkRequestDCO`, `WorkflowState` (9 states), `WorkStatus` (11 states), `VALID_TRANSITIONS`, `validate_transition()`, `ExecutionIR`, `ExecutionReceipt`, `PlanIR`, `SpecIR`, `ValidationIR`, `CritiqueIR`, `Graph/Node/Edge`, `TraceOutput`, `ConstraintViolation`
- **Status**: ✅ Code exists, tests exist, package publishes

### 1.2 LOSM 5-Package Architecture — `/nexus/python/vision/losm-{ir,kernel,shell,store,host}/`
- Strict dependency direction: `ir ← kernel ← {shell, store} ← host`
- `KernelStepHandler` pattern: DAGExecutor (topology) ↔ StepHandler (semantics)
- Kernel isolation: no persistence, no HTTP, no orchestration
- **Status**: ✅ Deployed architecture, structural invariants enforced

### 1.3 Conduit-MCP — `/nexus/python/conduit/` (port 3100)
- Live plan lifecycle: proposed → planning → pending → execution → review
- Receipt system, circuit breaker, builder status
- **Status**: ✅ Running, registered in mesh

### 1.4 WRP Schema Files — `/nexus/schemas/wrp/`
- `work-request.schema.json`, `wrp-event.schema.json` (JSON Schema)
- Receipt and registry schemas at `/nexus/.agents/schema/`
- **Status**: ✅ Exist on disk, can be versioned and imported

### 1.5 WRP Python Package — `/home/codex/dev/python/losm-gemini/losm/wrp/`
- `models/work_request.py`, `models/execution_receipt.py`, `models/executor_registry.py`
- `compiler/wrp_to_internal.py`, `compiler/internal_to_wrp.py`
- **Status**: ✅ Full WRP compiler pipeline exists (not under nexus/ but in companion python project)

### 1.6 Spec Document Library — `/nexus/audit/SPECS/`
- **All 14 spec files exist**: PHASE1, LOWERING_PASS, PHASE2, OBSERVATION_MODEL, VALIDATOR_SPEC, CER_SPEC, CER_CCNF, EVENT_GRAMMAR, EXECUTION_GRAPH_SCHEMA, DISTRIBUTED_SCHEDULER, REPLAY_ENGINE, AUTHORITY_GRAPH_IR, COMPILER_ARCHITECTURE, WORKREQUEST_SPEC
- **Status**: ✅ Spec documents are written and versioned — these are the canonical reference

### 1.7 TypeSpec Contracts — `/nexus/typespec/v1/`
- 43 `.tsp` files for service-broker, terrain, peb-kernel, user-api, core
- **Status**: ✅ TypeSpec for service contracts exists (not LOSM-specific but covers mesh surface)

---

## Part 2 — Integration Surface: What Plugs Into Running Systems TODAY

These are schema changes, API additions, or code integrations against the live conduit-mcp (port 3100) and nebula-srv (port 3101) that can be done without building new infrastructure.

### 2.1 Evidence Bridge (`knowledge.evidence_links`) — High Priority
**From:** `cross-schema-evidence-bridge-agenda.md`

**What:** A new bridge table in the `knowledge` schema linking knowledge graph entities to nebula harvest candidates.

```sql
knowledge.evidence_links
  id                  uuid pk
  knowledge_entity_id uuid NOT NULL  (FK → knowledge.graph_entities)
  nebula_harvest_id   uuid NULL      (FK → nebula.harvests_history)
  nebula_candidate_id uuid NULL      (FK → harvest candidates)
  link_type           text NOT NULL  -- supports|refines|instantiates|contradicts|supersedes|mentions
  confidence          numeric(5,4)
  provenance          text           -- how this link was established
  created_at          timestamptz
```

**Why actionable today:** Small DB schema addition. Requires no new services. Population can start manually (curated links) then automated. Maps directly to existing `knowledge.graph_entities` and `nebula.harvests_history` tables.

**Blocks:** Unified semantic search (deferred). Embedding pipeline (deferred but separable).

**Action:** Write migration, create nebula-mcp tool `nebula_create_evidence_link`, seed initial links from known knowledge↔harvest correspondences.

---

### 2.2 Knowledge Stratification Query Filters — High Priority
**From:** `competing-intentions-model-agenda.md` (Spec 4)

**What:** The two-axis stratification model is already adopted in `AGENTS.md`. What's missing is the code path that enforces it in queries.

```
level (semantic):      1=raw, 2=structured, 3=architectural, 4=meta
visibility_scope:      builder, architect, planner, reviewer, inspector, analyst, all
```

**Why actionable today:** The existing `nebula_list_agent_records` and semantic search functions need filtering by level + visibility_scope. The schema probably already stores these fields. The query path just needs to apply the per-role level cap.

**Action:** Add level/visibility filters to `nebula_list_agent_records`. Add cross-ref expansion as a conditional parameter (not default join). Publish tool as `nebula_query_knowledge(role, level_max, scope, expand_cross_refs)`.

---

### 2.3 Nebula/Conduit Two-Plane Split — Schema Correction
**From:** `plans-table-decision-agenda.md`

**What:** Hard partition that is partially implemented but has state leaks. Conduit's "proposed" status has become a dead-letter queue for execution ambiguity.

**Current state (anti-pattern to fix):**
- Conduit has plans in `proposed` state — this conflates cognition-space drafts with execution-space failures
- "Hold for triage" pushes plans back to proposed, which collapses the semantic separation

**Target state (verified as the correct model):**
```
Nebula:   draft → refined → candidate → ready-for-commit    (pre-commit cognition)
Conduit:  committed → executing → completed/failed/HOLD     (post-commit execution)
```

**Why actionable today:** This is a schema clean-up of existing conduit-mcp tables, not new infrastructure.

**Action:**
1. Remove `proposed` from Conduit's state machine (plans come in as `committed` only)
2. Add `HOLD` as execution-pause state (not reasoning state)
3. Ensure failure recovery goes through: `failure trace → [PlanExecutionFailed event] → Nebula RepairPlan → re-commit`, not `demote to proposed`
4. Conduit reduces its plan model to: `plan_id + execution_contract + state_machine` — no reasoning traces, no cross-refs

---

### 2.4 WRP EventEnvelope Adoption — Integrate with Conduit Receipts
**From:** `wrp-dag-planning-guidance-agenda.md` (Spec 1)

**What:** The WRP v1.1 `EventEnvelope` schema formalizes what conduit-mcp receipts already do, but adds `tenant_id`, `trace_id`, `kernel_id` as mandatory fields.

```python
@dataclass(frozen=True)
class EventEnvelope:
    event_id: str; timestamp: str
    tenant_id: str      # mandatory isolation boundary
    trace_id: str       # execution lineage
    kernel_id: str      # execution context
    event_type: str; payload: dict
```

**Why actionable today:** Conduit-mcp already issues receipts (`PLAN_CREATE`, `IMPLEMENTATION`, `REVIEW_PASS`, etc.). Adding `tenant_id` and `trace_id` to the receipt schema is a backward-compatible change. The WRP schemas are already on disk at `/nexus/schemas/wrp/wrp-event.schema.json`.

**Action:** Extend conduit-mcp `issue_receipt` to accept optional `tenant_id`/`trace_id` fields. Align receipt JSON schema with `wrp-event.schema.json`. This establishes the event foundation for tenant isolation (WRP v1.1) without activating the DAG/traversal changes yet.

---

### 2.5 Reflection GraphPatch as a Kernel Service — Medium Priority
**From:** `reflection-graph-mutation-policy-agenda.md`

**What:** A concrete governance mechanism for kernel graph mutations. Instead of direct graph writes, reflection emits a `GraphPatch` that an Arbiter evaluates against budget/scope/surprise thresholds.

**Why actionable today:** The `GraphPatch` schema, mutation score formula, and budget bands are fully specified. The LOSM kernel already has the `apply(morphism, graph)` interface — this wraps it in governance.

**Action candidates:**
- Add `ReflectionGraphPatch` type to `losm-ir` (schema exists, needs code)
- Add `Arbiter.evaluate(patch, graph, taskContext)` as a kernel module
- Wire into `KernelStepHandler` as a guard before morphism dispatch

---

### 2.6 Lowering Pass as IR Boundary — Spec-to-Code Translation
**From:** `multi-stage-semantic-compiler-agenda.md` (Spec 2)

**What:** The Lowering Pass (Phase 1.5) is the system's semantic commitment point — where fluid WorkRequest IR becomes frozen ExecutionGraph. This is identified as the most important structural clarification in the architecture.

**Status check:** The spec exists at `/nexus/audit/SPECS/LOWERING_PASS.md`. A runtime executor exists at `/nexus/python/vision/losm-shell/src/losm_shell/runtime/executor.py`. But there is no `lowering/lowering.py` — the executable code path from WorkRequest IR → ExecutionGraph does not exist at the described path.

**Action:** This is the single highest-leverage implementation target. The Lowering Pass bridges the gap between the well-specified `losm-ir` types and the frozen execution graph consumed by `runtime/executor.py`. Implement it as a kernel module: `WorkRequest → lowering_pass → Frozen ExecutionGraph`.

---

## Part 3 — Build Targets for Next Sprint

Ordered by dependency (what must exist before what can be built).

### Sprint Target A: Lowering Pass (Phase 1.5) Implementation
**Depends on:** LOSM-IR types exist ✅, runtime/executor.py exists ✅, LOWERING_PASS.md spec exists ✅
**Build:** `losm-kernel/src/losm_kernel/lowering.py`
- Input: `WorkRequestDCO` + `SpecIR`
- Output: `ExecutionGraph` (frozen, immutable)
- Responsibilities: executor selection, dependency resolution, channel materialization, lifecycle expansion
- Contracts: once frozen, topology cannot mutate (only `lifecycle_state`, `outputs`, `event_refs`)
- Cross-validates against: `VALIDATOR_SPEC.md` static checks (S1–S10)

### Sprint Target B: WRP v1.1 Tenant-Aware Receipts
**Depends on:** conduit-mcp exists ✅
**Build:** Add `tenant_id` + `trace_id` to conduit `issue_receipt` tool and receipt tables
- Backward compatible (nullable fields initially)
- Aligns receipt JSON with `wrp-event.schema.json`
- Enables: tenant-filtered replay, execution lineage tracing, isolation boundary enforcement

### Sprint Target C: Evidence Bridge Table + Link Tool
**Depends on:** PostgreSQL schemas exist ✅
**Build:** 
- Migration: `knowledge.evidence_links`
- Nebula-MCP tool: `nebula_create_evidence_link`
- Seed set: link the most important knowledge↔harvest correspondences from the 17 Wave 2 agendas

### Sprint Target D: Knowledge Stratification Query Filters
**Depends on:** nebula-mcp exists ✅
**Build:** Add level + visibility_scope filter params to `nebula_list_agent_records`. Add cross-ref expansion parameter.

### Sprint Target E: Reflection GraphPatch Arbiter
**Depends on:** losm-kernel exists ✅
**Build:**
- `ReflectionGraphPatch` type in `losm-ir`
- `Arbiter.evaluate()` in `losm-kernel`
- Budget bands (inline/local/promotion)
- Causal neighborhood test
- Surprise threshold model

---

## Part 4 — Architectural Clarifications (Update Docs to Match Reality)

These are not code changes but conceptual corrections that should be reflected in architecture documentation.

### 4.1 Projection-Centric Update (NOT Reality-Centric)
**From:** `unit-of-update-analysis-agenda.md` (Spec 2)

**Current docs say:** Implicitly reality-centric — "WorkRequests update reality"

**Should say:** `Reality Update = Projection( Execution( WorkRequest ) )`

The system maintains three separate realities:
- **(A) Physical truth**: Temporal event history, receipts
- **(B) System belief**: PGE/PEB projections, knowledge graphs
- **(C) Intentional truth**: WorkRequests, plans, decisions

WorkRequests do not update reality directly. They generate events that update the system's *projected model* of reality. This is already what the system does — it just doesn't say it yet.

**Action:** Update the `WORKREQUEST_SPEC.md` and conduit-mcp architectural docs to use "belief-maintenance system" framing. Not a task system, not an event system — a reality projection system with causal grounding in WorkRequests.

### 4.2 Five-Phase Pipeline (Not Four)
**From:** `irl-ir-interaction-system-agenda.md` (Spec 2)

**Current docs say:** 4-phase pipeline (Compiler → Lowering → Execution → Observation)

**Should say:** 5-phase pipeline (IRL/IR → Compiler → Lowering → Execution → Observation)

Phase 0 (IRL/IR Interaction Semantics) is the missing front-end. It classifies interaction intent before compilation. The spec docs at `/nexus/audit/SPECS/` still use the 4-phase model.

**Action:** Add Phase 0 section to `COMPILER_ARCHITECTURE.md`. The IRL→IR bridge is conceptual for now (the reference implementation files don't exist on disk), but the phase boundary should be documented.

### 4.3 Conduit is a Contract Processor, Not a Plan Manager
**From:** `plans-table-decision-agenda.md` (Spec 5)

**Current conduit-mcp state:** Owns full plan lifecycle with reasoning artifacts

**Should be:** Conduit only knows `plan_id + execution_contract + state_machine`. Reasoning, cross-references, stratification belong in Nebula.

**Action:** Audit conduit-mcp tables for stored reasoning artifacts. Move `proposed` plans to Nebula. Reduce Conduit plan model to the execution contract surface only.

### 4.4 LOSM Renamed to Vision (Terminology Update)
**From:** `losm-lang-overview-agenda.md` (note at bottom)

The LOSM code lives at `/nexus/python/vision/`. Many spec documents and architecture docs still use "LOSM" (Language-Oriented State Machine) — the canonical name is now "Vision." The IR package is `losm-ir` but should be considered the Vision IR.

**Action:** Terminology sweep on new docs. Not urgent — old spec docs can stay as-is for reference, but new writing uses "Vision."

---

## Part 5 — Explicit "Skip" List (Not Worth Implementing Yet)

These came up repeatedly in Wave 2 but are deferred or speculative. Do not build.

| Item | Source | Why Skip |
|------|--------|----------|
| Epistemic Control Theory (J, Φ, Ψ, E) | chronal-alignment | No implementation path; theoretical model only |
| Self-Modeling Layer / Meta-Control | chronal-alignment | Second-order system; requires stable first-order system first |
| Recursive Alignment Fixpoint Model | chronal-alignment | Formal convergence conditions; no concrete implementation |
| PEB as Compiled Semantic Model (LOSM-Lang) | losm-lang | Requires full LOSM-Lang compiler; highly speculative |
| Three-Axis WRP Expansion (Multi-tenant/Hierarchical/Probabilistic) | semantic-ir, wrp-dag | Deferred to v1.2+; focus on v1.0→v1.1 first |
| Unified Semantic Search | cross-schema-evidence | Requires evidence bridge + embeddings first |
| LOSM System Identity / Drift Model | work-artifact-ir | Philosophical; no concrete validation mechanism |
| The "Mildred Screen" anti-pattern discussion | competing-intentions | Already agreed upon; no implementation needed |
| Golden Trace System (MEEP v0.2) | irl-ir-interaction | Deferred until reference implementation exists on disk |

---

## Summary: Priority-Packed Action Queue

```
IMMEDIATE (this sprint):
  A. Lowering Pass implementation        — highest-leverage code gap
  B. Tenant-aware receipts              — backward-compatible conduit-mcp upgrade
  C. Evidence bridge table + tool       — small schema change, high integration value
  D. Knowledge stratification filters   — query-level fix, no new infra

MEDIUM (next sprint):
  E. GraphPatch Arbiter                 — kernel governance
  F. Nebula/Conduit plane cleanup       — state machine correction
  G. Projection-centric update docs     — conceptual correction

DEFERRED (don't touch):
  Epistemic Control Theory, Self-Modeling, Alignment Fixpoint,
  PEB as compiled model, WRP v1.2+, Unified Search, Identity/Drift
```

**Core architectural delta for implementation:**
1. The system is a **compiler with IR transitions**, not a pipeline — WorkRequest IR is the front-end AST, ExecutionGraph is the mid-level IR, the Lowering Pass is the semantic commitment point
2. The system is a **belief-maintenance system**, not a task/event system — WorkRequests explain *why*, events explain *what*
3. **Nebula thinks, Conduit executes** — the two-plane split must be enforced in schema, not just in documentation
4. **WRP v1.0 works today** — linear execution kernel + receipts. v1.1 (DAG + tenancy) is the next build target, but v1.0 does not need to change
5. **The LOSM/Vision codebase is real** — 5 packages, 14 IR modules, running kernel. The gap is in the compilation bridge (Lowering Pass) between IR types and the execution runtime

---

*Synthesized from 17 Wave 2 agenda files. Code existence verified by filesystem survey of /home/codex/dev/nexus/ and companion projects.*
