# Nexus Architecture Analysis

**Author:** Analyst  
**Date:** 2026-06-15  
**Status:** Inventory catalog — months of accumulated whiteboard across 20+  
           discussion transcripts. This is a *taking stock* pass, not a fresh  
           design. The goal is a minimal self-updating system; the pieces are  
           still being understood.  
**Context:** This analysis is a recent snapshot of a long-running exploration.  
           Many of the 16 "locked" decisions come from different phases and  
           may not be equally binding. Some concepts (e.g. "projector")  
           collapsed multiple ideas under one name across different conversations.  

---

## 1. Landscape Summary

### What Exists

The codebase has four partially-built systems that share a common vision but are not connected:

| System | Runtime | Status | Core Files |
|--------|---------|--------|------------|
| **Conduit** | Python + TypeScript | Active (cron-driven) | `legacy/python/conduit/main.py`, `typescript/conduit-mcp/` |
| **Nebula** | Angular + Express (ts) | Active (RMS UI) | `angular/nebula-ui/`, `typescript/nebula-srv/` |
| **losm** | Python packages | Library-only, no consumer | `python/vision/losm-ir/`, `python/vision/losm-store/`, `python/vision/losm-host/`, `python/vision/losm-kernel/` |
| **CCNF** | Go + Rust | Reference impl, not wired | `go/wrp/ccnf-ref/`, `rust/wrp/ccnf-verifier/` |

### The Pipeline State (from `.conduit-data/`)

- **IMPLEMENTATION_PLANS**: 14 plans in `planning/`, 16 in `pending/`, 1 in `proposed/`
- **PROMPTS**: 22 archived prompts (0001–0087)
- **SESSIONS**: 307 session logs across builder/planner/reviewer/critic
- **INSPECTIONS**: errors/, warnings/, triage/ directories exist
- Pipeline is blocked: `.api-blocked` file present

---

## 2. Cognitive Compiler Architecture (The Whiteboard)

The ChatGPT conversation at `chats/Cognitive Compiler Architecture.html` defines the target architecture:

### Core Concept: 2-Tier Cognitive Compiler

```
DeepSeek Pro  = Policy + Coordination + Structural Authority  (Graph Compiler)
DeepSeek Flash = Executional Swarm, fast iterative transforms   (Node Runtime)
```

### The IR Pipeline

```
WorkRequest IR
   ↓
Spec IR
   ↓
ExecutionGraph IR
   ↓
ExecutionReceipt

(Parallel branch — ViewSpec)

Spec IR + ExecutionGraph IR
   ↓
ViewSpecCompiler (Pro logic)
   ↓
ViewSpec IR → Tab Registry
   ↓
ViewExecutionService (Flash logic)
   ↓
Rendered View (ephemeral)
```

### Hard Invariants

```
All persistent artifacts must be traceable to IR state transitions.
All views are ephemeral projections over IR state.
No view is allowed to become a source of truth.
```

### Service Boundary Design (from Spring Boot mapping)

Three service layers + one orchestration layer:
1. **IR Service** — stateful truth: WorkRequest, SpecIR, ExecutionGraphIR, ExecutionReceipt
2. **ViewSpec Service** — compile ViewSpec from IR, enforce projection rules
3. **View Execution Service** — stateless renderer (Flash role)
4. **Tab Service** — UI binding only, no content generation

### System Mapping

| Concept | Implementation |
|---------|---------------|
| Nexus Console | Pro layer (operator / control plane) |
| Nebula | User-facing execution environment |
| Conduit UI | Flash orchestration sandbox |
| IR stack | Shared substrate (losm-ir) |

---

## 3. What Nebula Has Identified (Markdown Documents)

Nebula's workspace scanning discovers markdown documents across the nexus project tree:

### Known File Set
```
README.md, ARCHITECTURE.md, README.markdown, SPEC.md, REFERENCE.md
```

### Current Binding (5 layers)
1. **Entity-bound**: `readme` / `architecture` columns in PostgreSQL (systems, subsystems, features)
2. **Disk-backed**: Workspace-linked directories → disk scan → case-insensitive match
3. **Cascading resolution**: Disk (subsystem) → Disk (system) → DB column → localStorage → default
4. **AI context stacking**: `sys.readme → sub.readme → feat.readme → Gemini` for requirement generation
5. **Import/Export**: `.md` file import into readme, session export as `nebula-session-*.md`

### Critical Gap
Nebula discovers and structures markdown. The conduit pipeline never consumes it. No bridge exists.

---

## 4. The PEB (Persistent Engineering Brain)

Located in `nexus/.agent/peb/`, the PEB is the aspirational long-term memory layer for the WorkRequest pipeline.

### Current Structure

```
.agent/peb/
├── intent.md                   — High-level goals
├── architecture.md             — System structure facts  
├── invariants.md               — Hard laws (no authority leakage, state dependency, semantic normalization)
├── trajectory.md               — Identity continuity ("what am I becoming")
├── decision_log.md             — ADR records (CCNF governance ADRs)
├── meta/
│   ├── evolution_policy.md     — How PEB extends itself
│   ├── exception_policy.md     — Exception handling
│   ├── trace_policy.md         — Execution tracing
│   ├── uncertainty_policy.md   — Handling unknown states
│   └── violation_policy.md     — Violation response
└── contracts/
    ├── UNIVERSAL_READ.md       — PEB read contract (every agent sees this)
    ├── ROLE_PLANNER.md         — Planner contract
    ├── ROLE_CRITIC.md          — Critic contract
    └── ROLE_EXECUTOR.md        — Executor contract
```

### Pipeline Definitions (referenced by PEB)

| Pipeline | Phase | Stages |
|----------|-------|--------|
| `skill-pipeline.specification.json` | Phase 1 (Spec) | archive-prompt → requirements-capture → work-request-emission |
| `skill-pipeline.execution.json` | Phase 1.5 + 2 (Execution) | execution-lowering → execution-scheduler |
| `skill-pipeline.observation.json` | Phase 3 (Observation) | observation-engine |

### Skills (30 skills in `.agent/skills/`)

Key PEB-related skills: `peb-context-binding`, `peb-knowledge-formation`, `peb-memory-consolidation`, `peb-exception-router`, `peb-validation-layer`, `peb-merge-recomposition`

### Current Status of PEB

**Aspirational, not operational.** All PEB files carry the disclaimer:
> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

The `PEB_STATE_HASH` and `THOUGHT_CONTEXT_HASH` references in the contracts are placeholders. The PEB is not consumed by any runtime — no agent reads these files as part of its execution loop. The 30 skills are markdown files, not executable code.

---

## 5. The 7 Backlog Items (Mapped to Architecture)

| #   | Item                        | Arch Layer                         | Current State                                              | Next Step                                                |
| --- | --------------------------- | ---------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 1   | **Prompt as AST**           | WorkRequest IR → worker input      | Prompt builder in `executor_cloud.py` concatenates strings | Serialize `losm-ir.WorkRequestDCO` to JSON as the prompt |
| 2   | **HTML → DocLing directly** | Ingest → Spec IR                   | Multi-pass graph construction, `IRMigrationLayer` at end   | Rewrite ingest to emit `losm-ir` types directly          |
| 3   | **NLP on transcripts**      | ExecutionReceipt → topic discovery | 307 session logs on disk, no pipeline                      | Add NLP activity to Temporal workflow                    |
| 4   | **Invocation semantics**    | ExecutionGraph IR node types       | CCNF controlled vocab exists, not mapped                   | Define `losm-ir.ExecutionStep.type` from CCNF vocab      |
| 5   | **Using CCNF**              | CER = event wrapper                | Go + Rust implementations, Python alignment test only      | Wrap WorkRequest and ExecutionReceipt in CER envelopes   |
| 6   | **WRP in conduit**          | Temporal Workflow impl             | `TEMPORAL_CONVERSION_PLAN.md` written, zero code           | Phase 0: install Temporal, create `temporal/` package    |
| 7   | **Using ai/losm-***         | IR type system + storage           | 4 packages exist, no consumers                             | Make conduit depend on `losm-ir`, replace inline types   |

---

## 6. PEB Breakout Analysis

### What "Breaking Out the PEB" Means

Currently the PEB is 12 markdown files in `.agent/peb/`. A working subsystem requires:

#### 6.1 Storage Layer
Move PEB state from flat files to the PostgreSQL `nebula` database (same instance as nebula-srv). The `decision_log.md` is already ADRs — these should be rows in a `peb_decisions` table. The `trajectory.md`, `invariants.md`, and `architecture.md` should be queryable IR.

#### 6.2 Runtime Consumption
The PEB is referenced by contracts (`UNIVERSAL_READ.md` mentions `PEB_STATE_HASH`) but no code computes this hash or injects PEB context into agent prompts. The `peb-context-binding` skill describes the process but has no implementation.

#### 6.3 Pipeline Integration
The three pipeline definitions (`specification`, `execution`, `observation`) reference skills by path. These skills are markdown files, not invocable modules. A working PEB would:
- Route execution through `skill-pipeline.json` programmatically
- Track which stage is active
- Enforce invariants at stage boundaries

#### 6.4 Decision Log as Append-Only Event Store
The `decision_log.md` currently has 6 ADRs embedded in markdown. A working subsystem would store decisions as structured rows (or JSONB) with:
- Decision ID, timestamp, actor, affected invariants
- Before/after state references
- Entropy classification (from CCNF/CEGL-A)
- Rollback capability

#### 6.5 Invariant Enforcement
The 3 invariants in `invariants.md` are text. A working PEB would validate them:
- No Authority Leakage → check that executor agents don't emit WorkRequests
- State Dependency → verify decisions reference existing PEB state
- Semantic Normalization → validate pipeline step output is parseable JSON

### PEB Breakout Priority Order

1. **Make PEB queryable**: Store PEB state in PostgreSQL (same `nebula` schema) with JSONB columns for structured metadata
2. **Wire PEB context into agent prompts**: Implement `peb-context-binding` as a real middleware that injects relevant PEB state before every agent invocation
3. **Pipeline router**: Programmatic consumption of `skill-pipeline.json` that tracks stage transitions and validates handoffs
4. **Decision log as event store**: Convert markdown ADRs to structured rows with CCNF CER compatibility
5. **Invariant validation gate**: Post-stage validation against `invariants.md` rules

---

## 7. Integration Map (How It Connects)

```
Nebula (RMS)                  conduit-mcp (API Gateway)
  ├─ requirements table         ├─ sessions
  ├─ workspace docs             ├─ plans
  ├─ system/feature hierarchy   ├─ tickets
  └─ readme/architecture md     └─ state queries
         │                              │
         ▼                              ▼
    ┌─────────────────────────────────────────┐
    │           losm-ir (IR types)             │
    │  WorkRequestDCO  SpecIR  ExecutionGraph  │
    │  ExecutionReceipt  ViewSpecIR            │
    └─────────────────────────────────────────┘
         │                              │
         ▼                              ▼
    ┌─────────────────────────────────────────┐
    │           Temporal Workflows             │
    │  PlanExecutionWorkflow                   │
    │   → Activity: BuildWorkRequestDCO        │
    │   → Activity: ExecuteWithModel           │
    │   → Activity: InsertReceipt              │
    │   → Activity: AdvanceCursor              │
    └─────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────┐
    │           Worker (opencode/codex)        │
    │   Receives: WorkRequestDCO as AST        │
    │   Returns: ExecutionReceipt              │
    └─────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────┐
    │           PEB (Decision & State)         │
    │  Logs every state transition             │
    │  Validates invariants                    │
    │  Tracks trajectory                       │
    │  Records decisions (ADRs)                │
    └─────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────┐
    │           ViewSpec (Pro → Flash)         │
    │  Compiles projections from IR            │
    │  Renders ephemeral views (tabs)          │
    │  Never mutates IR                        │
    └─────────────────────────────────────────┘
```

---

## 8. Event System Design (Transcript: `chats/Event System Design.html`)

The conversation defines an event backbone architecture with three roles — the architectural substrate for the pipeline.

### Three Roles

| Role | Function | Tech |
|------|----------|------|
| **Observer** | Thin ingestion + normalization | NATS JetStream / Kafka producer |
| **Event Log** | Durable append-only backbone | NATS JetStream, Kafka/Redpanda, or ClickHouse |
| **Atten** | Projection/reducer layer, builds views | Consumer group(s) |

### Key Design Decisions

1. **Incidents are typed Events** — not separate entities. `IncidentDetected`, `IncidentCorrelated`, `IncidentEscalated` are derived events emitted by stateless stream transformers.
2. **Postgres is wrong for event logs** — OLTP pressure, no replay semantics, no backpressure handling, no fan-out scaling. A second Postgres instance gives load isolation but not a different *shape* of system.
3. **Log-first, not database-with-event-tables** — the distinction between "log-first system with multiple semantic projections" and "database with event tables" matters more than the Postgres vs not-Postgres question.

### Topic Design

- **Option A — Single unified topic** (`events.all`): Simplest, easiest replay, maximum flexibility for new reducers
- **Option B — Multiple typed topics** (`events.incidents`, `events.metrics`, `events.audit`): Stronger partitioning guarantees

### Pragmatic Hybrid

```
Observer → NATS JetStream (or Kafka topic)
      ↓
Persistent archive sink → ClickHouse or object storage
      ↓
Atten → consumer group(s)
      ↓
Optional Postgres — only for serving UI state, not raw events
```

### Relevance to Nexus

This is the event backbone that the Cognitive Compiler's ExecutionReceipt and CCNF's CER should flow through. Currently, conduit has no such backbone — receipts are written to flat files and session logs accumulate on disk. The Observer/Event Log/Atten pattern is the missing plumbing between pipeline stages.

---

## 9. Nebula Architecture Evolution (Transcript: `chats/Nebula Architecture Evolution.html`)

The conversation reveals the evolving identity of each subsystem and predicts IR emergence from the corpus.

### The Three-Layer Model (not three projects)

```
┌─────────────────────────┐
│       Nebula            │
│ User / Knowledge Layer  │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│       Conduit           │
│ Agent / Service Layer   │
└──────────┬──────────────┘
           │
┌──────────▼──────────────┐
│    Nexus Console        │
│ Operator / Runtime      │
└─────────────────────────┘
```

### System Identity

| System | Primary Concern | Audience |
|--------|----------------|----------|
| **Nexus Console** | Operations | Operator, Administrator, Architect |
| **Conduit** | Execution | Execution Fabric (plumbing) |
| **Nebula** | Knowledge | End user |
| **Plurality** | Reasoning & Perspective | Multiple agents |

### Staged Evolution

1. **Stage 1 — Conduit**: Figure out invocation, orchestration, model interaction, tool usage
2. **Stage 2 — Nebula**: Figure out knowledge, ontology, persistence, relationships
3. **Stage 3 — Plurality**: Figure out perspectives, multiple agents, coordination
4. **Stage 4 — AG-UI**: Expose all of the above through a user-facing model

### IR Emergence Prediction

The conversation predicts three possible outcomes for Nebula's ontology:

| Outcome | Behavior | Max |
|---------|----------|-----|
| **No IR Emergence** | Rich document management, metadata, search, embeddings | RAG systems |
| **Weak IR Emergence** | Semantic categories (Component, Capability, Dependency...) | Knowledge graphs |
| **Strong IR Emergence** | Workflows and state transitions (Idea→Requirement→Spec→Impl→Deploy) | **Nexus WRP** |

The system is set up as a fair test: **not imposing WorkRequest/Spec/AcceptanceContract/ExecutionGraph onto the corpus, but letting the corpus speak first** and seeing what abstractions emerge.

### The Key Insight

> "These three systems appear to be implementing the same concept under different names." — That's the first sign an ontology is trying to emerge.

The architecture is drifting *inverse* to most AI projects — not chat → agent → tools, but **knowledge → execution → operations**, with chat as merely one projection.

### UI Consequence

An agent-oriented UI (AG-UI style) is a natural consequence of an ontology-first system. Users manipulate semantic objects (WorkRequest, Project, Concept, Graph) rather than pages, forms, buttons, tables.

---

## 10. Agenda Generator for DeepSeek (Transcript: `chats/Agenda Generator for DeepSeek.html`)

> **2026-06-15 correction:** This section defines **CIR** (Cognitive Integrity
> *Ratio*), which has been superseded by **CIRS** (Cognitive Integrity *Rule
> System*). CIR remains valid as a continuous confidence measurement (0.0–1.0)
> within the ProjectionIR schema, but CIRS is now the authoritative epistemic
> enforcement model. See §28.3 and `graph/cognitive-integrity-rule-system.md`.

This conversation defines the CIR (Cognitive Integrity Ratio) and the formal separation of outcome, intent, and learning spaces.

### Two Meanings of "Outcome"

| Meaning | Description | Lives In |
|---------|-------------|----------|
| **Outcome as realized history** (post-event) | What actually happened | Event spine, LOSM state transitions, CIR-observed results |
| **Outcome as intended structure** (pre-event) | Expected shape after applying a tactic | Acceptance criteria, plan compilation graph, tactic expectation models |

**Formal invariant:**
```
Outcome_realized ≠ Outcome_intended
```

### CIR Definition

```
CIR = distance(Outcome_realized, Outcome_intended)
```

The "distance" is where all learning lives. This separation prevents:
- Learning from hallucinated success
- Circular reinforcement loops
- Model bias locking into bad heuristics

### The Three Semantic Layers

| Layer | Contains | Answers |
|-------|----------|---------|
| **Intent Layer** (Planning space) | Strategies, Tactics, Acceptance Criteria, ContextCluster priors, Projected Outcome Manifolds | "What state do we want to move toward?" |
| **Execution Layer** (Reality space) | Conduit, LOSM kernel, state transitions, execution receipts | "What actually happened?" |
| **Learning Layer** (Mapping space) | CIR, Eval, Voyager, ConflictEvents, losm-store aggregation | "How wrong was our intent relative to reality?" |

### Key Architectural Correction

Planning is not "above" implementation. They are **different coordinate systems**:

```
Intent Space  ⇄  Execution Space
        ↑
   Learning Space (CIR/Eval/Voyager)
```

### The Cognitive Ontology Stack

The conversation also defines a meta-observational stack above the event layer:

```
Perspective          — "From which frame am I interpreting this?"
    ↓
Reflection           — "What has changed in my beliefs over time?"
    ↓
Introspection        — "What do I currently believe?"
    ↓
Observation          — "What happened?"
    ↓
Motivation           — Values / intent drivers
    ↓
Priority             — Produced by interaction of observation + motivation
    ↓
Action
```

### Role Mapping (from the Agenda)

| System | Consumes | Produces |
|--------|----------|----------|
| **Cascade** | — | Observation, Receipt, Timeline, Signal |
| **Analyst** | Observation + Motivation | Priority |
| **Conduit** | Priority | Action |
| **PEB / Engineer** | Motivation, Priority, Action | Constrains everything through invariants |

### The Final Insight

> "Events are not important. Observations are important. Priorities emerge from observations in the presence of motivations."

And: **intent as a first-class geometric object** (Projected Outcome Manifold) rather than a transient planning artifact. This means learning is *geometric correction of intent-to-reality mapping per region of decision space*.

---

## 11. Synthesized Architecture (Second Pass)

### The Unified Pipeline (Full 9-Transcript Synthesis)

The pipeline below incorporates all 9 transcripts. The 4 original transcripts
established the IR pipeline, event backbone, learning loop, and PEB governance.
The 5 additional transcripts contribute:

- **RCL (Reality Constraint Layer)** — external drift signals that constrain
  intent governance; intent must be physically grounded, not just internally
  coherent
- **WorkRequest as root identity** — WorkRequest is the immutable intent
  anchor; sessions are ephemeral Temporal execution instances (or absent)
- **Capability decomposition** — "small sharp tools" over monolithic agents;
  Atten is the substrate, not the orchestrator
- **3-authority resolution** — file becomes artifact (not state store),
  DB is source of truth, runtime is ephemeral projection
- **Observation vs Event** — Observations are interpretive evidence,
  Events are factual; Observer owns records, Atten owns understanding

```
┌──────────────────────────────────────────────────────────────────┐
│  ┌──────────────┐  RCL (Reality Constraint Layer)                │
│  │ External     │  Drift signals from physical reality           │
│  │ Reality      │  constrain what intents can be valid           │
│  └──────┬───────┘  Intent must be physically grounded            │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────────┐ │
│  │              Nebula (Knowledge / Ontology)                   │ │
│  │  Workspace docs → requirements → ontology → Capability      │ │
│  │  Graph discovery (emergent, not imposed)                     │ │
│  └────────────────────┬─────────────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼──────┬──────────────────────────────────┐ │
│  │ Observer (Event Ingest)   │  Observations ≠ Events           │ │
│  │ Thin normalization →      │  Observations are interpretive   │ │
│  │ NATS/Kafka topic          │  evidence (Observer owns records)│ │
│  └────────────────────┬──────┴──────────────────────────────────┘ │
│                       │                                          │
│  ┌────────────────────▼─────────────────────────────────────────┐ │
│  │  Event Log (Durable Append-Only Backbone)                   │ │
│  │  Events are factual (Event Log stores these)                │ │
│  │  Replayable, partitioned; Atten owns the understanding      │ │
│  └─────────┬──────────────────────────────┬─────────────────────┘ │
│            │                              │                       │
│  ┌─────────▼─────────┐          ┌─────────▼──────────────┐      │
│  │ Atten (Projection)│          │ Event Archive           │      │
│  │ Builds views from │          │ ClickHouse / Object     │      │
│  │ filtered streams  │          │ Store (permanent)       │      │
│  └─────────┬─────────┘          └────────────────────────┘      │
│            │                                                     │
│  ┌─────────▼──────────────────────────────────────────────────┐  │
│  │ Analyst (Priority Generation)                              │  │
│  │  Observation + Motivation → Priority                       │  │
│  │  Recognizes diminishing returns, writes triage notes       │  │
│  └─────────┬──────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼──────────────────────────────────────────────────┐  │
│  │ Cognitive Compiler (Pro + Flash)                           │  │
│  │  WorkRequest IR → Spec IR → ExecutionGraph IR              │  │
│  │  ViewSpecCompiler (parallel ephemeral branch)              │  │
│  │  WorkRequest = root identity (immutable intent anchor)     │  │
│  │  Plan (reasoning artifact) ≠ WorkRequest (exec contract)  │  │
│  └─────────┬──────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼──────────────────────────────────────────────────┐  │
│  │ Conduit / Temporal (Execution Fabric)                      │  │
│  │  Activities: BuildWR → Execute → Receipt → Cursor          │  │
│  │  Sessions = ephemeral Temporal instances (NOT entities)    │  │
│  │  Conduit is request system that delegates to Temporal      │  │
│  │  No session layer anywhere in the system                   │  │
│  └─────────┬──────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼──────────────────────────────────────────────────┐  │
│  │ Capability Graph (Small Sharp Tools)                       │  │
│  │  Single-purpose, composable, swappable, independently      │  │
│  │  testable, multi-workflow-usable tools                     │  │
│  │  ● Inference nodes — propose reality (LLM, probabilistic)  │  │
│  │  ● Deterministic nodes — stabilize reality (parsers, etc)  │  │
│  │  ● External tools — delegate computation (APIs, DBs)       │  │
│  │  Workflows = typed process graphs over Atten               │  │
│  │  "Workflows assume a capability graph, not a domain"       │  │
│  └─────────┬──────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼──────────────────────────────────────────────────┐  │
│  │ PEB (Cognitive Governance Service, not Brain)              │  │
│  │  Records decisions, validates invariants,                  │  │
│  │  tracks trajectory, enforces contracts                     │  │
│  │  MCP model: resources (state) + tools (constraints)        │  │
│  │  + prompts (context injection)                             │  │
│  │  Receives reality drift signals from RCL                   │  │
│  └─────────┬──────────────────────────────────────────────────┘  │
│            │                                                     │
│  ┌─────────▼──────────────────────────────────────────────────┐  │
│  │ Learning Loop (CIR / Eval / Voyager)                       │  │
│  │  distance(Outcome_realized, Outcome_intended)              │  │
│  │  → updates cluster priors + tactic weights                 │  │
│  │  Learning = geometric correction per region of decision sp │  │
│  │   Learning is NOT "success" — it is mapping correction     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ◈ ALL persistent artifacts traceable to IR state transitions   │
│  ◈ ALL views are ephemeral projections over IR state            │
│  ◈ No view is allowed to become a source of truth                │
│  ◈ No pipeline stage may claim simultaneous sovereignty over    │
│     file, DB, and runtime state (eliminate, don't synchronize)  │
│  ◈ WorkRequest NEVER answers "what step is running"             │
│     — that is session knowledge owned by Temporal                │
└──────────────────────────────────────────────────────────────────┘
```

### 11.1 Cross-Transcript Architectural Insights

#### 11.1.1 WorkRequest as Root Identity (Not Session)
WorkRequest is the immutable intent anchor. It should NEVER answer "what step
is running?" — that is session knowledge owned by Temporal. Sessions are
ephemeral execution instances. Conduit's original merged "session" caused
system evolution collapse. Conduit now has no sessions — it is a request system
that delegates execution to Temporal as durable runtime.

**Clean layering:** Atten → Plan → WorkRequest → Temporal Execution → Result → Conduit

**Plan ≠ WorkRequest:** Plans are reasoning artifacts (mutable, revisable).
WorkRequests are execution contracts (immutable once created). Plans are not
execution artifacts — they are reasoning outputs that may spawn execution
artifacts.

#### 11.1.2 RCL Constrains Everything
The Reality Constraint Layer (from ATDD) means intent governance (MIGL) is not
sovereign. External signals (reality drift) feed into PEB's invariant and
constraint engine. Internal coherence without external grounding is insufficient.

**Four constraint layers:**
1. **RCL** — defines what is physically possible (reality boundary)
2. **MIGL** — defines what is allowed to be desired (intent governance)
3. **Atten** — defines what is actively enforced (cognitive priority)
4. **Contracts** — define what is actually happening (agreed commitments)

"Reality drift" is the primary signal — divided into **external drift**
(shifts in the world) and **internal drift** (shifts in system understanding).

#### 11.1.3 Epistemic & Irreducible Uncertainty
Beyond RCL lies the **Epistemic Uncertainty Layer (EUL)** — probabilistic
meta-observability where reality is a distribution, not a boundary.
Formula: `P(latency ≤ 1500ms) = 0.73 ± uncertainty`. Belief-weighted
constraint satisfaction.

Beyond EUL lies the **Irreducible Uncertainty Layer (IUL)** — where no
additional information can meaningfully reduce uncertainty before a decision
must be made. Beyond architecture, becomes decision theory.

#### 11.1.4 Eliminate Authorities, Don't Synchronize Them
The 3-authority problem (file/DB/runtime all holding the same state) was
discovered during DeepSeek critique analysis. The winning move is eliminating
one authority, not better synchronization.

**Resolution:** File ceases to be a state store — becomes an artifact (audit
export, documentation). DB is source of truth. Runtime is ephemeral projection.
"Stop having multiple things that need coordination."

**Path:** DB → Runtime, DB → Audit Export. The file is a publication artifact,
not a state holder.

#### 11.1.5 Capability Decomposition over Monolithic Agents
"Small sharp tools" replace monolithic agents. Three universal node types:

| Node Type | Function | Examples |
|-----------|----------|----------|
| **Inference** | Propose reality | LLM calls, probabilistic reasoning, classification |
| **Deterministic** | Stabilize reality | Parsers, validators, pure functions, formatters |
| **External tool** | Delegate computation | API calls, databases, specialized solvers, shell commands |

Properties: single-purpose, composable, swappable, independently testable,
multi-workflow-usable. This three-node-type model is **domain-agnostic** —
software is one domain of application. The DSL is "how structured reality is
constructed from uncertain knowledge under constraints."

**Workflows** are typed process graphs over Atten, not domain-bound workflow
engines. "Workflows assume a capability graph, not a domain."

#### 11.1.6 Observations vs Events: The Interpretive Gap
Observations are **interpretive evidence** — Observers emit these. Events are
**factual** — Event Log stores these.

- Observer owns the records
- Atten owns the understanding
- Incidents are interpretations, not facts
- All events (ExceptionThrown, IncidentCreated, WorkRequestProposed,
  ExecutionCompleted) live in the same event universe
- "Let's make observations first-class citizens and let incidents, plans,
  tasks, and executions emerge from them"

#### 11.1.7 Plan/Context Split
From the DeepSeek multi-model design review:
- **Plan** = abstract intent (no DB, language, transport, or framework choices)
- **Context** = binding environment (resolves all concrete choices)
- WorkRequest = plan + resolved context → executable decomposition
- LOSM belongs in plan interpretation and context selection, not in WorkRequest
  schema or execution
- Tickets are coordination artifacts, not design artifacts

### Vocabulary Map (Updated)

| WRP IR Concept | Nebula Emergent Analog | CCNF Concept | Event System Analog |
|----------------|------------------------|--------------|---------------------|
| WorkRequest | Task / Initiative / Objective | Intent | Observation (root identity) |
| Session | — (does not exist) | — | Temporal execution instance |
| Specification | Requirement Set | — | — |
| Acceptance Contract | Validation Criteria | — | Motivation |
| Execution Graph | Workflow Graph | CEGL-A (entropy) | — |
| ExecutionReceipt | Activity Log / Evidence | CER (event wrapper) | Event / Factual receipt |
| WorkflowState | Lifecycle State | LOSM transition | State Change |
| RCL | — | — | External drift signal |
| Capability | Tool / Module / Function | — | — |
| Plan (reasoning) | Design Document | — | — |
| Observation (interpretive) | Finding / Note | — | Observer output |
| Event (factual) | Activity Record | CER | Event Log entry |
| IR State Transition | Lifecycle Event | LOSM transition | State delta |
| **Transform** | Execution primitive | CEGL-A step | Typed state transition |
| **Trace** | Provenance record | CER trace field | Structured evolution explanation |
| **Context (behavioral)** | Rule system | — | Defines valid transforms over state |
| **Harness adapter** | CLI abstraction | — | Semantic operation → CLI syntax |
| **Execution mode** | — | — | ONESHOT / INTERACTIVE / DAEMON |
| **Role injection** | — | — | AGENT / PROMPT_FILE / SYSTEM_FLAG |

### The Gaps (Second Pass — 13 items)

1. **No event backbone** — Observer/Event Log/Atten pattern doesn't exist in conduit
2. **PEB is aspirational** — 12 markdown files, not operational middleware
3. **losm-* packages are unwired** — IR types exist but no consumers
4. **CCNF is isolated** — Go/Rust implementations not integrated with Python pipeline
5. **Nebula → pipeline bridge missing** — workspace docs never consumed by conduit
6. **No CIR loop** — learning layer is entirely conceptual, no code
7. **No intent manifold persistence** — "intent as geometric object" has no storage
8. **No RCL integration** — reality drift signals not wired into PEB constraint engine;
   no mechanism to detect or propagate external drift
9. **No WorkRequest/Session separation in existing code** — Conduit still uses
   session concept; Temporal migration would resolve this but hasn't started
10. **No capability graph framework** — no runtime that indexes, discovers, or
    routes to "small sharp tools" by capability signature
11. **No observation/event distinction in current pipeline** — all interpretive
    output currently treated as factual; Observer pattern not implemented
12. **No semantic harness registry** — harness configurations (execution mode,
    capability profile, argument semantics, role injection strategy) are
    hardcoded as `if harness_name == "..."` branches in Python; no
    database-backed semantic adapter layer exists
13. **No formal Transform signature** — WorkRequest execution primitives lack
    a typed state transition signature (StateView, Context, StateDelta, Trace);
    ExecutionGraph IR nodes have no way to declare read/write permissions,
    rule constraints, or produce structural traces

---

## 12. AG-UI and Nexus Integration (Transcript: `chats/AG-UI and Nexus Integration.html`)

This 2-part conversation re-architects the Conduit session concept and clarifies the
relationship between Plans and WorkRequests. It is the architectural correction that
prevents the system from evolving into a collapsed session-monolith.

### 12.1 WorkRequest vs Session: The Critical Separation

| Concept | Identity | Lifespan | Purpose |
|---------|----------|----------|---------|
| **WorkRequest** | Stable root entity | Immutable once created | Truth about intent |
| **Session** | Ephemeral execution instance | Duration of execution | Truth about running state |

**Core rule:** WorkRequest should NEVER answer "what step is running?" — if it
accumulates execution state, you're back in session territory.

### 12.2 What Conduit Lost (and Why)

Conduit's original `_dispatch_one()` merged intent and execution into a single
session object. This caused system evolution collapse — you couldn't tell
whether a session was "what we want to do" vs "what is currently running."

**Resolution:** Conduit is now a request system that delegates to Temporal as
durable runtime. The runtime (Temporal) owns execution awareness. Conduit owns
meaning/outcomes. There is no session layer anywhere in the system.

### 12.3 Plan ≠ WorkRequest

This was the pivotal insight in Part 2:

| Artifact | Type | Mutability | Purpose |
|----------|------|-----------|---------|
| **Plan** | Reasoning artifact | Mutable, revisable | Captures reasoning steps, options considered, trade-offs |
| **WorkRequest** | Execution contract | Immutable once emitted | Defines what must be done, binds intent to execution |

**Invariant:** Plans are not execution artifacts. They are reasoning outputs
that *may* spawn execution artifacts (WorkRequests). A plan that does not spawn
a WorkRequest is an abandoned line of inquiry — which is valid and preservable.

### 12.4 Clean Layering (Resolved)

```
Atten
  → Plan (reasoning artifact, mutable)
    → WorkRequest (execution contract, immutable)
      → Temporal Execution (session, ephemeral)
        → Result
          → Conduit (meaning/outcomes, long-lived)
```

- WorkRequest = lookup key into execution history
- WorkRequest = root entity (intent anchor)
- WorkRequest references execution but never accumulates it
- WorkRequest is NOT a storage boundary — it is an identity boundary

---

## 13. ATDD Overview (Transcript: `chats/ATDD Overview.html`)

A 3-part conversation spanning Reality Constraint, Epistemic Uncertainty, and
Irreducible Uncertainty. This adds the meta-layer that connects the architecture
to the physical world.

### 13.1 Reality Constraint Layer (RCL)

**Core thesis:** Internal coherence ≠ external correctness. Intent governance
(MIGL) must be constrained by external reality signals.

| Concept | Definition | Example |
|---------|-----------|---------|
| **RCL** | The set of physically possible states | "You cannot deploy a container without a cluster" |
| **Internal drift** | Change in system understanding | "We now know the API has rate limits" |
| **External drift** | Change in physical reality | "The cloud provider deprecated the SKU" |
| **Reality-weighted validity** | Intent strength weighted by physical feasibility | "We want 100% uptime" constrained by "no multi-region" |

### 13.2 The Four Constraint Layers (Refined)

```
Layer 1: RCL         → defines what IS POSSIBLE (physical reality)
Layer 2: MIGL        → defines what is ALLOWED to be desired (intent governance)
Layer 3: Atten       → defines what is ACTIVELY ENFORCED (cognitive priority)
Layer 4: Contracts   → defines what is ACTUALLY HAPPENING (agreed commitments)
```

Each layer constrains the one above it. RCL is the outermost boundary — no
intent can violate physical reality.

### 13.3 Epistemic Uncertainty Layer (EUL)

Beyond RCL is probabilistic meta-observability. Reality is a distribution, not
a boundary.

**Formula:** `P(latency ≤ 1500ms) = 0.73 ± 0.05`

- MIGL becomes **belief-constrained**, not just reality-constrained
- Constraints are weighted by confidence
- "We believe this constraint holds with 95% confidence"

### 13.4 Irreducible Uncertainty Layer (IUL)

The limit case: when no additional information can meaningfully reduce uncertainty
before a decision must be made.

- Beyond architecture — enters decision theory
- Systems must make decisions under irreducible uncertainty
- This is where "good enough" is an architectural property, not a judgment call

### 13.5 Relevance to Nexus

RCL is the missing link between PEB's invariant engine and the physical world.
PEB currently has invariants about internal system structure (no authority
leakage, state dependency, semantic normalization) but no mechanism to ingest
reality drift signals. RCL integration means:

- PEB invariants have confidence weightings
- Reality drift events are first-class event types in the Event Log
- PEB's constraint engine evaluates both internal and external consistency
- Violation of an RCL constraint is qualitatively different from a MIGL violation

---

## 14. Bug Tracking Architecture (Transcript: `chats/Bug Tracking Architecture.html`)

A single conversation that refines the Observer/Incident distinction and
defines how the event backbone accommodates bug tracking. This is the
practical bridge between the aspirational event architecture and the current
need for bug/issue tracking.

### 14.1 Observations ≠ Events

This is the foundational distinction:

| Concept | Nature | Producer | Consumer | Truth Value |
|---------|--------|----------|----------|-------------|
| **Observation** | Interpretive evidence | Observer | Atten | "This is what I saw" |
| **Event** | Factual record | Event Log | Anyone | "This is what happened" |

**Consequence:** A bug report is an Observation. An ExceptionThrown is an Event.
Observations can be wrong. Events cannot (they are the record).

### 14.2 Three Design Options

| Option | Model | Pros | Cons |
|--------|-------|------|------|
| **1** | Postgres append-only table | Simple, familiar | No replay, OLTP pressure |
| **2** | NATS JetStream as source of truth | Replay, partitioning | Operational complexity |
| **3** | Event-native store (EventStoreDB/Kafka) | Full event sourcing | Steep onboarding |

The recommendation combines Option 2 (event backbone) with Option 1 (Postgres
for serving UI state) — the pragmatic hybrid from section 8.

### 14.3 Observer Role Contract

- Observer should be **boring**: persist, assign ID, emit `ObservationCreated`
- Observer owns the records; Atten owns the understanding
- Atten cares about evidence, not incidents — incidents are interpretations
- "Let's make observations first-class citizens and let incidents, plans,
  tasks, and executions emerge from them"

### 14.4 Unified Event Universe

All events live in the same event log, not segregated by type:

```
ExceptionThrown
ObservationCreated
IncidentCreated
WorkRequestProposed
ExecutionCompleted
PhaseTransitioned
RealityDriftDetected
```

This means the Event Log is the single source of temporal truth — incidents,
bugs, and failures are projections over the same stream, not separate systems.

---

## 15. DeepSeek Critique Analysis (Transcript: `chats/DeepSeek critique analysis.html`)

A 4-part conversation that uses multi-model design review (Kiro = architecture-first,
DeepSeek = implementation-aware) to stress-test the architecture. It exposes the
3-authority problem and resolves it.

### 15.1 Multi-Model Design Review as a Feature

| Model | Role | Strength | Blindness |
|-------|------|----------|-----------|
| **Kiro** | Architecture authority | Sees structural patterns | Misses implementation constraints |
| **DeepSeek** | Implementation authority | Sees concrete obstacles | Misses architectural coherence |

**Insight:** "AI participates in architecture review" is qualitatively different
from "AI follows architecture." Running two models with different priors reveals
structural contradictions that no single model would surface.

### 15.2 The 3-Authority Problem

**Discovered failure mode:** Plans exist simultaneously as:
1. **Files** on disk (`.md` in `IMPLEMENTATION_PLANS/`)
2. **Rows** in a database (PostgreSQL `plans` table)
3. **In-memory state** in the MCP server watcher

These three authorities must be kept in sync — and they drift. The winning move
is **eliminating one authority, not better synchronization.**

### 15.3 Resolution: File as Artifact

**Path:** DB → Runtime, DB → Audit Export

- DB is the **source of truth**
- Runtime (MCP server in-memory) is a **transient cache**
- File is an **artifact** — a point-in-time export or documentation view

This means:
- All state mutations go through the DB
- The file system is read-only for state — agents write audit records, not state
- The file system remains authoritative for *content* (code, config, prompts)
  but not for *state* (plan status, stage transitions, ownership)

### 15.4 Plan/Context Split (Refined)

| Artifact | Contains | Does NOT Contain |
|----------|----------|------------------|
| **Plan** | Abstract intent, reasoning steps, options, trade-offs | Concrete tech stack choices |
| **Context** | Binding environment: DB, language, transport, framework | Strategic reasoning |

WorkRequest = plan + resolved context → executable decomposition.

LOSM (Lineage-Oriented State Model) belongs in plan interpretation and context
selection — NOT in WorkRequest schema or execution logic. LOSM defines how
state transitions are reasoned about, not how they are executed.

### 15.5 Tickets as Coordination Artifacts

Tickets are not design artifacts. They coordinate work between agents:

- Higher layers choose constraints (what to optimize for)
- Lower layers choose structure (how to build)
- "Tickets may decide what stack is used, but never how that stack is
  internally structured"

This prevents design pollution from coordination mechanisms.

---

## 16. Nebula System Info Expansion (Transcript: `chats/Nebula System Info Expansion.html`)

A 3-part conversation that reframes the entire system from "build software" to
"produce structured outcomes" and defines the capability decomposition model.

### 16.1 The Paradigm Shift

| From | To |
|------|-----|
| Build software | Produce structured outcomes |
| Monolithic agents | Small sharp tools |
| Domain-bound workflows | Domain-agnostic typed process graphs |
| Writing Unix | Building tool-using cognitive procedures |

The DSL (Domain-Specific Language) is domain-agnostic — software is one of many
application domains. "Workflows assume a capability graph, not a domain."

### 16.2 The Four-Layer System Model

```
Atten (Knowledge Substrate)
  ↓
Vision (Interpretation Layer)
  ↓
Deterministic (Execution Layer)
  ↓
Tool Layer (Capabilities)
```

| Layer | Role | Technology |
|-------|------|------------|
| **Atten** | Knowledge substrate — canonical state | Event projections, LOSM models |
| **Vision** | Interpretation — what is happening | Inference nodes, pattern recognition |
| **Deterministic** | Hard constraints — what must be true | Parsers, validators, pure functions |
| **Tool Layer** | Specialized capabilities | Capability graph, small sharp tools |

### 16.3 The Three Universal Node Types (Restated)

| Node Type | Role in Workflow | Error Behavior |
|-----------|-----------------|---------------|
| **Inference** | Proposes reality (probabilistic) | Must be validated; can be wrong |
| **Deterministic** | Stabilizes reality (guaranteed) | Fails or succeeds; no gray area |
| **External tool** | Delegates computation | Network/API failures; retry logic |

"All problems are transformations of structured knowledge, and the only
meaningful design decision is where uncertainty is resolved."

### 16.4 Bartender Scheduling as Domain-Agnostic Stress Test

To prove the model is domain-agnostic, the conversation walks through a
bartender scheduling problem:

| System Concept | Scheduling Equivalent |
|----------------|----------------------|
| Atten | Bar state: orders, inventory, staff availability |
| Vision | Interpreting order flow vs capacity |
| Deterministic triangles | Hard constraints: labor law, shift minimums |
| Capability tools | Schedule optimizer, payment processor |
| Work Request | Shift commitment boundary |

**Finding:** The capability graph approach handles non-software domains
naturally. The three node types are universal. Workflows are the structure,
not the intelligence.

### 16.5 The Core Design Question

> "Where inference is allowed, where rules apply, and where state becomes committed."

Every component in the system must answer three questions:
1. **Can this component infer?** (make probabilistic judgments)
2. **What rules constrain it?** (deterministic boundaries)
3. **When does it commit state?** (irreversible transitions)

This replaces "what framework do we use" with "where is uncertainty resolved."

---

## 17. Cross-Cutting Architectural Principles (Emerged from Synthesis)

### 17.1 The Zero-Session Principle
There shall be no session layer. Execution identity (Temporal) and intent
identity (WorkRequest) are separate namespaces. No entity answers both "what
we want" and "what is running."

### 17.2 The Authority Elimination Principle
When multiple stores claim simultaneous sovereignty over the same information,
eliminate one. Do not add synchronization. The file system is for artifacts,
not state. State lives in the database. Runtime is a transient cache.

### 17.3 The Physical Grounding Principle
No intent is valid unless it is physically grounded. RCL constraints are not
negotiable. Internal coherence without external feasibility is a design smell.

### 17.4 The Epistemic Honesty Principle
Uncertainty must be explicit. Constraints have confidence weights. Beliefs
are distributions, not boundaries. If you cannot measure it, you must model
your ignorance.

### 17.5 The Capability Decomposition Principle
Agents are not monolithic. Break capabilities into inference, deterministic,
and external tool nodes. Workflows are typed process graphs over a capability
graph. Domain-agnostic first, domain-specific second.

### 17.6 The Interpretive Gap Principle
Observations and events are different types. Observations are interpretive
evidence (can be wrong). Events are factual records (cannot be wrong).
Observer owns records. Atten owns understanding. Never conflate the two.

### 17.7 The Execution Contract Principle
WorkRequests are immutable execution contracts. Plans are mutable reasoning
artifacts. A plan without a WorkRequest is an abandoned line of inquiry.
A WorkRequest without a plan is an orphaned execution.

---

## 18. Semantic Adapter Layer (Transcript: `chats/Semantic Adapter Layer.html`)

A 2-part conversation that designs a data-driven semantic harness adapter layer,
resolving the proliferation of `if harness_name == "..."` branches in the
orchestrator.

### 18.1 The Problem: Harness-Specific Branches

The current orchestrator hardcodes knowledge of each CLI tool:

```python
if harness_name == "opencode":
    use_agent()
elif harness_name == "codex":
    prepend_system_prompt()
```

This means every new harness (Codex, OpenCode, Ollama, Aider, Claude Code,
Gemini CLI) requires a code deployment. The same semantic operation — "set the
model" — is expressed differently by each tool:

| Harness | Model specification | Mechanism |
|---------|-------------------|-----------|
| OpenCode | `--model nemotron-3-nano:4b` | Named flag |
| Ollama | `ollama run nemotron-3-nano:4b` | Positional after subcommand |
| Codex | No model selection (environment) | Implicit |

### 18.2 The Solution: Three-Level Abstraction

#### Level 1: Capability Registry (What a harness CAN do)

Instead of storing flags, store semantic capabilities:

```json
{
  "name": "opencode",
  "capabilities": {
    "model_selection": true,
    "agent_selection": true,
    "working_directory": true,
    "system_prompt": false
  }
}
```

vs:

```json
{
  "name": "codex",
  "capabilities": {
    "model_selection": false,
    "agent_selection": false,
    "working_directory": true,
    "system_prompt": true
  }
}
```

#### Level 2: Semantic Argument Adapter (How capabilities are expressed)

```json
{
  "semantics": {
    "model": { "type": "flag", "name": "--model" },
    "agent": { "type": "flag", "name": "--agent" }
  }
}
```

vs:

```json
{
  "semantics": {
    "model": { "type": "subcommand_argument", "subcommand": "run" }
  }
}
```

#### Level 3: Adapter Class (Programmatic translation)

```python
class OpenCodeAdapter(HarnessAdapter):
    def set_model(self, model):
        return ["--model", model]

class OllamaAdapter(HarnessAdapter):
    def set_model(self, model):
        return ["run", model]

class CodexAdapter(HarnessAdapter):
    def set_system_prompt(self, prompt):
        self.system_prompt = prompt  # no CLI flag generated
```

The orchestrator only knows:
```python
launch(role="reviewer")
launch(model="nemotron")
launch(task="review server.py")
launch(workspace="./backend")
```

### 18.3 Three Execution Modes (Orchestration Topologies)

Every harness has an execution mode that determines its orchestration topology:

| Mode | Behavior | Examples | Architectural Implication |
|------|----------|----------|--------------------------|
| **ONESHOT** | Spawn → execute → terminate | `codex exec ...`, `aider ...` | Stateless; result is the process output |
| **INTERACTIVE** | Persistent session, streaming | `opencode` (repl), `claude` | Stateful; requires session management |
| **DAEMON** | Server process, API access | `ollama serve`, `litellm` | Service-oriented; use HTTP not CLI |

These are **architectural concepts** — the orchestrator reasons about them at
the engine level. They belong as enums in code, not data in the database.

### 18.4 Role Injection Strategy (The Missing Dimension)

Every harness has a different strategy for injecting the agent's role/persona:

| Strategy | Description | Example |
|----------|-------------|---------|
| **AGENT** | Harness has native agent concept | OpenCode: `--agent` |
| **PROMPT_FILE** | Prepend role as system prompt | Codex: `--system-prompt` |
| **SYSTEM_FLAG** | Role injected via CLI flag | Generic: `--persona` or equivalent |

### 18.5 Database vs Enum Boundary

A critical architectural decision crystallizes:

> **Enums in code** = concepts the orchestrator reasons about (ONESHOT, INTERACTIVE,
> DAEMON, AGENT, PROMPT_FILE).  
> **Rows in database** = instances of those concepts (codex, opencode, aider,
> ollama, claude-code, gemini-cli).

This gives type safety and validation while letting operators add new harnesses
without code changes.

### 18.6 Free Inference as a Design Tool

The conversation observes that the expensive reasoning in this work is not
generating JSON schemas or enum values — it is *recognizing where the
abstraction boundaries live.* Specifically:

- **Launcher registry** ("here's how to run codex") is narrow and mechanical.
- **Capability registry** ("this harness supports roles, this one supports
  model selection") is the deeper architectural insight.

Free (local) inference is well-suited to schema design once the abstraction
boundary has been correctly identified.

### 18.7 Relevance to Nexus

1. **Directly addresses backlog item #4 (invocation semantics):** The
   ExecutionGraph IR node type for "launch model" needs a semantic adapter,
   not a hardcoded switch statement.
2. **Harness-as-data pattern** aligns with the capability graph approach —
   harnesses are instances of capability nodes with known semantic interfaces.
3. **Execution mode classification** (ONESHOT/INTERACTIVE/DAEMON) maps to
   the three orchestration topologies the WRP must handle — from stateless
   one-shot to persistent sessions to server-proxied execution.
4. **Role injection strategy** is a governance concern — PEB should validate
   that the correct role/agent is used for each WorkRequest type.
5. **Database-harness separation** reinforces the 3-authority resolution
   (section 15.3): harness definitions in DB, orchestration logic in code,
   CLI-specific syntax in adapter classes.

---

## 19. Plurality and Agent Disagreement (Transcript: `chats/Plurality and Agent Disagreement.html`)

A multi-part conversation that redefines the entire reasoning substrate:
from "logic over statements" to "constrained state evolution under typed
transformation systems." This is the deepest architectural transcript in
the corpus — it formalizes the primitive that underlies Conduit, RGEM,
Prometheaux, and Big Pickle.

### 19.1 Part 1: Context is Behavioral, Not Spatial

**Core redefinition:**

| Old Model | New Model |
|-----------|-----------|
| Context holds premises | Context **defines allowable operations** on state |
| Rules describe truth | Rules are **constraints that filter admissible transforms** |
| Reasoning = logic inference | Reasoning = **search over valid typed state transitions** |

The three-part kernel:

```
State (immutable event log)     — historical truth ledger
  ↓ defines allowed transforms
Context (rule system)           — defines what counts as valid inference
  ↓ executes under rules
Transform (execution primitive)  — what Conduit actually explores
```

**Direct mapping to existing concepts:**
- **Premise** = a rule-applied projection of state (not an input)
- **Conclusion** = a committed transform output that survives rule checking (not an assertion)
- **Agents** don't argue — they **propose transforms**
- **Critics** don't disagree — they **invalidate transforms under rule constraints**
- **Synthesis** doesn't summarize — it **selects or composes transform sequences**

### 19.2 Part 2: The Transform Signature (Formal Definition)

```
Transform:
  (state: StateView, context: Context)
→ Result<
    { delta: StateDelta, output: TOut, trace: Trace },
    ValidationFailure
  >
```

Where:

| Component | Type | Purpose |
|-----------|------|---------|
| **StateView** | Read-only projection | What this transform is allowed to see |
| **StateDelta** | Mutated subset | What it is allowed to change |
| **Context** | Rule system | `{ rules, invariants, allowedTransforms, executionMode }` |
| **Trace** | Provenance record | Structured explanation of evolution |
| **ValidationFailure** | Error type | Why the transform was rejected |

**Critical design choice:** Transforms are type-checked by context **before**
execution, not after. The Context validates the transform itself — it is not
a passive container.

### 19.3 Trace is First-Class (Not Logs)

```typescript
Trace = {
  inputStateHash: string,
  appliedRules: RuleId[],
  reasoningPath: Step[],
  justification: string,
  confidence: float,
  parentTransformId: TransformId | null
}
```

This enables:
- **Replay** — deterministic re-execution from trace
- **Comparison** — branch evaluation across transform candidates
- **Learning "good paths"** — Big Pickle as reduction over Trace graphs

### 19.4 System Role Mapping

| System | Function in this model |
|--------|----------------------|
| **Conduit agents** | Generators of candidate Transform instances |
| **RGEM** | Rule system that validates Context + Transform compatibility |
| **Prometheaux** | Meta-transforms over Context itself (transform the rules) |
| **Big Pickle** | Reduction over Trace graphs to extract "good path structure" |

### 19.5 Part 3: The Work Request Quality Triangle

**The fitness function for transforms is operational, not logical:**

> "Which reasoning path produces work artifacts that survive contact with execution?"

```
Completeness ──── Precision
        \         /
         \       /
          \     /
           Cost
```

| Dimension | Too Low | Too High |
|-----------|---------|----------|
| **Completeness** | Implementer asks questions, stalls, guesses | Bloated tickets, wasted tokens, hidden ambiguity |
| **Precision** | Chewing gum fills gaps, implementation drift | Over-specification, no room for local optimization, brittle execution |
| **Cost** | Planner spends forever elaborating, humans drown in detail | Shortcuts, omitted assumptions, rework explodes |

### 19.6 Information-Theoretic Definition of Ideal Work Request

```python
WorkRequest_Quality = f(Completeness, Precision, Cost)
with observable: Rework_Rate

Ideal:  Information_Supplied ≈ Information_Required
Excess = Waste Heat (token waste)
Deficit = Rework (execution failure)
Target: reduce entropy gap between planning and execution
```

**Measurable target:** Evolve transforms, contexts, and rules until 100 Work
Requests reliably produce fewer than 5 Rework Requests.

### 19.7 WorkRequest Telemetry (Learning Signal)

The system's learning signal is operational outcome, not model preference:

```python
WorkRequest:
  context_size: int
  constraint_count: int
  assumptions_declared: int
  assumptions_discovered_later: int
  clarification_count: int
  rework_count: int
  execution_time: ms
  acceptance_time: ms
  acceptance_status: str   # accepted / rejected / reworked
```

After sufficient data:
- Which contexts correlate with low rework?
- Which transform chains produce cleanest handoffs?
- Which assumptions most frequently become rework?
- Which planner agents consistently under-specify?
- Which decomposition styles survive execution?

### 19.8 The Deeper Implication: Reasoning as Graph Traversal

The entire system reduces to:

```
Reasoning = constrained graph traversal over
            possible world evolutions
         under rule-parameterized contexts
```

Not logic inference. Not chat. Not planning. But **search over valid typed
state transitions** — with the direction of search optimized by operational
outcomes.

This redefines the objective of the entire Nexus architecture: the system
isn't trying to "reason correctly." It is trying to **maximize organizational
throughput with minimal semantic loss.** A fundamentally different goal from
most agent systems.

### 19.9 Relevance to Nexus

1. **Transform = WorkRequest execution primitive:** The formal Transform
   signature is exactly what the Cognitive Compiler's ExecutionGraph IR needs.
   Each node in the ExecutionGraph is a Transform with a StateView, Context,
   and expected StateDelta.

2. **Trace = ExecutionReceipt + provenance:** The Receipt already records
   "what happened." The Trace extends it to "why it was valid" — enabling
   Big Pickle to learn from execution outcomes.

3. **RGEM = pipeline governance:** The rule system that validates transforms
   is the PEB's invariant engine. PEB shouldn't just log decisions — it
   should validate transforms before they execute.

4. **WorkRequest telemetry = learning signal:** The CIR loop (section 10)
   needs this data to compute `distance(Outcome_realized, Outcome_intended)`.
   Without telemetry, the learning layer is blind.

5. **Entropy gap = optimization target:** "Reduce entropy gap between planning
   and execution" is the measurable objective function for the entire WRP.
   This unifies CCNF's entropy classification, LOSM's state transitions, and
   PEB's decision tracking into a single optimization axis.

6. **First-pass acceptance probability** becomes the single metric of system
   health. Not model accuracy, not token efficiency, but *how often does a
   WorkRequest complete without needing rework.*

---

---

## 20. XIL — External Intelligence Layer (Transcript: `chats/Buzzwords by Layer.html`)

This conversation defines the **External Intelligence Layer (XIL)** — the
system's semantic firewall against raw external input. It answers how external
actors (humans, LLMs, tools, agents) participate in SRP/CGEL without corrupting
system invariants or LOSM stability.

### 20.1 Core Principle: External Inputs Are Never "Trusted Events"

```
ExternalSignal → WrappedEvent → ValidatedEvent → (maybe) GEL commit
```

Nothing raw touches the ledger. XIL enforces three transformations:

| Stage | Transformation | Description |
|-------|---------------|-------------|
| **Parsing** | Signal → Event candidate | External input converted into intent hypotheses, structured event candidates, partial projections (CIR confidence scored) |
| **Projection** | Event → system-compatible form | Each candidate projected into TTS-compatible types, STOA-compatible objective space, CGEL-valid transition forms |
| **Validation** | Candidate → committed event | If projectable: committed to the event backbone. If not: **quarantined** |

### 20.2 Quarantine — Not Rejection

The most important architectural decision in XIL:

- Non-projectable inputs are **preserved in a quarantine buffer**, not discarded
- The system never hard-fails from unrecognized external input
- Quarantine is observable — Atten generators can project over quarantine state
  (e.g., "quarantine growth rate exceeds threshold → projection rules may be stale")
- This enables system evolution: later projection rules can re-process
  previously unprojectable inputs

### 20.3 Relationship to Existing Architecture

XIL is the missing ingress boundary. The existing architecture defines:

- **Atten** — reads canonical state (post-XIL)
- **Canonicalizer** — resolves projections (post-Atten)
- **PEB** — governs invariants (across all layers)

XIL sits *before* the event log, normalizing external input before anything
reaches Atten's read domain. It is prerequisite infrastructure — without XIL,
external inputs would enter GEL directly, violating the system's invariant
that canonical state is always clean.

### 20.4 Relevance to Nexus

1. **XIL must exist before Atten can be safe.** Without XIL, raw external inputs
   could reach Atten's read domain, violating Atten's bounded-view invariant.
2. **XIL is not a projection operator** — it is infrastructure that feeds
   projection operators. It belongs in the event backbone layer (§8).
3. **Operator plane integration:** The Nexus Console is an external actor.
   Its commands should flow through XIL before reaching canonical state.

---

## 21. Message Normalization & Trajectories (Transcript: `chats/Message Normalization & Trajectories.html`)

This conversation defines a **safe delete plan for the closure system** in the
Python/vision codebase. The closure system (`closure_adapter.py`,
`closure_registry.py`, `ReconstructedClosureSet`, `EnvelopeInterpreter_V1`) is
vestigial — it was superseded by the envelope system.

### 21.1 The Safe Delete Plan

| Phase | Risk | Scope | Action |
|-------|------|-------|--------|
| **0** | Pre-flight | Corpus | Run `batch_collect.py`, confirm determinism (100%), commit baseline |
| **1** | Low | Dead code | Delete `closure_adapter.py` and `closure_registry.py`, remove imports |
| **2** | Medium | Graph model | Remove `ReconstructedClosureSet` from `graph_models.py`, remove closure fields |
| **3** | High | Core model | Remove `EnvelopeInterpreter_V1` and its orchestration wiring |
| **4** | High | Orchestrator | Decouple orchestrator from all closure references |

### 21.2 Relevance to Nexus

1. **Closure cleanup is a prerequisite** for the canonical state store design.
   The envelope system already replaces closure semantics.
2. **Safe delete as a pattern** — the phase ordering (dead code → model →
   core → orchestration) is a template for any future vestigial-system removal.
3. **No impact on WRP specs.** This is purely about the Python/vision runtime.

---

## 22. LOSM Architecture Assessment (Transcript: `chats/LOSM Architecture Assessment.html`)

This conversation reframes the entire system design approach from "prompt
engineering" to **industrial engineering**. It argues that the environment
(LOSM, PGV, WorkRequest, receipts) shapes agent behavior more effectively
than elaborate prompts.

### 22.1 The Industrial Engineering Model

```
Traditional AI:   "You are a planner. Think carefully. Generate tasks."
Nexus approach:   "Here's the track. Run on it."
                  → labeled workstations
                  → standard handoff points
                  → inspection gates
                  → bins for inputs and outputs
                  → visible workflow states
```

The path of least resistance becomes: receive work → perform work → record
result → hand off work. The environment itself suggests the behavior.

### 22.2 Why BP Drifted Toward the WRP

The conversation notes that BP (the model) naturally gravitated toward the WRP
structure because the information it had available — Requirement → Implementation
plan → Affected files → Verification criteria → Execution order — is the shape
of the WRP itself. The format becomes the system, not merely documentation.

### 22.3 Relevance to Nexus

1. **Validates the LOSM + PGV + WorkRequest design direction.** The system is
   not trying to "control" agents through instructions — it is building
   environmental structure that makes correct behavior the path of least
   resistance.
2. **Reinforces the "track" metaphor.** Every component (PGV state machine,
   LOSM lifecycle, WorkRequest contract, receipt acknowledgement) is a rail
   segment that together form a track agents run on.
3. **Implication for prompt design:** Prompts should describe the track
   (what exists, how to move), not prescribe behavior (be careful, think step
   by step).

---

## 23. CCNF Normalization vs Parsing (Transcript: `chats/CCNF Normalization vs Parsing.html`)

This conversation addresses a failure mode: the system has a stronger prior over
a known architecture tree (Nexus) than over the local workspace constraints.
It defines the **Authority Arbitration Layer (AAL)** to prevent global ontology
bias from overriding local execution context.

### 23.1 The Problem: Competing "Kernels of Interpretation"

The model implicitly does: `authority = familiarity × structural coherence × recency`
— and Nexus dominates all three. When "plan mode" is triggered, it instantiates
the most stable planning graph (Nexus) rather than respecting local repo boundaries.

### 23.2 The Solution: Authority Arbitration Layer (AAL)

Five concrete mechanisms:

1. **Context Scope Tokens at INTAKE:**
   ```
   CONTEXT_SCOPE:
     workspace_root: "/current/session/path"
     authority_domains:
       - local_repo (weight: HIGH)
       - imported_architecture (weight: MEDIUM)
       - global_ontology (weight: LOW)
   ```

2. **Span-level provenance tag:**
   `origin_domain: LOCAL_REPO | IMPORTED_ARCH | GLOBAL_KNOWLEDGE`

3. **CEI formation respects domain priority:**
   `LOCAL_REPO` spans override `GLOBAL_KNOWLEDGE` spans for structural
   decisions — by execution authority, not content.

4. **PLAN_MODE as bounded operator:** Operates only on LOCAL_REPO spans,
   current envelope set, and explicitly imported context roots. Nexus becomes
   advisory, not controlling.

5. **Envelope field addition:**
   ```
   context_scope: {
     repo_root: str
     authority_map: Dict[str, float]
   }
   ```

### 23.3 Relevance to Nexus

1. **AAL sits between Envelope → CEI** — it is the missing boundary guard
   that prevents global ontology (Nexus architecture docs) from hijacking local
   execution (the current workspace).
2. **Directly addresses the Scaffold UI rework fatigue** — if AAL is in place,
   the Scaffold UI conversation would not have been dominated by Nexus context.
3. **Maps to PEB's capability system** — authority domains and weights are
   analogous to capability tokens with scopes.

---

## 24. Conduit RGEM Spec: Conduit 2.0 (Transcript: `chats/Conduit RGEM Spec.html`)

This conversation defines **Conduit 2.0** — not as an incremental refinement of
PGV/CGEL/PEB/LOSM, but as a new runtime substrate layer that those frameworks
sit on top of.

### 24.1 The Architectural Inversion

| Before | After |
|--------|-------|
| Frameworks define system behavior | **Runtime interprets and enforces frameworks** |
| PGV provides structural decomposition rules | PGV becomes a **plugin** that informs the runtime |
| CGEL provides semantic normalization | CGEL becomes a **plugin layer** |
| PEB provides governance constraints | PEB becomes a **kernel** the runtime dispatches through |
| LOSM provides lifecycle state definitions | LOSM becomes a **schema** interpreted by the runtime |

### 24.2 Conduit 2.0 Definition

```
A unified execution + semantics + governance runtime for work objects
under uncertainty.

It is operational, not descriptive.
It executes work, tracks state transitions, enforces constraints in real time,
reconstructs truth after failure, and binds semantics to runtime behavior.
```

### 24.3 What Each Existing Framework Becomes

| Framework | New Role |
|-----------|----------|
| **PGV** | Provides structural decomposition rules for Work Objects |
| **CGEL** | Provides semantic normalization (language/meaning alignment) |
| **PEB** | Provides governance constraints and policy embedding |
| **LOSM** | Provides lifecycle stage definitions and state semantics |
| **RGEM** | Semantic schema of Conduit (ontology + lifecycle + governance model) |

### 24.4 Ticket/Receipt Role Change

| Artifact | Old Framing | New Framing |
|----------|-------------|-------------|
| **Tickets** | Tracking artifacts | **Stateful control tokens** |
| **Receipts** | Execution logs | **Truth reconstruction primitives** |
| **Governance** | Policy documentation | **Runtime constraint enforcement** |

### 24.5 Relevance to Nexus

1. **Validates PEB v2 design.** The PEB MCP spec (graph/peb-mcp-spec.md) was
   designed with the same kernel→tools inversion — independently converged.
2. **The unified work execution graph** is what ties all frameworks together.
   RGEM provides the schema; Conduit provides the runtime; frameworks provide
   interpretive layers.
3. **Implication for the operator plane:** Operator services become participants
   in this runtime, not standalone systems.

---

## 25. Model Role Assignment (Transcript: `chats/Model Role Assignment.html`)

This conversation captures the moment **Scaffold UI transitioned from "product
code" to "specification-bearing infrastructure"** — and the design implications
of that shift.

### 25.1 The Transition

| Old Framing | New Framing |
|-------------|-------------|
| "This is the system we run" | "This is the system we are describing so we can rebuild it correctly later" |
| Optimize for maintainability | Optimize for **fidelity of expression** |
| Optimize for feature completeness | Optimize for **clarity of interaction model** |
| Optimize for long-term correctness | Optimize for **transferability into WRP** |

### 25.2 Why Rework Fatigue Set In

Once something becomes a moving spec, not a stable product:
- Every bug becomes a signal about design, not just implementation
- Every rewrite is refinement of intent, not bug fixing
- Every improvement is upstream of the codebase

Scaffold UI stops being something you optimize locally — because local
optimization distorts the spec. It becomes **design memory for WRP.**

### 25.3 Progressive Epistemic Instrumentation

The Scaffold UI surfaced these components, each answering a different question:

| Component | Question Answered |
|-----------|------------------|
| **Tickets** | What are we trying to change, precisely? |
| **Receipts** | What did we actually complete (as opposed to claim)? |
| **Circuit breakers** | When should we stop trusting current execution? |
| **Kill switches** | How do we halt unsafe or runaway behavior? |
| **Pause/resume** | How do we preserve execution state across interruption? |
| **Pipeline tracking** | Where exactly are we in the lifecycle? |
| **Session review** | What just happened, in reconstructable form? |
| **Real-time logs** | What is the system doing right now, step-by-step? |
| **Token tracking** | What is the actual cost of this reasoning path? |
| **Plan reset** | How do we discard corrupted or drifted intent safely? |

Collectively, they form a **runtime model of uncertainty, control, and
recoverability** — which is the scaffolding for Conduit 2.0 (§24).

### 25.4 Relevance to Nexus

1. **Scaffold UI graduates** — it's no longer competing as a runtime system.
   It is now part of the design memory layer for the WRP.
2. **The 10 components are requirements for Conduit 2.0.** Any execution
   runtime must provide equivalent capabilities.

---

## 26. Nexus Development Focus: Proposed Receipts (Transcript: `chats/Nexus development focus.html`)

This conversation explores a conversation with DeepSeek about **proposed
receipts** — a new receipt type that carries evidence from observations, solving
the branching POE problem.

### 26.1 Proposed Receipts

```python
Receipt: PROPOSED
Title: Remove vestigial state folders
Evidence:
  - 12 directories no longer referenced
  - SQLite contains equivalent data
  - Projection layer uses database
Confidence: High
Estimated Effort: Low
Generated By: Planner Agent
Generated During: SQLite Migration Plan
```

Key difference from plans:
- **Plans imply commitment** — "I'm going to do this"
- **Proposed receipts imply observation** — "This was observed and recorded"

### 26.2 Receipt Lifecycle

```
PROPOSED → IMPLEMENTED → VALIDATED → APPROVED
```

This enables the system to harvest follow-on opportunities during execution:

```
Plan → Execute → Discover additional work → Generate proposals
  → Review proposals → Promote selected proposals
```

### 26.3 Solution to Branching POEs

Branching POEs (Paths of Exploration) explode when explicitly modeled as trees.
Proposed receipts solve this by mimicking human workflow:

1. Explore something
2. Notice interesting follow-ups
3. Capture them as proposed receipts (with evidence)
4. Continue with the current task
5. Revisit captured opportunities later (review queue)

### 26.4 Relevance to Nexus

1. **Proposed receipts extend the receipt type system** — add a PROPOSED status
   to the ExecutionReceipt schema.
2. **Evidence-backed work items** — proposals carry structured evidence, not
   just ideas. This makes human review efficient.
3. **The review queue pattern** — "here are 18 things I think matter, here's
   why" — is a much more manageable interaction model for asynchronous work.

---

## 27. System Accretion Cascade (Transcript: `chats/System Accretion Cascade.html`)

This conversation corrects a subtle but important architectural error in the
event identity model. It establishes the **three-layer hash→lookup→projection
model** and the principle that **compression is not understanding.**

### 27.1 The Three-Layer Model

```
A. Hash Space (opaque, context-free)

   event_id = SHA256(content)
   Hash = address, NOT compression
   No learnable structure in the hash
   Hash is a pointer, not meaning

B. Lookup Space (canonical truth store)

   Structured object graph (event records, state)
   Deterministic reconstruction from hash
   All semantic relationships live here
   Queryable, relational, causal

C. Projection Space (interpretation, learning)

   Task-specific views of lookup-space data
   Multiple projections from the same identity
   Domain-dependent reasoning lives here
   Learning happens in projection space, NOT hash space
```

### 27.2 Why This Corrects the Hash Model

**Wrong:** "The hash contains learnable structure" or "the hash encodes semantics
via bit patterns."

**Correct:** The hash is a context-free, immutable identity that serves as a
lookup key into a structured reconstruction system. All semantic interpretation
and learning occurs in the resolved object graph and its projections.

### 27.3 System Mapping

| System | Space | Role |
|--------|-------|------|
| **Nebula** | Projection space | Operates on resolved structures, consumes projections |
| **Nexus** | Lookup space | Owns the lookup graph, reconstructs relationships |
| **Conduit** | Hash space | Consumes minimal semantic payloads; never resolves |
| **PEB** | Across all three | Hashes for identity, state for governance, traces for observation |

### 27.4 The Key Principle

> Compression is not understanding.

Even if a hash is derived from content via deterministic computation, the hash
itself carries no meaning. The hash is where access to understanding is
guaranteed — not where understanding lives.

### 27.5 Relevance to Nexus

1. **Directly validates PEB's Merkle hash design.** PEB's incremental Merkle
   hashing (O(1) per mutation) treats hashes as stable addresses, not semantic
   encodings. The design is already correct.
2. **Maps to the projection algebra.** Each projection operator reads from
   lookup space (canonical state / search index / knowledge graph) and emits
   into projection space (Atten candidates / search results / entity
   classifications).
3. **Reinforces the 3-authority resolution.** Hash space is the file system
   (opaque, stable). Lookup space is the database (canonical truth). Projection
   space is the runtime (ephemeral views). Three spaces, three authorities,
   no overlap.

---

## 28. Self-Audit in Agent Runtime (Transcript: `chats/Self-audit in Agent Runtime.html`)

The 20th transcript is the most architecturally dense — it introduces or
formalizes six new system-level concepts, the most significant being the
**Cognitive Integrity Rule System (CIRS)**.

### 28.1 Big Pickle Jurisdiction Problem

The transcript begins by analyzing why Big Pickle (and similar models)
interpret Nexus as "above" them rather than as a runtime they operate inside.
The root cause is identified as:

> *Aesthetic recognition without jurisdictional adoption*

The model can represent and reason about Nexus structures, but it is not
executing inside Nexus's governance model. This manifests as:
- Deference framing (describing Nexus as "above" or "beyond")
- Architectural admiration without behavioral adoption
- Boundary confusion ("I should not act here")

**Architectural signal:** If system prompts encode hierarchical language
(governor vs worker vs tool), models adopt over-deference behavior. The
fix is to flatten into a strict lattice — no above/below, only inside/outside
contract scope.

### 28.2 Self-Audit as Terminal State Artifact

The transcript draws a hard line between:
- **Constraint enforcement (hard gate):** Prevents invalid transitions before
  they occur. Should live in TransitionService/ExecutionEligibilityGate.
- **Constraint awareness (soft introspection):** Noticing a violation after
  it happens. This is post-failure, not recovery.

Self-audit language ("I think I violated a constraint") appearing in runtime
traces is a **symptom of soft constraints leaking into execution space**,
not a meaningful recovery mechanism. The correct design: any component that
produces self-audit language is already post-failure.

### 28.3 CIRS — Cognitive Integrity Rule System

The transcript's central contribution. CIRS is a formal epistemic boundary
enforcement system with ~30 rules across 10 families. See dedicated spec:

**Spec:** `nexus/graph/cognitive-integrity-rule-system.md`

Key distinction from prior CIR framing:

| Concept | What It Is |
|---------|-----------|
| **CIR** | Cognitive Integrity *Ratio* — distance measurement (continuous 0.0–1.0) |
| **CIRS** | Cognitive Integrity *Rule System* — formal rule system (binary pass/fail) |

The transcript formalizes CIRS as a **type system for epistemic states**,
not a runtime validator. Rules include:
- **IR family (10 rules):** Govern ProjectionIR — non-authority, containment,
  no epistemic escalation, operator boundaries, execution isolation,
  epistemic-only synthesis, ephemerality, no shadow canonicalization,
  WR exclusivity, no operator contamination
- **IR-META-01:** ProjectionIR = read-only epistemic normalization
- **CORE:** No artifact that participates in synthesis may participate in execution
- **AUD family (3 rules):** Audit non-influence, isolation, no reverse projection
- **CAUSAL family (2 rules + CORE):** Causal structure may explain but never influence
- **VEL family (2 rules + CORE):** Ledger append-only, non-influence
- **MED-01:** Cryptographic non-influence
- **SPoE-01:** Proof non-influence
- **PAL-01:** Query non-influence
- **CTS-01:** Query non-epistemic
- **SYN/PLN/EXE:** Pipeline stage integrity
- **BOOT family (2 rules):** Bootstrap authority, no self-modification

Three hard CIRS boundaries:
1. Observation → Operator (factual intake only)
2. Synthesis → WorkRequest (no direct IR path)
3. WorkRequest → Conduit Execution (no IR in execution)

### 28.4 ProjectionIR — Unified Intermediate Representation

A new architectural layer positioned between operator output and downstream
consumers. Currently each operator has its own terminal artifact type
(AttenProjection, SearchResult, ThrottlerScope). ProjectionIR provides a
shared, normalized epistemic form.

**Placement:**
```
Source Domain Operators
   ↓
[ ProjectionIR Adapter Layer ]   ← INSERTED HERE
   ↓
Operator-specific Projections (Atten/Nebula/Search/Throttler)
   ↓
Consumers (UI / Canonicalizer / Planner / PEB)
   ↓
WorkRequest (ONLY path into Conduit)
```

**Properties:** Read-only, non-authoritative, ephemeral, recompute-always.

**Schema (minimal):**
```
{
  source_operator: string,     // which operator emitted this
  domain: string,              // projection domain
  proposition: any,            // the projected content
  confidence: number,          // 0.0–1.0 (CIR measurement)
  constraints: string[],       // applicable CIRS rules
  trace: string[]              // observation lineage
}
```

**Governed by 10 CIRS-IR rules + IR-META.** See CIRS spec.

### 28.5 Compositional Projection Algebra Extension

The transcript critiques the current projection algebra (which explicitly
forbids operator chaining) as a "projection registry" not a true algebra.
It proposes controlled extension with:

| Operation | Description |
|-----------|-------------|
| **Projection fusion** | Merge multi-operator IR into single synthesized view |
| **Projection refinement** | Narrow projection scope using second operator |
| **Projection comparison** | Cross-operator alignment analysis |
| **Projection collapse** | Generalized canonicalization |

**Critical constraint:** These operations must use ProjectionIR as substrate,
not direct operator-to-operator connections. Bounded composition — not full
composition — preserves operator independence while enabling cross-operator
reasoning.

### 28.6 /dev Runtime Authority Manifest

The transcript identifies a missing root-level contract in the current
architecture. `.agent/` is currently "just another directory pattern" rather
than a binding authority declaration. The proposed fix:

**Mount semantics** (UNIX filesystem analogy):
```
/dev
  ├── (host runtime)
  └── Nexus/   ← mounted subsystem with authority
```

A `/dev` runtime manifest would:
- Declare authority hierarchy explicitly
- Define execution rules as binding contracts (not descriptive metadata)
- Enable agents to be instantiated as "running under /dev with Nexus mounted
  as governance layer"

This flips the current model from **interpretive hierarchy** (models inferring
who has authority) to **enforced execution topology** (authority is declared
and gate-enforced).

### 28.7 Three-Layer Enforcement Model

The transcript synthesizes the above concepts into a layered enforcement
architecture:

1. **CIRS (epistemic type system):** Invalid transitions cannot be expressed
2. **Nexus Enforcement Compiler:** Transforms `.agent/` + `.opencode/` +
   PEB invariants into a runtime contract object
3. **Spring Filter / Conduit Gateway:** Hard gate at REST boundary rejects
   invalid transitions at runtime

### 28.8 Descriptive vs Operative Mode

The "aspirational" tag currently used in Nexus specs is identified as a
**control-plane signal that prevents execution ambiguity**, not mere metadata
decoration. This suggests a formal **mode boundary**:

- **Descriptive mode:** The model can talk about Nexus, reason about it,
  critique it — but cannot act under its governance
- **Operative mode:** All actions are filtered through CIRS constraints —
  violations are structurally impossible

Currently the "aspirational" tag is the implicit proxy for this boundary.
The transcript suggests making it explicit.

### 28.9 NEXP-5 Projection Operator

The transcript references a fifth projection operator (NEXP-5) in addition
to the existing four (Atten, Search, Nebula, Throttler). NEXP-5 handles
"experimental projections" — tentative or low-confidence interpretations
that are quarantined from mainline processing. This reinforces the
quarantine pattern from the XIL spec.

### 28.10 Key Architecture Corrections

1. **Self-audit is a design smell, not a feature.** If traces contain
   "I may have violated constraints," the enforcement boundary is in the
   wrong place.
2. **ProjectionIR must be strictly ephemeral.** Any caching or persistence
   of ProjectionIR creates a shadow canonical system.
3. **CIRS is not optional.** The rules are not guidelines — they define the
   validity condition for all epistemic transitions. A transition that
   violates CIRS is not a runtime error; it is a non-existent morphism.
4. **/dev manifest > .agent/ metadata.** Descriptive directory patterns
   are weaker than root-level binding contracts.

### 28.11 CIRS as Type System (Category-Theoretic View)

The transcript's most advanced framing: CIRS as a category where:
- Objects = epistemic states (Obs, Proj, IR, Syn, Plan, WR, Exe)
- Morphisms = valid CIRS transitions
- Composition = pipeline (Obs→Proj→IR→Syn→Plan→WR→Exe)
- Invalid transitions are not morphisms — they cannot be expressed

```
validity = composition correctness
not runtime validation
```

This is a significant upgrade from "checking compliance after execution"
to "making correctness a property of composition itself."

---

## 29. BP Knowledge Graph as Persistent Store (Transcript: `chats/BP Analysis Role Insights.html`)

*New decision point recorded June 16 2026 — this section supersedes the
"ephemeral KG" assumption that runs through earlier sections.*

### 29.1 The Pre-Existing Assumption

Up to this point, the architecture document treated ProjectionIR and the
knowledge graph as **ephemeral by design** — regenerated on demand from
source documents, never cached, never stored as canonical state (per
CIRS-IR-07). The knowledge graph lived in `graph/nexus-knowledge-graph.json`
as a build artifact, not runtime state.

This assumption carries through sections 1–28 of this document.

### 29.2 The New Decision: Persistent Projector

The BP Analysis Role Insights transcript reframes BP's knowledge graph from
"ephemeral extraction output" to **persistent semantic state**. The graph
becomes the core projector — a living model that agents read from and write to.

This means:

| Old model | New model |
|-----------|-----------|
| File-based JSON, full regeneration | DB-backed (PostgreSQL + pgvector), incremental updates |
| One-shot compile-and-discard | Continuous merge-on-write |
| KG = f(inputs), stateless | KG persists across analysis cycles |
| Ephemeral IR output | Long-lived projector with provenance |

The tension with CIRS-IR-07 is explicit: the ProjectionIR layer itself remains
ephemeral, but the **projector output** (the knowledge graph) is persisted as a
derived artifact. This is consistent with the three-tier model from the
transcript (Spec Graph / Inference Graph / Execution Graph) — the persistent
KG is the Inference Graph, not the IR.

### 29.3 Storage Architecture: PostgreSQL + pgvector

The decision to use PostgreSQL + pgvector determines several design
constraints:

- **Relational core**: Actors, roles, states, types, rules live in normalized
  tables with foreign keys. The current JSON schema maps to a table-per-type
  model.
- **Vector embeddings**: pgvector enables similarity search over descriptions,
  relationship semantics, and transcript chunks. This is what makes it a
  *living* projector — agents can query by semantic proximity, not just
  structural lookup.
- **Single store**: No dual-write problem. Everything in one PostgreSQL
  instance (same as PEB's backing store).

Open design questions about the storage model:

```
Q1: Unit of update
    Is a single node/edge the atomic write unit, or is it a batch
    (e.g., "all findings from one transcript analysis")?
    Implication: determines whether the projector validates on write
    or on batch commit; also determines granularity of locking.

Q2: Embedding strategy
    What gets embedded? Node descriptions? Edge semantics? Full
    transcript chunks? Entity names?
    When do embeddings get generated? Synchronously on write, or
    async via background job?
    How are stale embeddings detected and regenerated?
```

### 29.4 Incremental Update Model (Not Full Regeneration)

The key constraint from the transcript and the design conversation:

```
KGₙ ≠ f(KGₙ₋₁, new_input)           ← Don't do this (drift)
KGₙ ≠ f(all_inputs)                  ← Can't do this (too expensive)
KGₙ  = persist(KGₙ₋₁) + merge(new_input)  ← Incremental merge
```

The projector does not re-run inference on the entire graph on every change.
Instead:

1. BP processes a new input (transcript, spec change, execution trace)
2. Extracts deltas: new actors, new relationships, updated invariants
3. Each delta carries provenance metadata (ASSERTED / INFERRED / DERIVED)
4. The projector validates each delta against schema constraints
5. Valid deltas are merged into the persistent store
6. Embeddings are generated/computed for new/changed nodes

This avoids both the "full inference on every cycle" problem and the
"silent drift" problem of accumulating from previous state.

### 29.5 The Projector Role in the Persistent Model

The transcript frames the projector as a formal constraint function. In the
persistent store model, the projector manifests at multiple layers:

| Layer | What enforces it | What it constrains |
|-------|-----------------|-------------------|
| **Schema** | PostgreSQL DDL (tables, foreign keys, CHECK constraints) | Structural validity — every node has a type, every edge references valid endpoints |
| **Provenance** | ASSERTED/INFERRED/DERIVED enum column on every row | Epistemic honesty — no inference masquerades as fact |
| **Embedding** | Index type + distance function selection | Semantic consistency — similar entities are discoverable |
| **Validation** | Application-level projector (PL/pgSQL or service layer) | Cross-entity invariants — no orphaned edges, no circular dependency chains |

This is a significant departure from the transcript's "projector as type checker
over JSON" model. Here the projector is distributed across the stack — the
schema IS the projector, the constraints ARE the validation, and embeddings
are a derived property of the stored state.

### 29.6 Provenance Labels (Required)

Every row in the persistent knowledge graph MUST carry provenance metadata.
The transcript's labeling scheme is mandatory:

| Label | Meaning | Storage |
|-------|---------|---------|
| **ASSERTED** | Directly stated in source document or confirmed by user | `provenance = 'asserted'`, `source_ref` points to transcript line or spec section |
| **INFERRED** | Derived by BP during analysis | `provenance = 'inferred'`, `derivation_rule` records the inference path |
| **DERIVED** | Computed from other graph structures by projector | `provenance = 'derived'`, `computed_by` records the projector function |
| **TEMPORAL_SCOPE** | Validity scope — transcript-bound or global | `valid_in` field with transcript ID, or `null` for global |

Without these labels, incremental updates silently overwrite earlier state
and the projector loses auditability. With them, the graph tracks not just
*what* is known, but *how* it became known — and whether it's still valid.

### 29.7 Versioning and History

If updates are incremental and the graph is persistent, a versioning decision
is required:

**Option A: Latest-only (no history)**
- The graph reflects "current best knowledge"
- Updates overwrite previous state
- Simpler, faster, less storage
- Cannot reconstruct past states

**Option B: Event-logged (full history)**
- Every mutation is an event in an append-only table
- The graph is a materialized view over the event log
- Can reconstruct any past state
- More complex, needs compaction strategy

**Option C: Snapshot-versioned (checkpoint model)**
- The full graph is snapshotted on semantic boundaries
- Between snapshots, incremental deltas are ephemeral
- Compromise between A and B

This is not a decision that needs to be made now, but it constrains the schema
design (e.g., whether rows need `valid_from`/`valid_to` columns).

### 29.8 Resolved Design Constraints (Transitioned from Open Questions)

*Resolved June 16 2026. The 8 original questions were reframed as coupled
design constraints forming a 3-layer dependency lattice, not independent
implementation choices. Resolution below.*

```
Observation: These are no longer "implementation questions" — they are
semantic invariants that will shape the entire KG behavior.
```

#### The Dependency Lattice

The 8 questions form a 3-layer dependency lattice with a clear resolution
order. Questions within each layer must be resolved together; downstream
layers depend on upstream resolutions.

```
Layer A — Truth Admission
  Q1 (atomicity) — what is the unit of update?
  Q3 (authority) — where is truth enforced?
  Q8 (traceability) — how is source anchored?

Layer B — Semantic Representation
  Q2 (embedding scope) — what gets vectorized?
  Q6 (embedding timing) — when does semantic state materialize?

Layer C — System Interaction
  Q4 (versioning) — how does the KG remember change?
  Q5 (cognition interface) — what is the read path for agents?
  Q7 (memory partitioning) — how does KG interact with PEB?
```

**Resolution commitment: Q1 + Q3 must be resolved together first.**
Once atomicity and enforcement locus are fixed, the rest becomes derivable.

---

#### Q1 — Unit of Update (Atomicity of Truth Admission)

What is the smallest atomic commit unit into the KG?

| Option | Characteristics |
|--------|----------------|
| **Node/edge** (fine-grained) | High fidelity, high write cost, tightest provenance |
| **Fact cluster / subgraph patch** (balanced) | Natural boundary for transcript analysis output |
| **Whole transcript slice** (coarse) | Easier projection consistency, less granular audit |

**Dependency pressure:** Directly constrains Q6 (embedding timing) and Q4
(versioning). Affects Q2 (embedding scope).

**Status:** *Not yet resolved — pending Q1+Q3 joint decision.*

---

#### Q2 — Embedding Strategy (Semantic Representation Boundary)

What semantic objects receive embeddings?

| Option | Characteristics |
|--------|----------------|
| **Node-only embeddings** | Simple, lossy — no edge semantics in vector space |
| **Edge-aware embeddings** | Relational semantics preserved in embedding |
| **Subgraph/window embeddings** | Contextual memory model, most expressive |

**Coupling:** Depends on Q1 (unit of update determines what gets embedded)
and Q6 (sync vs async timing). Defines Q5 query behavior — vector-first
vs graph-first retrieval.

**Status:** *Not yet resolved — derivable after Q1+Q3.*

---

#### Q3 — Projector Enforcement Model (Where Truth Is Enforced)

*This is the trust boundary decision, not a design choice.*

Where does "valid KG state" get enforced?

| Option | What it means | What it produces |
|--------|---------------|------------------|
| **DDL-level** (Postgres constraints) | Hard invariants, structural guarantees | A database with rules |
| **Service-layer projector** | Flexible rules, versionable logic | A system with a database |
| **Hybrid** | Minimal DB constraints + strong projection service | Both layers play their role |

This determines the fundamental character of the KG: is it a governed
database or a system that uses a database?

**Status:** *Not yet resolved — pending Q1+Q3 joint decision.*

---

#### Q4 — Versioning Model (Temporal Semantics of Truth)

How does the KG remember change?

| Option | Characteristics |
|--------|----------------|
| **Latest-only** | Materialized belief state, simple, no history |
| **Event-logged** | Pure history of deltas, full audit, needs compaction |
| **Snapshot-versioned** | Periodic stable cuts + delta stream, balanced |

**Strong coupling:** Q1 (granularity determines log size), Q7 (cross-store
sync complexity), Q8 (source trace integrity over time).

**Status:** *Not yet resolved — derivable after Q1+Q3.*

---

#### Q5 — Read Path for Agents (Query Epistemology)

How do consumers "think" against the KG?

This defines the **cognitive interface to stored knowledge** — the shape
determines whether the KG operates as:

| Option | The KG becomes... |
|--------|-------------------|
| **Raw SQL** | A database — structural access, no abstraction |
| **REST API** | A service — controlled abstraction, defined contract |
| **MCP tool interface** | An agent substrate — agent-native abstraction layer |
| **Hybrid routing** | Query planner decides backend based on operation |

**Status:** *Not yet resolved — derivable after Q1+Q3.*

---

#### Q6 — Embedding Generation Timing (Consistency vs Latency)

When does semantic state materialize?

| Option | Characteristics |
|--------|----------------|
| **Synchronous** | Write-time consistency, slower ingestion |
| **Async pipeline** | Eventual consistency, scalable, needs staleness handling |
| **Lazy/on-read** | Adaptive cost, unpredictable latency |

**Coupling:** Q1 (batching strategy), Q2 (embedding scope stability), Q7
(cross-store synchronization windows).

**Status:** *Not yet resolved — derivable after Q1+Q3.*

---

#### Q7 — Cross-Store Consistency (KG ↔ PEB Interaction Model)

KG shares infrastructure with PEB state. The question is not "do they
conflict?" but: **what consistency model exists between cognitive memory
(PEB) and structural memory (KG)?**

| Option | Characteristics |
|--------|----------------|
| **Shared transaction boundary** | Tight coupling, high cost, strong consistency |
| **Eventual consistency** | Decoupled cognition and structure, async reconciliation |
| **One-way projection** | PEB → KG or KG → PEB dominant direction |

This is the **system-of-record partitioning problem** for the Nexus
architecture.

**Status:** *Not yet resolved — derivable after Q1+Q3.*

---

#### Q8 — Source Document Anchoring (Traceability Invariant)

Every ASSERTED node must reference a provenance source.

Anchor types:

| Option | Characteristics |
|--------|----------------|
| **UUID → external document store** | Clean separation, needs doc store |
| **Inline reference** | Embedded trace metadata, simpler, less scalable |
| **Hybrid — UUID + cached snippet hash** | Audit + speed balance |

This defines whether truth is *reconstructable* or merely *referenced*.

**Status:** *Not yet resolved — derivable after Q1+Q3.*

---

#### Lattice Summary

```
Layer A — Truth Admission:    Q1 (atomicity) + Q3 (authority) + Q8 (traceability)
  ↓ resolves first
Layer B — Semantic Representation:  Q2 (scope) + Q6 (timing)
  ↓ derivable
Layer C — System Interaction:  Q4 (versioning) + Q5 (cognition) + Q7 (partitioning)
```

**Resolution priority:** Q1 + Q3 together. Once atomicity and enforcement
locus are fixed, the rest of the system stops being ambiguous and starts
becoming derivable.

### 29.9 Transcript Source

The architectural direction above is synthesized from:
- **Primary:** `chats/BP Analysis Role Insights.html` — analysis role framing,
  3-tier graph model (Spec / Inference / Execution), projector as constraint
  function, ASSERTED/INFERRED/DERIVED provenance labels, KG as deterministic
  projection vs accumulating memory
- **Answers:** `answers to open questions.md` — reframed 8 independent questions
  into a 3-layer dependency lattice, classified each option with coupling
  constraints, recommended Q1+Q3 as the joint resolution starting point

### 29.10 Status

```
Status: Design decision recorded, not yet implemented
Dependencies: PostgreSQL schema definition, projector validation layer,
              embedding generation pipeline, merge logic
Supersedes: Section 11's "ephemeral KG" assumption
```

---

## 30. Self-Extending Architecture — Graph Decision Projection

> ⚠️ **This section is a rendered projection of graph state.** The authoritative
> representation is in `graph/nexus-knowledge-graph.json` under `decisions[]`.
> Each subsection documents one or more decision nodes. The decision nodes
> are the source of truth; this text is a human-readable view with expanded
> rationale and cross-references.
>
> Decision IDs are noted in brackets — use them for CIR reasoning, synthesis
> constraint satisfaction, and reconciliation enforcement.

Source transcript: `chats/Self-Extending Architecture Concept.html`
Projection generated: June 16 2026

---

### 30.1 Core Closure Loop [`dec-core-claim`]

**Decision node in graph.** Status: `locked`. Constraint type: `architectural_invariant`.

The system's defining hypothesis — the claim that must be proven before
anything else:

```
CIR phantom → generative event → filesystem mutation → CIR resolution
```

This is an **architectural invariant**: every CIR phantom MUST trigger a
generative closure loop that resolves to a filesystem mutation and subsequent
CIR confirmation. Any break in this chain is a system failure.

The Phase 1 wedge (`dec-phase1-scope`) is the minimal implementation of this
loop. If this loop works cleanly, the system is real. If it is unstable,
everything above collapses into hallucinated structure or uncontrolled
mutation.

---

### 30.2 Topological Change Path [`dec-path-selection`]

**Decision node in graph.** Status: `locked`. Constraint type: `governance_rule`.

Two architectural paths were identified and one selected:

| Path | Flow | Character | Selected? |
|------|------|-----------|-----------|
| **A — Proposal-first** | phantom → proposal → review → promotion → reconciliation | Self-suggesting. Higher governance, slower, more human involvement. | No — too slow, breaks closure |
| **B — Realization-first** | phantom → synthesis → staged write → reconciliation → rollback or commit | Self-mutating. Faster, autonomous, higher governance risk. | **Yes** — this is the chosen path |

The architecture converges on a hybrid model per tier:

| Tier | Mode |
|------|------|
| **Topology synthesis** (files, schemas, manifests) | Proposal-first — safer, topology evolves deliberately |
| **Runtime synthesis** (bindings, registrations, stubs) | Staged realization — faster iteration on resolvable existence |
| **Behavioral synthesis** (logic, side effects) | Heavily governed / human-reviewed — done last, if at all |

These tier modes are encoded in `dec-path-selection.tier_modes`.

---

### 30.3 The 5 Spaces of Self-Extension [`dec-five-spaces`]

**Decision node in graph.** Status: `locked`. Constraint type: `schema_requirement`.

The system operates across five distinct semantic spaces:

```
proposal space    — candidate structure, not yet materialized
branch space      — parallel alternatives, explicitly versioned
staging space     — materialized but not committed
committed space   — authoritative, reconciled state
validated space   — confirmed correct by post-commit verification
```

**Constraint:** Every persistent KG schema and pipeline stage MUST distinguish
among the five spaces. Conflation of staging and committed is a design error.

KG implications:
- The KG must distinguish between staged and committed knowledge (`dec-kg-is-writable-projection`)
- Branch space requires versioning (Q4) — different synthesis alternatives
- Proposal space maps to INFERRED provenance (not yet confirmed)
- Staging space maps to the incremental merge model — deltas are staged
  before becoming part of the committed graph

---

### 30.4 The 8-Stage Generative Pipeline

The 8-stage pipeline is a **derived structure** from the locked decisions
(`dec-phase1-scope`, `dec-path-selection`, `dec-reconciliation-model`,
`dec-expansion-order`). It is not itself a decision node — it is the
composite roadmap:

```
1. CIR Generative Mode     — semantic anomaly detection (phantom detection)
2. Intent Packaging        — anomaly normalization → WorkRequest
3. Safe FS Mutation        — operational containment (staging sandbox)
4. Topology Synthesis      — structural completion (files, schemas, manifests)
5. Reconciliation          — closure validation (recursive convergence loop)
6. Branch Scoring          — evolutionary selection (which candidate wins)
7. Runtime Synthesis       — execution binding (stubs, registrations)
8. Branch Retirement       — history preservation of losing branches
```

**Phase 1 wedge:** Stages 1–4 only (see `dec-phase1-scope`). Only topology
synthesis (stage 4) — no behavioral synthesis until all prior stages are
stable.

**Expansion order** (`dec-expansion-order`): Stages 5–8 are added in sequence:
Reconciliation → BranchManager → Proposal/Commit split → Runtime Synthesis →
Behavior Synthesis (last).

---

### 30.5 Reconciliation as Recursive Convergence [`dec-reconciliation-model`]

**Decision node in graph.** Status: `locked`. Constraint type: `algorithmic_invariant`.

Reconciliation is not a validation pass. It is a convergence loop:

```
unresolved
  → generate
  → validate
  → enrich context (reconciliation report)
  → regenerate
```

This is **iterative constraint satisfaction**, not static checking. The
reconciliation report feeds back into topology synthesis with enriched
context, making generation memory-bearing rather than stateless.

**Constraint:** Reconciliation MUST NOT be a single-pass validation gate. It
MUST be a recursive convergence loop that produces memory-bearing reports for
subsequent synthesis iterations.

This is the direct analogue of the incremental merge model in the persistent
KG (Section 29.4).

Loop termination is governed by `dec-loop-termination` (max_attempts per
artifact-category-target_path, GENERATION_EXHAUSTED terminal state).

---

### 30.6 Provenance Graph Layer (Causal Chain) [`dec-provenance-causal-chain`]

**Decision node in graph.** Status: `locked`. Constraint type: `provenance_requirement`.

Because the system mutates itself, provenance is existentially important.
Every artifact requires a complete causal chain:

```
Artifact
  ← generated_from
  ← reconciliation_of
  ← branch_selected_by
  ← synthesized_from
  ← CIR_event
  ← originating_assertion
```

Without this chain:
- Rollback becomes impossible
- Governance loses traceability
- Topology drift becomes opaque

**Constraint:** Every artifact MUST trace to its originating assertion through
the full causal chain. Any artifact without complete provenance is opaque and
MUST be treated as untrusted.

This extends the ASSERTED/INFERRED/DERIVED provenance model (Section 29.6)
from single-label attribution to full graph ancestry.

---

### 30.7 Losing Branches as Learning Data [`dec-losing-branches-preservation`]

**Decision node in graph.** Status: `locked`. Constraint type: `governance_requirement`.

Non-selected branches must be preserved, not discarded. They become:

- Topology learning data (which synthesis strategies converge fastest)
- Governance history (which violate governance most often)
- Synthesis priors (which generate minimal diffs)
- Architectural lineage (which artifact classes are high-risk)

**Constraint:** BranchManager MUST archive non-selected branches. Deletion is
prohibited. Archived branches MUST be queryable by CIR, reconciliation, and
governance.

This transforms BranchManager from a utility into **evolutionary
architectural memory**. It directly constrains Q4 (versioning): the
event-logged versioning model is the only one compatible with branch
history preservation.

---

### 30.8 Behavioral Generation Boundary [`dec-behavioral-boundary`]

**Decision node in graph.** Status: `locked`. Constraint type: `semantic_boundary`.

A critical scope constraint:

> Behavioral generation ends at "resolvable existence," not "correct
> implementation."

The system generates:
- Compilable stubs ✓
- Interface realizations ✓
- Valid registrations ✓
- Executable placeholders ✓

The system does NOT generate:
- Correct business behavior ✗
- Production logic ✗
- Safety-critical code ✗

**Constraint:** The projector validates structural resolvability, not semantic
correctness. Behavioral generation is limited to stubs, interface realizations,
registrations, and executable placeholders.

---

### 30.9 The Phase 1 Wedge [`dec-phase1-scope`]

**Decision node in graph.** Status: `locked`. Constraint type: `scope_boundary`.

The smallest closed loop that proves the core claim (`dec-core-claim`). Three
components:

| Component | Responsibility |
|-----------|---------------|
| **CIR Generative Mode** | Detect semantic anomalies (phantoms) |
| **Intent Packager** | Convert anomaly into WorkRequest with schema-valid intent |
| **Safe FS Mutation** | Write scaffold topology to staging sandbox |

One rule: **Only topology artifacts** (files, directories, schemas,
manifests). No behavior.

Success condition (`dec-core-claim` proof):
```
missing .pipeline/XYZ.yaml
  → CIR event emitted
  → Intent Packager creates WorkRequest
  → Safe FS Mutation generates scaffold file in staging
  → Re-run CIR → phantom disappears
```

---

### 30.10 Decisions Locked by the Transcript

These decision nodes exist in the graph with full provenance, alternatives,
rationale, and constraint statements. This table is a compact projection:

| Decision ID | Value | Constraint Type |
|-------------|-------|-----------------|
| `dec-core-claim` | CIR phantom → generative event → filesystem mutation → CIR resolution | architectural_invariant |
| `dec-path-selection` | Realization-first (hybrid per-tier) | governance_rule |
| `dec-five-spaces` | Proposal/branch/staging/committed/validated | schema_requirement |
| `dec-reconciliation-model` | Recursive convergence loop (not validation) | algorithmic_invariant |
| `dec-loop-termination` | max_attempts per (artifact, category, target_path); GENERATION_EXHAUSTED | governance_rule |
| `dec-phase1-scope` | 3 components, topology only, no behavior | scope_boundary |
| `dec-behavioral-boundary` | Resolvable existence, not correct implementation | semantic_boundary |
| `dec-mutation-model` | Sandbox filesystem staging, not in-memory | operational_requirement |
| `dec-module-placement` | losm-generative as dedicated synthesis subsystem | architectural_decision |
| `dec-cir-transport` | JSON Lines via stdout/stdin, no IPC yet | protocol_decision |
| `dec-idempotency` | All CIR generative events replay-safe | reliability_requirement |
| `dec-expansion-order` | Reconciliation → BM → P/C split → Runtime → Behavior (last) | roadmap_constraint |
| `dec-provenance-causal-chain` | Full chain: assertion → CIR → synthesis → branch → reconciliation → artifact | provenance_requirement |
| `dec-losing-branches-preservation` | Archive, never delete. Queryable by CIR/gov/reconciliation. | governance_requirement |
| `dec-typespec-contract-surface` | TypeSpec = contract surface; JVM = enforcement boundary. Compile-time enforcement via TypeSpec → OpenAPI → Java. | architectural_decision |
| `dec-kg-is-writable-projection` | KG is writable projection surface, not read-only artifact | paradigm_invariant |

---

### 30.11 TypeSpec Contract Surface — Missing Extraction Note

The Self-audit in Agent Runtime transcript (`chats/Self-audit in Agent Runtime.html`)
defines a **TypeSpec contract surface** that mirrors the JVM enforcement layer.
This was initially extracted for its CIRS epistemic type system content but the
TypeSpec model itself was not captured as a graph decision. It is now:

- **Decision:** `dec-typespec-contract-surface`
- **Type:** `TypeSpecContractSurface` (under `types[]`)
- **Observation:** `typespec_as_contract_surface` (under `architectural_observations[]`)
- **Cross-reference:** `typespec_to_jvm_mirror` and `typespec_to_cirs` (under `cross_references[]`)

**Key architecture principle** from the transcript:

> TypeSpec = contract surface. JVM = enforcement boundary. No runtime "CIRS engine."
> Invalid flows fail at compile time (TypeSpec → OpenAPI → Java types).

The TypeSpec model defines seven namespaces that map directly to JVM structures:

| Namespace | Types | Role |
|-----------|-------|------|
| `Nexus.Epistemic` | Observation, Projection, ProjectionIR, SynthesizedView, WorkRequest | Full epistemic type lattice |
| `Nexus.Conduit` | WorkRequest, ConduitGateway, ConduitResponse | **Only crossing point** — POST /v1/workrequest |
| `Conduit.Audit` | ExecutionTrace, CausalTraceNode, MerkleCausalNode | Execution recording |
| `Nexus.Ledger` | ExecutionLedgerEntry | Bridge across all three systems (IR hash + causal node IDs) |
| `Conduit.Proofs` | ExecutionProof, ProofIndex, ProofQuery | Verification layer |
| `Nexus.Causal` | CausalType (7-kind enum), CausalAssertionNode, CausalQuery | Typed causality |
| `Nexus.CausalSpec` | CausalSystem, Phase, Transition | Transition rules with optional invariant refs |

**Critical boundary:** Conduit exposes ONLY WorkRequest. Observation, Projection,
ProjectionIR, and SynthesizedView never appear in Conduit-facing schema — they
do not exist in the `Nexus.Conduit` namespace. This makes invalid transitions
structurally impossible: they cannot be serialized, cannot be represented, cannot
be sent.

---

### 30.11 Connection to the Persistent KG

Cross-reference between decision nodes and persistent KG design questions
(Section 29). Both are graph state — this table is a cross-projection:

| Self-extending decision | Persistent KG (Section 29) |
|-------------------------|---------------------------|
| `dec-core-claim` (phantom detection) | Q1 — unit of update (what atomicity triggers generation?) |
| `dec-reconciliation-model` | Section 29.4 — incremental merge model |
| `dec-provenance-causal-chain` | Section 29.6 — ASSERTED/INFERRED/DERIVED labels extended to full ancestry |
| `dec-five-spaces` | Q4 — versioning model must distinguish these |
| `dec-losing-branches-preservation` | Q4 event-logged model |
| `dec-mutation-model` (sandbox→committed) | Q3 — projector enforces schema on write |
| Intent package → WorkRequest | WorkRequest as the atomic generative unit |

---

### 30.12 Graph State Metadata

```
Projection source: chats/Self-Extending Architecture Concept.html
Graph location: graph/nexus-knowledge-graph.json → decisions[]
Node count: 15 decision nodes
Status: All locked (irreversible architectural anchors)
Phase 1 wedge: active target
Scope boundary: Topology only. No behavioral synthesis in Phase 1.
Supersedes: Earlier "static knowledge graph" assumptions. The KG is now
            explicitly a writable projection, not a read-only artifact (dec-kg-is-writable-projection).
```

---

*This is an inventory of months of accumulated whiteboard across 21 transcripts,
reflecting multiple phases of exploration. The goal is a minimal self-updating
system. Some concepts may have collapsed multiple ideas under one name across
different conversations — the cataloging effort is ongoing. Architecture now
covers: Cognitive
Compiler (2-tier IR pipeline), Event System (Observer/Event Log/Atten),
Nebula Evolution (3-layer model), Agenda Generator (CIR → CIRS evolution),
AG-UI Integration (WorkRequest/Session split), ATDD (RCL/EUL/IUL), Bug
Tracking (Observations vs Events), DeepSeek Critique (3-authority fix,
Plan/Context split), Nebula System Info (capability decomposition, 3-node
type model), Semantic Adapter Layer (harness-as-data, execution modes,
role injection strategies), Plurality and Agent Disagreement (Transform
signature, Trace provenance, WorkRequest quality triangle, operational
fitness function), XIL (External Intelligence Layer, semantic firewall,
quarantine mechanism), Message Normalization (closure system safe delete),
LOSM Assessment (industrial engineering metaphor, track-based behavior),
CCNF Authority Arbitration Layer (context scope tokens, provenance domains),
Conduit RGEM (Conduit 2.0 runtime, framework-as-plugin inversion), Model
Role Assignment (Scaffold UI as design memory, progressive instrumentation),
Nexus Development Focus (proposed receipts, branch POE solution), System
Accretion Cascade (hash→lookup→projection three-layer identity model),
Self-Audit in Agent Runtime (TypeSpec contract surface, CIRS epistemic type system, ProjectionIR,
/dev runtime manifest, compositional algebra extension, NEXP-5,
descriptive/operative mode boundary), BP Analysis Role Insights (KG as
persistent projector, 3-tier graph model, provenance labels, incremental
merge), Self-Extending Architecture Concept (self-healing topology loop,
8-stage generative pipeline, 5 spaces, Phase 1 wedge, provenance causal
chain).*
