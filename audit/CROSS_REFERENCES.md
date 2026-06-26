# Cross-Reference Index

**Purpose:** Maps every major concept in the audit corpus to all files that define or reference it. Use this to navigate the documentation by concept rather than by file.

**Generated:** 2026-06-18 | **Scope:** All files in `nexus/audit/`

---

## 1. WorkRequest IR

**Canonical definition:** [`WORKREQUEST_SPEC.md`](./SPECS/WORKREQUEST_SPEC.md)

The canonical Intermediate Representation (IR) of the Nexus system — a unit of executable intent separated from conversational context. The only shared concept between the aspirational WRP and the active Conduit system.

| File | Relationship |
| --- | --- |
| [`WORKREQUEST_SPEC.md`](./SPECS/WORKREQUEST_SPEC.md) | **Canonical definition** |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Four-phase compiler architecture consuming WorkRequests |
| [`AGENT_ARCHITECTURE_README.md`](./AGENT_ARCHITECTURE_README.md) | WorkRequest Compiler README — intent → WorkRequest → execution |
| [`PHASE1_SPECIFICATION_COMPILER.md`](./SPECS/PHASE1_SPECIFICATION_COMPILER.md) | Prompt → Requirements → WorkRequests → WorkRequestGraph |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | WorkRequestGraph → ExecutionGraph (Phase 1.5) |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | WorkRequestGraph as input IR to ExecutionGraph |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | ExecutionGraph is frozen instantiation of WorkRequests |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | S3 — WorkRequest Consistency validation rules |
| [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | Prompt → Requirements → WorkRequestGraph pipeline |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | WorkRequestCreated, WorkRequestRefined events |
| [`REQUIREMENTS_CAPTURE_BOUNDARY.md`](./SPECS/REQUIREMENTS_CAPTURE_BOUNDARY.md) | Requirements-capture → WorkRequestGraph boundary |
| [`PIPELINE_INTENT_SPEC.md`](./SPECS/PIPELINE_INTENT_SPEC.md) | What the pipeline does with WorkRequests |
| [`cognitive-integrity-rule-system.md`](./SPECS/cognitive-integrity-rule-system.md) | WorkRequest execution authority (CIRS rules) |
| [`DAEMON_README.md`](./ENGINEERING/DAEMON_README.md) | WRP Daemon — WorkRequest dispatch to executors |
| [`conduit-code-assessment.md`](./ENGINEERING/conduit-code-assessment.md) | `work_requests` table bug in PG mode |
| [`conduit-db-conversion.md`](./SPECS/conduit-db-conversion.md) | WorkRequest DCO files and DB migration |
| [`pipeline-manager-acceptance-checklist.md`](./ENGINEERING/pipeline-manager-acceptance-checklist.md) | WorkRequest integrity acceptance criteria |
| [`ANALYSIS.md`](./ANALYSIS.md) | WorkRequest IR across 10+ sections |
| [`ANALYSIS/operator-plane-gap-analysis.md`](./ANALYSIS/operator-plane-gap-analysis.md) | 18 specification documents covering WorkRequest Pipeline |
| [`ARCHITECTURE/message-semantic-taxonomy.md`](./ARCHITECTURE/message-semantic-taxonomy.md) | `intent.workrequest.execute` subject pattern |
| [`ARCHITECTURE/messagebox-core-architecture.md`](./ARCHITECTURE/messagebox-core-architecture.md) | WorkRequest IR as message payload |
| [`ARCHITECTURE/transport-abstraction-spec.md`](./ARCHITECTURE/transport-abstraction-spec.md) | `intent.workrequest.execute` NATS subject |
| [`ARCHITECTURE/conduit-hang-remediation.md`](./ARCHITECTURE/conduit-hang-remediation.md) | `work_request.py` hang cycle fixes |
| [`peb-mcp-spec.md`](./SPECS/peb-mcp-spec.md) | `cap:emit_work_request` capability token |
| [`peb-spring-boot-spec.md`](./SPECS/peb-spring-boot-spec.md) | `workRequestId` field in PEB trace entity |
| [`IMPLEMENTATION_PLANS/pending/hello-world-emit-verification-output-from-nexus-pi-v0120.md`](./IMPLEMENTATION_PLANS/pending/hello-world-emit-verification-output-from-nexus-pi-v0120.md) | WorkRequest pipeline end-to-end verification |
| [`IMPLEMENTATION_PLANS/pending/say-hello-from-pipeline-v0118.md`](./IMPLEMENTATION_PLANS/pending/say-hello-from-pipeline-v0118.md) | Hello-world WorkRequest pipeline confirmation |
| [`IMPLEMENTATION_PLANS/pending/0119-establish-workspace-context.md`](./IMPLEMENTATION_PLANS/pending/0119-establish-workspace-context.md) | WorkRequest Compiler pipeline context discovery |

---

## 2. ExecutionGraph

**Canonical definition:** [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md)

The low-level runtime AST — a typed Abstract Syntax Tree representing the runtime program emitted by the agent compiler. Produced by the Lowering Pass (Phase 1.5) from the WorkRequestGraph.

| File | Relationship |
| --- | --- |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | **Canonical definition** — schema v2 |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Phase 2 consumes ExecutionGraph |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | Produces ExecutionGraph from WorkRequestGraph |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | Interprets frozen ExecutionGraph as a program |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | Four-dimension validation (Static S1–S10, Runtime R1–R10, AEI, HAEC) |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | Multi-host scheduler consuming ExecutionGraph |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | Temporal reconstruction from ExecutionGraph + EventLog |
| [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | Phase 3 projection over ExecutionGraph + EventLog + ReplayState |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | ExecutionGraphCreated, ExecutionGraphCompleted events |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | `scope: executiongraph.v2` in identity system |
| [`CER_CCNF.md`](./SPECS/CER_CCNF.md) | `executiongraph.v2` as domain scope |
| [`CER_SNAPSHOT_ENGINE.md`](./SPECS/CER_SNAPSHOT_ENGINE.md) | Snapshot domain: `executiongraph` |
| [`CCNF_FAILURE_MODES.md`](./SPECS/CCNF_FAILURE_MODES.md) | Identity collapse scoped to `executiongraph.v2` |
| [`ANALYSIS.md`](./ANALYSIS.md) | ExecutionGraph IR across multiple sections |

---

## 3. Lowering Pass (Phase 1.5)

**Canonical definition:** [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md)

A formal compiler stage that transforms the abstract WorkRequestGraph (high-level IR) into the concrete ExecutionGraph (low-level runtime AST). Selects executors, expands lifecycles, projects dependencies, resolves data channels.

| File | Relationship |
| --- | --- |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | **Canonical definition** |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Phase 1.5 in four-phase architecture |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | Output schema — ExecutionGraph |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | Phase 2 receives frozen ExecutionGraph from lowering |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | Calls `validate_static()` before freeze |
| [`WORKREQUEST_SPEC.md`](./SPECS/WORKREQUEST_SPEC.md) | Input IR — WorkRequestGraph lowered into ExecutionGraph |

---

## 4. ExecutionGraph Validator

**Canonical definition:** [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md)

Ensures structural and semantic integrity across four dimensions: AEI (Authority Graph), Static (S1–S10), HAEC (permission), and Runtime (R1–R10). Cross-cutting component embedded in lowering and runtime.

| File | Relationship |
| --- | --- |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | **Canonical definition** — four-dimension specification |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Cross-cutting validator integration |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | Static validation before freeze |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | Validation rules reference |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | Runtime validation during scheduler tick loop |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | Runtime validation (R2, R3, R8) for distributed safety |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | V12 — CER validation rules for event log consistency |
| [`AUTHORITY_GRAPH_IR.md`](./SPECS/AUTHORITY_GRAPH_IR.md) | AEI validation dimensions (AEI1–AEI4) |
| [`peb-mcp-spec.md`](./SPECS/peb-mcp-spec.md) | PEB validates transitions at a different layer |

---

## 5. Canonical Event Record (CER)

**Canonical definition:** [`CER_SPEC.md`](./SPECS/CER_SPEC.md)

The single canonical event format for all system events after emission. Raw input exists only as a transient ingestion format. Events are append-only, immutable, identity-stable.

| File | Relationship |
| --- | --- |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | **Canonical definition** — base schema v1 |
| [`CER_CCNF.md`](./SPECS/CER_CCNF.md) | Canonical Normalization Function — deterministic transform |
| [`CER_SNAPSHOT_ENGINE.md`](./SPECS/CER_SNAPSHOT_ENGINE.md) | Snapshot Engine — compressed state materialization |
| [`CCNF_FAILURE_MODES.md`](./SPECS/CCNF_FAILURE_MODES.md) | Failure mode catalog for normalization |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | All events stored as CER — event type taxonomy |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | Reconstructs state from CER event log |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | V12 — CER validation rules |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | State derivation via CER event log |
| [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | entity_key from CER for stable resolution |
| [`ANALYSIS.md`](./ANALYSIS.md) | CER event backbone references |

---

## 6. CCNF (CER Canonical Normalization Function)

**Canonical definition:** [`CER_CCNF.md`](./SPECS/CER_CCNF.md)

Deterministic transformation from raw event input into a canonical CER payload with stable identity and cryptographic hash. Guarantees deterministic identity, replay stability, distributed consistency, and collapse safety.

| File | Relationship |
| --- | --- |
| [`CER_CCNF.md`](./SPECS/CER_CCNF.md) | **Canonical definition** |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | Output schema — CER payload |
| [`CER_SNAPSHOT_ENGINE.md`](./SPECS/CER_SNAPSHOT_ENGINE.md) | Snapshots depend on CCNF stability |
| [`CCNF_FAILURE_MODES.md`](./SPECS/CCNF_FAILURE_MODES.md) | Failure mode catalog |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | ccnf_version field in event schema |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | V12 CER validation rules |

---

## 7. Replay Engine

**Canonical definition:** [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md)

A temporal AST interpreter that performs deterministic reconstruction of state over time by re-applying a totally ordered CER event log. It is a temporal interpreter, not an executor.

| File | Relationship |
| --- | --- |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | **Canonical definition** |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Observation Layer foundation |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | Consumes CER event log |
| [`CER_SNAPSHOT_ENGINE.md`](./SPECS/CER_SNAPSHOT_ENGINE.md) | Snapshots are derived compression for fast replay start |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | Reconstructs ExecutionGraph state |
| [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | Phase 3 uses replay for state reconstruction |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | Ephemeral observation events emitted by replay |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | Replay integration for distributed event logs |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | Replay ignores validation events — pure fold |
| [`codex-session-ingest-findings.md`](./ENGINEERING/codex-session-ingest-findings.md) | `replay_engine.py` implementation notes |

---

## 8. Event Grammar

**Canonical definition:** [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md)

Event type taxonomy, causal grammar, and system constraints. All events are stored as Canonical Event Records (CER). Defines the event type hierarchy across Specification, Lowering, Execution, System, and Observation domains.

| File | Relationship |
| --- | --- |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | **Canonical definition** |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | CER absorbs and extends event grammar |
| [`CER_CCNF.md`](./SPECS/CER_CCNF.md) | Canonical normalization for all events |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | Replay handles all domain event types |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | ExecutionGraph events |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | ValidationFailure events |
| [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | Observation views derived from typed events |
| [`ARCHITECTURE/message-semantic-taxonomy.md`](./ARCHITECTURE/message-semantic-taxonomy.md) | Parallel semantic role classification |

---

## 9. PEB (Persistent Engineering Brain)

**Canonical definition:** [`peb-mcp-spec.md`](./SPECS/peb-mcp-spec.md) (architecture), [`peb-spring-boot-spec.md`](./SPECS/peb-spring-boot-spec.md) (implementation)

A cognitive governance service — deterministic state transition kernel with MCP as interface. PEB is the sole writer to the Knowledge Graph (via Steward). Validates committed canonical state transitions.

| File | Relationship |
| --- | --- |
| [`peb-mcp-spec.md`](./SPECS/peb-mcp-spec.md) | **Architecture definition** (v2 — revised) |
| [`peb-spring-boot-spec.md`](./SPECS/peb-spring-boot-spec.md) | **Implementation spec** (Spring Boot) |
| [`Understanding Nexus PEB Structure.md`](./ENGINEERING/Understanding%20Nexus%20PEB%20Structure.md) | Exploratory overview of `.agent/peb/` |
| [`ANALYSIS.md`](./ANALYSIS.md) §4 | PEB as aspirational long-term memory layer |
| [`cognitive-integrity-rule-system.md`](./SPECS/cognitive-integrity-rule-system.md) | CIRS governs PEB decisions, Merkle hash, proof integrity |
| [`atten-spec.md`](./SPECS/atten-spec.md) | PEB validates committed state, not Atten's projections |
| [`ANALYSIS/atten-is-not-a-brain.md`](./ANALYSIS/atten-is-not-a-brain.md) | PEB's correct positioning |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | PEB in L3 Domain Modeling |
| [`dev-runtime-manifest.md`](./SPECS/dev-runtime-manifest.md) | CIRS rules + PEB invariants in manifest |
| [`ANALYSIS/operator-plane-gap-analysis.md`](./ANALYSIS/operator-plane-gap-analysis.md) | PEB invariants, service config |
| [`PROMPTS/0088-peb-mcp-spec-critique-and-revision.md`](./PROMPTS/0088-peb-mcp-spec-critique-and-revision.md) | Critique that led to v2 revision |

---

## 10. CIRS (Cognitive Integrity Rule System)

**Canonical definition:** [`cognitive-integrity-rule-system.md`](./SPECS/cognitive-integrity-rule-system.md)

Rule framework managing agent runtime integrity. Governs Projection Integrity (IR), Cross-Domain Separation (CORE), and Audit Non-Influence (AUD). Supersedes CIR-only framing.

| File | Relationship |
| --- | --- |
| [`cognitive-integrity-rule-system.md`](./SPECS/cognitive-integrity-rule-system.md) | **Canonical definition** |
| [`ANALYSIS.md`](./ANALYSIS.md) | CIR vs CIRS disambiguation (§30) |
| [`dev-runtime-manifest.md`](./SPECS/dev-runtime-manifest.md) | CIRS rules in manifest-driven runtime |
| [`peb-mcp-spec.md`](./SPECS/peb-mcp-spec.md) | CIRS governs PEB governance decisions |
| [`atten-spec.md`](./SPECS/atten-spec.md) | CIRS enforces constraints on Atten's projections |
| [`WORKREQUEST_SPEC.md`](./SPECS/WORKREQUEST_SPEC.md) | CIRS governs execution authority |

---

## 11. Conduit (Active System)

**Status:** The active operational system. All aspirational WRP docs carry a disclaimer noting Conduit is the active system.

| File | Relationship |
| --- | --- |
| [`conduit-code-assessment.md`](./ENGINEERING/conduit-code-assessment.md) | Current state assessment |
| [`conduit-db-conversion.md`](./SPECS/conduit-db-conversion.md) | SQLite → PostgreSQL migration spec |
| [`ARCHITECTURE/conduit-hang-remediation.md`](./ARCHITECTURE/conduit-hang-remediation.md) | Hang cycle fixes for model dispatch |
| [`DAEMON_README.md`](./ENGINEERING/DAEMON_README.md) | WRP Daemon watches `.conduit-data/WORK_REQUESTS/` |
| [`ANALYSIS.md`](./ANALYSIS.md) | Conduit as active system (§1) |
| [`ANALYSIS/operator-plane-gap-analysis.md`](./ANALYSIS/operator-plane-gap-analysis.md) | Conduit scaffolding (`.conduit-data/`) |
| [`ANALYSIS/atten-is-not-a-brain.md`](./ANALYSIS/atten-is-not-a-brain.md) | Conduit acts on truth |
| [`MODEL_VERIFICATION.md`](./ENGINEERING/MODEL_VERIFICATION.md) | Conduit invocation via `test_invoke.py` |
| [`ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md`](./ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md) | Conduit invocation via MCP test endpoint |
| [`cognitive-integrity-rule-system.md`](./SPECS/cognitive-integrity-rule-system.md) | CIRS across Nexus/Conduit boundary |
| [`peb-mcp-spec.md`](./SPECS/peb-mcp-spec.md) | PEB integration with conduit-mcp |
| [`peb-spring-boot-spec.md`](./SPECS/peb-spring-boot-spec.md) | Conduit Adapter (Phase 2+) |
| [`dev-runtime-manifest.md`](./SPECS/dev-runtime-manifest.md) | Conduit as mounted execution subsystem |
| [`PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md`](./PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md) | Conduit UI migration |
| [`PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md`](./PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md) | Conduit markdown → PostgreSQL |
| [`PLANS/completed/0084-rename-conduit-io-to-conduit.md`](./PLANS/completed/0084-rename-conduit-io-to-conduit.md) | `conduit.io` → `conduit` rename |
| [`IMPLEMENTATION_PLANS/pending/model-integration-and-fallback-test-v0130.md`](./IMPLEMENTATION_PLANS/pending/model-integration-and-fallback-test-v0130.md) | Conduit pipeline model fallback test |
| [`IMPLEMENTATION_PLANS/pending/model-chain-ollama-qwen-test-v0132.md`](./IMPLEMENTATION_PLANS/pending/model-chain-ollama-qwen-test-v0132.md) | Model chain fallback test via conduit |
| [`IMPLEMENTATION_PLANS/pending/file-before-shell-ordering-end-to-end-test-v0107.md`](./IMPLEMENTATION_PLANS/pending/file-before-shell-ordering-end-to-end-test-v0107.md) | Conduit executor file-before-shell ordering |
| [`IMPLEMENTATION_PLANS/pending/ollama-shell-execution-test-cleaner-v0103.md`](./IMPLEMENTATION_PLANS/pending/ollama-shell-execution-test-cleaner-v0103.md) | Shell execution test in conduit pipeline |
| [`IMPLEMENTATION_PLANS/pending/e2e-test-plan---temporal-dispatch-v0121.md`](./IMPLEMENTATION_PLANS/pending/e2e-test-plan---temporal-dispatch-v0121.md) | Temporal pipeline dispatch end-to-end |

---

## 12. MessageBox

**Canonical definition:** [`ARCHITECTURE/messagebox-core-architecture.md`](./ARCHITECTURE/messagebox-core-architecture.md)

Canonical messaging semantics layer. Transport-agnostic — NATS is one possible transport, not the architecture. Carries Intent/Command/Event/Receipt/Proposal/Projection messages.

| File | Relationship |
| --- | --- |
| [`ARCHITECTURE/messagebox-core-architecture.md`](./ARCHITECTURE/messagebox-core-architecture.md) | **Core architecture** |
| [`ARCHITECTURE/message-semantic-taxonomy.md`](./ARCHITECTURE/message-semantic-taxonomy.md) | Semantic role classification |
| [`ARCHITECTURE/transport-abstraction-spec.md`](./ARCHITECTURE/transport-abstraction-spec.md) | Transport/Ledger provider abstraction |
| [`ARCHITECTURE/steward-spec.md`](./ARCHITECTURE/steward-spec.md) | Steward subscribes via MessageBox MCP |
| [`IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md`](./IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md) | Implementation plan |
| [`IMPLEMENTATION_PLANS/pending/0077-slash-commands-in-chat-ui.md`](./IMPLEMENTATION_PLANS/pending/0077-slash-commands-in-chat-ui.md) | Slash commands in message box |
| [`IMPLEMENTATION_PLANS/pending/0075-reduce-message-box-size.md`](./IMPLEMENTATION_PLANS/pending/0075-reduce-message-box-size.md) | Message box dimensions |

---

## 13. Steward (Knowledge Graph Governor)

**Canonical definition:** [`ARCHITECTURE/steward-spec.md`](./ARCHITECTURE/steward-spec.md)

The sole writer to the Knowledge Graph. Validates proposals against ontology constraints, classifies changes, mutates the KG, and emits mutation receipts. Subscribes to `proposal.*` through MessageBox MCP.

| File | Relationship |
| --- | --- |
| [`ARCHITECTURE/steward-spec.md`](./ARCHITECTURE/steward-spec.md) | **Canonical definition** |
| [`ARCHITECTURE/messagebox-core-architecture.md`](./ARCHITECTURE/messagebox-core-architecture.md) | System responsibility map |
| [`ARCHITECTURE/message-semantic-taxonomy.md`](./ARCHITECTURE/message-semantic-taxonomy.md) | Steward emits/uses Proposal and kg.mutation.* |
| [`IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md`](./IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md) | Implementation plan |

---

## 14. NATS (Transport)

| File | Relationship |
| --- | --- |
| [`ARCHITECTURE/transport-abstraction-spec.md`](./ARCHITECTURE/transport-abstraction-spec.md) | NATS provider specification |
| [`ARCHITECTURE/messagebox-core-architecture.md`](./ARCHITECTURE/messagebox-core-architecture.md) | NATS as default transport |
| [`ENGINEERING/reports/NATS_CASCADE_INTEGRATION_STATUS.md`](./ENGINEERING/reports/NATS_CASCADE_INTEGRATION_STATUS.md) | Implementation status assessment |
| [`ARCHITECTURE/message-semantic-taxonomy.md`](./ARCHITECTURE/message-semantic-taxonomy.md) | NATS subject mapping |
| [`IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md`](./IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md) | NATS provider implementation |
| [`ANALYSIS.md`](./ANALYSIS.md) | NATS JetStream as event backbone |

---

## 15. IRL (Interaction Reasoning Layer)

**Canonical definition:** [`nexus_irl_taxonomy.md`](./ANALYSIS/nexus_irl_taxonomy.md)

Probabilistic, constraint-aware semantic classification layer. Answers "what kind of interaction is this?" using 8 probabilistic archetypes. Layer A of the three-layer system.

| File | Relationship |
| --- | --- |
| [`nexus_irl_taxonomy.md`](./ANALYSIS/nexus_irl_taxonomy.md) | **Canonical definition** — 8 probabilistic archetypes |
| [`nexus_interaction_taxonomy.md`](./ANALYSIS/nexus_interaction_taxonomy.md) | IR-side companion — 9 deterministic archetypes |

---

## 16. IR Interaction Archetypes (Deterministic)

**Canonical definition:** [`nexus_interaction_taxonomy.md`](./ANALYSIS/nexus_interaction_taxonomy.md)

Closed contract governing how the deterministic Append-Only Object Registry (IR) is permitted to evolve. 9 archetypes: Construction, Execution, Reflection, Reconciliation, Revision, Counterfactual, Audit, Compression, Constraint Injection.

| File | Relationship |
| --- | --- |
| [`nexus_interaction_taxonomy.md`](./ANALYSIS/nexus_interaction_taxonomy.md) | **Canonical definition** — 9 closed-contract archetypes |
| [`nexus_irl_taxonomy.md`](./ANALYSIS/nexus_irl_taxonomy.md) | IRL-side companion — 8 probabilistic archetypes |
| [`AUTHORITY_GRAPH_IR.md`](./SPECS/AUTHORITY_GRAPH_IR.md) | Append-Only Object Registry (IR) governed by these archetypes |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | AEI validation enforces these constraints |

---

## 17. Atten (Attention / Saliency Governor)

**Canonical definition:** [`atten-spec.md`](./SPECS/atten-spec.md)

Multi-state projection generator. Projects candidate states for review. NOT a cognitive brain — it is a projection engine. PEB validates committed canonical state transitions, not Atten's candidate projections.

| File | Relationship |
| --- | --- |
| [`atten-spec.md`](./SPECS/atten-spec.md) | **Canonical definition** |
| [`ANALYSIS/atten-is-not-a-brain.md`](./ANALYSIS/atten-is-not-a-brain.md) | Critical analysis — Atten is a projection engine |
| [`peb-mcp-spec.md`](./SPECS/peb-mcp-spec.md) | PEB's relationship to Atten |
| [`cognitive-integrity-rule-system.md`](./SPECS/cognitive-integrity-rule-system.md) | CIRS enforces constraints on Atten |
| [`ANALYSIS.md`](./ANALYSIS.md) | Atten's position in architecture |
| [`ANALYSIS/operator-plane-gap-analysis.md`](./ANALYSIS/operator-plane-gap-analysis.md) | Atten's role in operator plane |

---

## 18. PostgreSQL Migration

| File | Relationship |
| --- | --- |
| [`conduit-db-conversion.md`](./SPECS/conduit-db-conversion.md) | **SQLite → PostgreSQL migration spec** |
| [`conduit-code-assessment.md`](./ENGINEERING/conduit-code-assessment.md) | Assessment identifying FS/DB tension |
| [`PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md`](./PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md) | nebula-ui LocalStorage → PostgreSQL |
| [`PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md`](./PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md) | Conduit markdown metadata → PostgreSQL |
| [`PLANS/completed/0085-migrate-mysql-to-postgres-nexus.md`](./PLANS/completed/0085-migrate-mysql-to-postgres-nexus.md) | JVM MySQL → PostgreSQL schema migration |
| [`IMPLEMENTATION_PLANS/completed/create-nebula-postgresql-database-and-run-schema-d-v0086.md`](./IMPLEMENTATION_PLANS/completed/create-nebula-postgresql-database-and-run-schema-d-v0086.md) | nebula PostgreSQL database creation |
| [`IMPLEMENTATION_PLANS/completed/scaffold-nebula-srv-express-project-with-pg-connec-v0089.md`](./IMPLEMENTATION_PLANS/completed/scaffold-nebula-srv-express-project-with-pg-connec-v0089.md) | Express server with pg Pool connection |
| [`IMPLEMENTATION_PLANS/completed/add-httpclient-and-apiurl-to-angular-environment-c-v0094.md`](./IMPLEMENTATION_PLANS/completed/add-httpclient-and-apiurl-to-angular-environment-c-v0094.md) | Angular HttpClient wiring for API |
| [`IMPLEMENTATION_PLANS/completed/implement-localstorage-migration-flow-on-first-loa-v0095.md`](./IMPLEMENTATION_PLANS/completed/implement-localstorage-migration-flow-on-first-loa-v0095.md) | localStorage → API migration flow |
| [`IMPLEMENTATION_PLANS/planning/remove-localstorage-persistence-helpers-and-unused-v0099.md`](./IMPLEMENTATION_PLANS/planning/remove-localstorage-persistence-helpers-and-unused-v0099.md) | Remove localStorage persistence helpers |
| [`IMPLEMENTATION_PLANS/pending/pg-full-cycle-test-0105-v0105.md`](./IMPLEMENTATION_PLANS/pending/pg-full-cycle-test-0105-v0105.md) | Full PG pipeline cycle test |
| [`ARCHITECTURE/steward-spec.md`](./ARCHITECTURE/steward-spec.md) | Postgres as default KG backend |
| [`ARCHITECTURE/messagebox-core-architecture.md`](./ARCHITECTURE/messagebox-core-architecture.md) | Postgres as default ledger |

---

## 19. Taxonomy / Terminology

| File | Relationship |
| --- | --- |
| [`nexus_irl_taxonomy.md`](./ANALYSIS/nexus_irl_taxonomy.md) | IRL probabilistic archetypes (8) |
| [`nexus_interaction_taxonomy.md`](./ANALYSIS/nexus_interaction_taxonomy.md) | IR deterministic archetypes (9) |
| [`terminology-audit.md`](./ENGINEERING/terminology-audit.md) | Service Registry / Host Server terminology audit |
| [`ARCHITECTURE/message-semantic-taxonomy.md`](./ARCHITECTURE/message-semantic-taxonomy.md) | Message semantic role taxonomy |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | Event type taxonomy |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | F-class failure taxonomy |
| [`mildred-datamodel-critique.md`](./ENGINEERING/mildred-datamodel-critique.md) | Typed ontology / taxonomy system |

---

## 20. Specification Compiler (Phase 1)

**Canonical definition:** [`PHASE1_SPECIFICATION_COMPILER.md`](./SPECS/PHASE1_SPECIFICATION_COMPILER.md)

Transforms prompts into requirements or WorkRequests. Functions like a compiler front-end/optimizer.

| File | Relationship |
| --- | --- |
| [`PHASE1_SPECIFICATION_COMPILER.md`](./SPECS/PHASE1_SPECIFICATION_COMPILER.md) | **Canonical definition** |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Phase 1 in four-phase architecture |
| [`WORKREQUEST_SPEC.md`](./SPECS/WORKREQUEST_SPEC.md) | Output: WorkRequestGraph |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | Phase 1.5 receives Phase 1 output |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | Phase 1 produces WorkRequestGraph |
| [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | Pipeline: Phase 1 → WorkRequestGraph |
| [`ANALYSIS/operator-plane-gap-analysis.md`](./ANALYSIS/operator-plane-gap-analysis.md) | Phase 1 spec reference |

---

## 21. Execution Runtime (Phase 2)

**Canonical definition:** [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md)

Takes a frozen ExecutionGraph and interprets it as a program via a deterministic Scheduler. The event stream is the verifiable causal trace.

| File | Relationship |
| --- | --- |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | **Canonical definition** |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Phase 2 in four-phase architecture |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | Input: frozen ExecutionGraph |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | Phase 1.5 produces Phase 2 input |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | Runtime validation (R1–R10) |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | Multi-node scheduler extension |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | Temporal reconstruction from execution events |

---

## 22. Observation Model (Phase 3)

**Canonical definition:** [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md)

Pure projection layer over (ExecutionGraph + EventLog + ReplayState) that produces derived semantic views for inspection, analysis, and debugging. Views are ephemeral, session-bound.

| File | Relationship |
| --- | --- |
| [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | **Canonical definition** |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Phase 3 in four-phase architecture |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | Observation Engine uses replay for reconstruction |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | Primary inputs: ExecutionGraph + EventLog |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | Event types consumed by observation |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | entity_key for stable entity resolution |

---

## 23. Pipeline Intent

**Canonical definition:** [`PIPELINE_INTENT_SPEC.md`](./SPECS/PIPELINE_INTENT_SPEC.md)

Declaration of what the pipeline does with WorkRequests. Clarifies the relationship between project intent and pipeline behavior.

| File | Relationship |
| --- | --- |
| [`PIPELINE_INTENT_SPEC.md`](./SPECS/PIPELINE_INTENT_SPEC.md) | **Canonical definition** |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Control plane: PIPELINE_INTENT.yaml → normalize-intent |
| [`WORKREQUEST_SPEC.md`](./SPECS/WORKREQUEST_SPEC.md) | WorkRequest as pipeline input |

---

## 24. Authority Graph

**Canonical definition:** [`AUTHORITY_GRAPH_IR.md`](./SPECS/AUTHORITY_GRAPH_IR.md)

The Append-Only Object Registry (IR) — foundational deterministic structural graph for Nexus. Governed by a "Closed Contract" of interaction archetypes.

| File | Relationship |
| --- | --- |
| [`AUTHORITY_GRAPH_IR.md`](./SPECS/AUTHORITY_GRAPH_IR.md) | **Canonical definition** |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | AEI validation dimensions (AEI1–AEI4) |
| [`nexus_interaction_taxonomy.md`](./ANALYSIS/nexus_interaction_taxonomy.md) | Closed contract governing IR evolution |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | `validate_authority()` pre-lowering gate |

---

## 25. Distributed Scheduler

**Canonical definition:** [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md)

Multi-host AST interpreter for distributed execution. Each scheduler independently rehydrates and replays the CER event log to compute current ExecutionGraph state.

| File | Relationship |
| --- | --- |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | **Canonical definition** |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | Single-host runtime — this extends to multi-host |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | ExecutionGraph consumed by scheduler |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | Runtime validation (R2, R3, R8) |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | State derivation via CER event log |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | Replay integration for distributed logs |

---

## 26. E2E Pipeline Test Plans

**Phrase reuse:** "end-to-end", "E2E", "pipeline test", "verify", "pipeline dispatch"

A cluster of implementation plans that verify pipeline behavior from plan creation through builder dispatch to completion. Many are duplicates or near-duplicates of the same test scenario.

| File | Relationship |
| --- | --- |
| [`IMPLEMENTATION_PLANS/pending/e2e-pipeline-test-v0127.md`](./IMPLEMENTATION_PLANS/pending/e2e-pipeline-test-v0127.md) | Plan creation → builder dispatch → completion |
| [`IMPLEMENTATION_PLANS/pending/e2e-test-plan---temporal-dispatch-v0121.md`](./IMPLEMENTATION_PLANS/pending/e2e-test-plan---temporal-dispatch-v0121.md) | Temporal pipeline dispatch and execution |
| [`IMPLEMENTATION_PLANS/planning/e2e-pipeline-test-v2-v0112.md`](./IMPLEMENTATION_PLANS/planning/e2e-pipeline-test-v2-v0112.md) | All changes: proposed → planning → PLAN_CREATE → scheduler |
| [`IMPLEMENTATION_PLANS/pending/e2e-workflow-session-test-v0117.md`](./IMPLEMENTATION_PLANS/pending/e2e-workflow-session-test-v0117.md) | Temporal workflow populates session metadata |
| [`IMPLEMENTATION_PLANS/pending/session-adapter-e2e-test-v0116.md`](./IMPLEMENTATION_PLANS/pending/session-adapter-e2e-test-v0116.md) | Workflow metadata flows into sessions table |
| [`IMPLEMENTATION_PLANS/pending/hello-world-emit-verification-output-from-nexus-pi-v0120.md`](./IMPLEMENTATION_PLANS/pending/hello-world-emit-verification-output-from-nexus-pi-v0120.md) | Hello-world pipeline verification |
| [`IMPLEMENTATION_PLANS/pending/say-hello-from-pipeline-v0118.md`](./IMPLEMENTATION_PLANS/pending/say-hello-from-pipeline-v0118.md) | Hello-world pipeline confirmation |
| [`IMPLEMENTATION_PLANS/pending/default-e2e-test-v0109.md`](./IMPLEMENTATION_PLANS/pending/default-e2e-test-v0109.md) | cleaner.py as default e2e test |
| [`IMPLEMENTATION_PLANS/pending/file-before-shell-ordering-end-to-end-test-v0107.md`](./IMPLEMENTATION_PLANS/pending/file-before-shell-ordering-end-to-end-test-v0107.md) | File-before-shell ordering test |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | Execution lifecycle (§8) — the pipeline these plans test |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | Scheduler tick loop (§4) — what these plans validate |
| [`ARCHITECTURE/conduit-hang-remediation.md`](./ARCHITECTURE/conduit-hang-remediation.md) | Hang cycles these E2E tests should catch |
| [`ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md`](./ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md) | Conduit invocation via MCP test endpoint |

---

## 27. Harness Capability Testing (cleaner.py as Test Payload)

**Phrase reuse:** "cleaner.py", "transcript", "harness", "model invocation", "pipeline step", "exit code 0"

These plans all use `cleaner.py` as a trivial test payload to validate that different harness/model combinations can execute through the Conduit pipeline. The phrase reuse reveals that the real subject is **harness capability testing**, not the cleaner script itself.

| File | Relationship |
| --- | --- |
| [`IMPLEMENTATION_PLANS/pending/ollama-opencode-integration-test-cleaner-v0102.md`](./IMPLEMENTATION_PLANS/pending/ollama-opencode-integration-test-cleaner-v0102.md) | cleaner.py via opencode harness — validates ollama integration |
| [`IMPLEMENTATION_PLANS/pending/ollama-shell-execution-test-cleaner-v0103.md`](./IMPLEMENTATION_PLANS/pending/ollama-shell-execution-test-cleaner-v0103.md) | cleaner.py via shell execution — validates `$ ` command generation |
| [`IMPLEMENTATION_PLANS/pending/big-pickle-cleanerpy-builder-test-v0131.md`](./IMPLEMENTATION_PLANS/pending/big-pickle-cleanerpy-builder-test-v0131.md) | cleaner.py via big-pickle — validates opencode/big-pickle routing |
| [`IMPLEMENTATION_PLANS/pending/run-transcript-cleaner-on-nexuspythonutil-v0122.md`](./IMPLEMENTATION_PLANS/pending/run-transcript-cleaner-on-nexuspythonutil-v0122.md) | Canonical transcript cleaner test |
| [`IMPLEMENTATION_PLANS/pending/run-transcript-cleaner-and-verify-output-v0129.md`](./IMPLEMENTATION_PLANS/pending/run-transcript-cleaner-and-verify-output-v0129.md) | Near-duplicate of 0122 |
| [`IMPLEMENTATION_PLANS/pending/run-transcript-cleaner-and-verify-output-v0108.md`](./IMPLEMENTATION_PLANS/pending/run-transcript-cleaner-and-verify-output-v0108.md) | Earlier version of same test |
| [`IMPLEMENTATION_PLANS/pending/default-e2e-test-v0109.md`](./IMPLEMENTATION_PLANS/pending/default-e2e-test-v0109.md) | Renames + runs cleaner.py |
| [`IMPLEMENTATION_PLANS/pending/ollama-startfileendfile-format-test-v0106.md`](./IMPLEMENTATION_PLANS/pending/ollama-startfileendfile-format-test-v0106.md) | START_FILE/END_FILE format validation |
| [`IMPLEMENTATION_PLANS/pending/file-before-shell-ordering-end-to-end-test-v0107.md`](./IMPLEMENTATION_PLANS/pending/file-before-shell-ordering-end-to-end-test-v0107.md) | File-before-shell ordering in executor |
| [`ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md`](./ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md) | Model compatibility assessment — tool-calling, reasoning, latency |
| [`ARCHITECTURE/conduit-hang-remediation.md`](./ARCHITECTURE/conduit-hang-remediation.md) | F2: Log and validate fallback model binary |
| [`conduit-code-assessment.md`](./ENGINEERING/conduit-code-assessment.md) | Prior assessment identifying harness dispatch issues |

---

## 28. Model Fallback Chain & Model Integration

**Phrase reuse:** "model chain", "fallback", "model integration", "circuit breaker", "hang cycle", "qwen2.5-coder", "ollama", "provider prefix"

Plans and specs that test or fix the model fallback chain: primary model fails → secondary model → tertiary model. The `ARCHITECTURE/conduit-hang-remediation.md` defines the root causes (RC1–RC6) and fixes (F1–F7) that these plans exercise. Includes qwen2.5-coder tests (only confirmed working ollama model for tool-calling).

| File | Relationship |
| --- | --- |
| [`ARCHITECTURE/conduit-hang-remediation.md`](./ARCHITECTURE/conduit-hang-remediation.md) | **Root cause definitions** (RC1–RC6) and fixes (F1–F7) |
| [`IMPLEMENTATION_PLANS/pending/model-integration-and-fallback-test-v0130.md`](./IMPLEMENTATION_PLANS/pending/model-integration-and-fallback-test-v0130.md) | E2E test: primary fails → fallback → BLOCK receipt (tests F1–F7) |
| [`IMPLEMENTATION_PLANS/pending/model-chain-ollama-qwen-test-v0132.md`](./IMPLEMENTATION_PLANS/pending/model-chain-ollama-qwen-test-v0132.md) | 3-model chain: qwen3.7-max → qwen2.5-coder → big-pickle |
| [`IMPLEMENTATION_PLANS/pending/provider-prefix-test-v0128.md`](./IMPLEMENTATION_PLANS/pending/provider-prefix-test-v0128.md) | Provider prefix fix: `ollama/qwen2.5-coder:latest` |
| [`IMPLEMENTATION_PLANS/pending/test-qwen-pipeline-v0123.md`](./IMPLEMENTATION_PLANS/pending/test-qwen-pipeline-v0123.md) | qwen2.5-coder via pipeline |
| [`IMPLEMENTATION_PLANS/pending/test-qwen25-coder-via-pipeline-v0126.md`](./IMPLEMENTATION_PLANS/pending/test-qwen25-coder-via-pipeline-v0126.md) | Near-duplicate of 0123 |
| [`IMPLEMENTATION_PLANS/pending/qwen-25-coder-smoke-test-v0125.md`](./IMPLEMENTATION_PLANS/pending/qwen-25-coder-smoke-test-v0125.md) | Smoke test: create file |
| [`ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md`](./ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md) | Model compatibility assessment — tool-calling, reasoning, latency |
| [`conduit-code-assessment.md`](./ENGINEERING/conduit-code-assessment.md) | Prior assessment identifying model dispatch issues |

---



---

## 30. localStorage → PostgreSQL Migration Cluster

**Phrase reuse:** "localStorage", "migrate", "remove localStorage", "replace with HTTP", "fetchSystems", "optimistic"

Plans sharing the "localStorage to PostgreSQL" migration story — from the initial full migration plan through the DataService HTTP rewrite to the cleanup of persistence helpers. These plans are the operational implementation of the 3-authority resolution principle (DB as source of truth, file as artifact).

| File | Relationship |
| --- | --- |
| [`PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md`](./PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md) | **Master plan** — full localStorage → PostgreSQL migration |
| [`IMPLEMENTATION_PLANS/completed/add-httpclient-and-apiurl-to-angular-environment-c-v0094.md`](./IMPLEMENTATION_PLANS/completed/add-httpclient-and-apiurl-to-angular-environment-c-v0094.md) | Angular HttpClient wiring (prerequisite for HTTP rewrite) |
| [`IMPLEMENTATION_PLANS/completed/implement-localstorage-migration-flow-on-first-loa-v0095.md`](./IMPLEMENTATION_PLANS/completed/implement-localstorage-migration-flow-on-first-loa-v0095.md) | Migration flow: detect localStorage → POST /api/import → clear keys |
| [`IMPLEMENTATION_PLANS/planning/rewrite-dataservice-crud-methods-to-use-http-with--v0092.md`](./IMPLEMENTATION_PLANS/planning/rewrite-dataservice-crud-methods-to-use-http-with--v0092.md) | DataService mutation methods → HTTP with optimistic updates |
| [`IMPLEMENTATION_PLANS/planning/remove-localstorage-persistence-helpers-and-unused-v0099.md`](./IMPLEMENTATION_PLANS/planning/remove-localstorage-persistence-helpers-and-unused-v0099.md) | Remove all localStorage.getItem/setItem calls |
| [`PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md`](./PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md) | Conduit markdown metadata → PostgreSQL (companion plan) |
| [`conduit-db-conversion.md`](./SPECS/conduit-db-conversion.md) | SQLite → PostgreSQL migration spec |
| [`ANALYSIS.md`](./ANALYSIS.md) §15 | 3-authority problem — file/DB/runtime synchronization |

---

## 31. CRUD Endpoints (Nebula RMS)

**Phrase reuse:** "CRUD", "endpoints", "nebula-srv", "systems", "subsystems", "features", "requirements"

Plans implementing the Nebula RMS Express API layer — from database scaffolding through CRUD endpoints to server-side operations.

| File | Relationship |
| --- | --- |
| [`IMPLEMENTATION_PLANS/completed/scaffold-nebula-srv-express-project-with-pg-connec-v0089.md`](./IMPLEMENTATION_PLANS/completed/scaffold-nebula-srv-express-project-with-pg-connec-v0089.md) | Express server scaffold with pg Pool |
| [`IMPLEMENTATION_PLANS/completed/implement-systems-subsystems-features-crud-endpoin-v0088.md`](./IMPLEMENTATION_PLANS/completed/implement-systems-subsystems-features-crud-endpoin-v0088.md) | Systems/subsystems/features CRUD |
| [`IMPLEMENTATION_PLANS/completed/implement-folders-and-worksessions-crud-in-nebula--v0090.md`](./IMPLEMENTATION_PLANS/completed/implement-folders-and-worksessions-crud-in-nebula--v0090.md) | Folders and work_sessions CRUD |
| [`IMPLEMENTATION_PLANS/completed/implement-requirements-crud-endpoints-in-nebula-sr-v0091.md`](./IMPLEMENTATION_PLANS/completed/implement-requirements-crud-endpoints-in-nebula-sr-v0091.md) | Requirements CRUD with batch updates |
| [`IMPLEMENTATION_PLANS/planning/rewrite-dataservice-crud-methods-to-use-http-with--v0092.md`](./IMPLEMENTATION_PLANS/planning/rewrite-dataservice-crud-methods-to-use-http-with--v0092.md) | DataService mutation methods → HTTP |
| [`IMPLEMENTATION_PLANS/completed/implement-server-side-color-deduplication-for-subs-v0093.md`](./IMPLEMENTATION_PLANS/completed/implement-server-side-color-deduplication-for-subs-v0093.md) | Server-side color deduplication |
| [`IMPLEMENTATION_PLANS/completed/add-server-side-complex-operation-endpoints-in-neb-v0096.md`](./IMPLEMENTATION_PLANS/completed/add-server-side-complex-operation-endpoints-in-neb-v0096.md) | Transactional move/demote endpoints |
| [`IMPLEMENTATION_PLANS/pending/add-plans-display-endpoint-v0134.md`](./IMPLEMENTATION_PLANS/pending/add-plans-display-endpoint-v0134.md) | Plans display endpoints + MCP tools |

---

## 31. MessageBox + Steward Implementation

**Phrase reuse:** "MessageBox MCP", "Steward", "TransportProvider", "LedgerProvider", "proposal.kg", "GraphAdapter"

The implementation plan that realizes the ARCHITECTURE specs for MessageBox core, transport/ledger split, and Steward service.

| File | Relationship |
| --- | --- |
| [`IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md`](./IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md) | **Implementation plan** — Phase 1 |
| [`ARCHITECTURE/messagebox-core-architecture.md`](./ARCHITECTURE/messagebox-core-architecture.md) | Core contract this plan implements |
| [`ARCHITECTURE/transport-abstraction-spec.md`](./ARCHITECTURE/transport-abstraction-spec.md) | TransportProvider/LedgerProvider interfaces |
| [`ARCHITECTURE/steward-spec.md`](./ARCHITECTURE/steward-spec.md) | Steward runtime loop and proposal flow |
| [`ARCHITECTURE/message-semantic-taxonomy.md`](./ARCHITECTURE/message-semantic-taxonomy.md) | Semantic roles carried by MessageBox |

---

## 32. Determinism as System Invariant

**Phrase reuse:** "deterministic", "deterministic reconstruction", "replayable", "same input always produces same output"

The determinism invariant runs through nearly every spec document. It is the single most reused phrase in the corpus.

| File | Relationship |
| --- | --- |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | §2 System Invariant: Artifacts = State, Events = Causal Trace |
| [`PHASE1_SPECIFICATION_COMPILER.md`](./SPECS/PHASE1_SPECIFICATION_COMPILER.md) | §5: Fully deterministic and replayable |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | §9: Determinism of trace, observability, reproducibility |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | §7.1 Determinism: same WorkRequestGraph → identical ExecutionGraph |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | §3.1 Deterministic evaluation invariant |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | §13: same event log ⇒ same execution result |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | §3.3: apply(state, event) is pure |
| [`CER_CCNF.md`](./SPECS/CER_CCNF.md) | §10: CCNF is pure, total, idempotent, cross-host identical |
| [`CCNF_FAILURE_MODES.md`](./SPECS/CCNF_FAILURE_MODES.md) | FM#4: Hidden State Leakage — pure function enforcement |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | V6: Same input → same validation result |
| [`ANALYSIS.md`](./ANALYSIS.md) | §11.1: Systems converge toward determinism |

---

## 33. Append-Only / Immutable Event Log

**Phrase reuse:** "append-only", "immutable", "never modified after emission", "events are facts"

The append-only invariant for the event log is repeated across CER, Event Grammar, Replay, and the ANALYSIS synthesis.

| File | Relationship |
| --- | --- |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | §0: Events are append-only, immutable, identity-stable |
| [`EVENT_GRAMMAR.md`](./SPECS/EVENT_GRAMMAR.md) | §1: Events never own truth. Append-only, immutable, referential |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | §7: EventLog is source of truth, append-only |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | §5: Event log is authoritative. Append-only, partitionable |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | §5: Events are append-only, referential, reconstructible |
| [`ARCHITECTURE/messagebox-core-architecture.md`](./ARCHITECTURE/messagebox-core-architecture.md) | Ledger append-only semantics |
| [`ANALYSIS.md`](./ANALYSIS.md) | §27: Hash→Lookup→Projection — append-only identity model |

---

## 34. CER Identity Resolution (entity_key)

**Phrase reuse:** "entity_key", "collapse_key", "alias_keys", "canonical entity signature", "identity collapse"

The three-layer identity system (entity_key → collapse_key → alias_keys) is defined in CER_SPEC and CER_CCNF, then referenced across the observation and scheduler layers.

| File | Relationship |
| --- | --- |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | §3: Identity Collapse System — 3 layers, 4 rules |
| [`CER_CCNF.md`](./SPECS/CER_CCNF.md) | §4: Identity Derivation — entity_key = SHA256(canonical_entity_signature) |
| [`CCNF_FAILURE_MODES.md`](./SPECS/CCNF_FAILURE_MODES.md) | FM#3: Identity Key Instability — forbidden inputs to signature |
| [`OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | §12: CER Identity Resolution in Views — per-view identity rules |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | §X: entity_key as global node identity in distributed mode |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | §17: Rehydration resolves identity via collapse engine |

---

## 35. Frozen ExecutionGraph / Freeze Invariant

**Phrase reuse:** "frozen", "freeze", "topology immutable", "topology locked", "no nodes added or removed after freezing"

The freeze invariant is a boundary between compilation and execution. It appears in the Lowering Pass, Execution Graph Schema, Phase 2 Runtime, and Validator.

| File | Relationship |
| --- | --- |
| [`LOWERING_PASS.md`](./SPECS/LOWERING_PASS.md) | §5.11: Step 8 — Freeze. Graph topology locked after validation |
| [`EXECUTION_GRAPH_SCHEMA.md`](./SPECS/EXECUTION_GRAPH_SCHEMA.md) | §3.1: Immutable topology rule — only lifecycle_state, outputs, event_refs MAY mutate |
| [`PHASE2_EXECUTION_RUNTIME.md`](./SPECS/PHASE2_EXECUTION_RUNTIME.md) | §2: Frozen ExecutionGraph as input to scheduler |
| [`COMPILER_ARCHITECTURE.md`](./SPECS/COMPILER_ARCHITECTURE.md) | §4.3: Output must be frozen (topology immutable) |
| [`VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | S9: Frozen Topology Rule — mutability flag |

---

## 36. Snapshots as Derived Compression

**Phrase reuse:** "snapshot", "derived compression", "deletable, regenerable", "fast replay start", "NOT canonical truth"

Snapshots are explicitly NOT canonical truth — they are derived compression artifacts of CER history. This framing appears in CER_SPEC, CER_SNAPSHOT_ENGINE, and REPLAY_ENGINE.

| File | Relationship |
| --- | --- |
| [`CER_SNAPSHOT_ENGINE.md`](./SPECS/CER_SNAPSHOT_ENGINE.md) | **Canonical definition** — trigger model, triple-version lock |
| [`CER_SPEC.md`](./SPECS/CER_SPEC.md) | §5: Snapshot Triggers (4 conditions) |
| [`REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | §8: Snapshot Model — derived compression, not checkpoints |
| [`CER_CCNF.md`](./SPECS/CER_CCNF.md) | §12: Version Anchoring — snapshot validity requires triple-version lock |
| [`CCNF_FAILURE_MODES.md`](./SPECS/CCNF_FAILURE_MODES.md) | FM#9: Version Skew — triple-version lock enforcement |
| [`DISTRIBUTED_SCHEDULER.md`](./SPECS/DISTRIBUTED_SCHEDULER.md) | §17.1: Snapshots provide fast incremental replay |

---

## 37. Ingest Pipeline Modernization (DocLing)

**Phrase reuse:** "DocLing", "DoclingDocument", "DocumentConverter", "html-importer/parsers", "chat extractors", "BeautifulSoup migration"

The completed plan `0086-replace-ingest-parsers-with-docling.md` re-architects the html-importer ingest layer: drop `bs4`/`lxml`/`soupsieve` for DocLing's `DocumentConverter`, retain the existing chat-semantic `BaseParser` utilities against a `DoclingDocument` adapter, and unlock PDF/DOCX/PPTX/image OCR ingest. This is the operational implementation of the ingest modernization referenced in `ANALYSIS.md` §15.

| File | Relationship |
| --- | --- |
| [`PLANS/completed/0086-replace-ingest-parsers-with-docling.md`](./PLANS/completed/0086-replace-ingest-parsers-with-docling.md) | **Master plan** — replace beautifulsoup4 + lxml with docling |
| [`ENGINEERING/codex-session-ingest-findings.md`](./ENGINEERING/codex-session-ingest-findings.md) | Prior ingest findings — informs migration |
| [`SPECS/PHASE1_SPECIFICATION_COMPILER.md`](./SPECS/PHASE1_SPECIFICATION_COMPILER.md) | Phase 1 consumes DocLing → NormalizedMessage → IR envelope |
| [`ANALYSIS.md`](./ANALYSIS.md) | §15: 3-authority problem — DB/file/runtime boundary |
---

## 38. Phase-3 Temporal Restart Tests

**Phrase reuse:** "phase 3", "temporal restart", "ReplayEngine", "phase-3-temporal-restart"

Two parallel plans (one proposed, one pending) verify ReplayEngine restart behavior — the ability for a Temporal worker to crash mid-replay and resume from the last persisted ReplayState without violating the determinism invariant.

| File | Relationship |
| --- | --- |
| [`IMPLEMENTATION_PLANS/proposed/phase-3-temporal-restart-test-v0114.md`](./IMPLEMENTATION_PLANS/proposed/phase-3-temporal-restart-test-v0114.md) | **Proposed** — initial scope for phase-3 restart verification |
| [`IMPLEMENTATION_PLANS/pending/phase-3-temporal-restart-test-v0115.md`](./IMPLEMENTATION_PLANS/pending/phase-3-temporal-restart-test-v0115.md) | **Pending** — narrower scope derivation of v0114 |
| [`SPECS/REPLAY_ENGINE.md`](./SPECS/REPLAY_ENGINE.md) | §3.3: `apply(state, event)` is pure — restart safety contract |
| [`SPECS/CER_SPEC.md`](./SPECS/CER_SPEC.md) | §0: append-only event log — restart anchor point |
| [`SPECS/OBSERVATION_MODEL.md`](./SPECS/OBSERVATION_MODEL.md) | Phase 3 projection consumes resumed replay state |

---

## 39. Convex Removal & Dev-Infra Cleanup Refactor Cluster

**Phrase reuse:** "remove convex", "dev infra cleanup", "angular proxy config", "dead dependencies"

Plans cleaning up dead dependencies (convex) and tightening dev infrastructure (start script, proxy) so the dev loop matches the production conduit runtime.

| File | Relationship |
| --- | --- |
| [`IMPLEMENTATION_PLANS/planning/remove-convex-directory-and-dependencies-v0100.md`](./IMPLEMENTATION_PLANS/planning/remove-convex-directory-and-dependencies-v0100.md) | **Master refactor** — strip convex client, server, and routing layer |
| [`IMPLEMENTATION_PLANS/planning/update-startsh-and-proxy-config-for-nebula-srv-dev-v0098.md`](./IMPLEMENTATION_PLANS/planning/update-startsh-and-proxy-config-for-nebula-srv-dev-v0098.md) | Dev-mode start script + Angular proxy config for nebula-srv |
| [`IMPLEMENTATION_PLANS/planning/remove-localstorage-persistence-helpers-and-unused-v0099.md`](./IMPLEMENTATION_PLANS/planning/remove-localstorage-persistence-helpers-and-unused-v0099.md) | Companion: drop legacy localStorage persistence helpers (also §30) |
| [`PLANS/completed/0086-replace-ingest-parsers-with-docling.md`](./PLANS/completed/0086-replace-ingest-parsers-with-docling.md) | Sister refactor: drop beautifulsoup4/lxml for docling (also §37) |

---

## 40. Builder Execution Contract (v2 Design)

**Phrase reuse:** "Execution Packet", "atomic diff", "deterministic", "no invention", "no scope expansion", "v2 builder", "NEEDS_CLARIFICATION", "progress-based watchdog"

The v2 Builder Contract specifies replacing the markdown-plan → freeform-implementation builder with an Execution Packet (machine-readable diff + invariants + allowed/forbidden ops) model. The Builder becomes a deterministic executor with zero creative authority — needs info → emit `NEEDS_CLARIFICATION`, never guess.

| File | Relationship |
| --- | --- |
| [`REQUIREMENTS/v2-builder-contract.md`](./REQUIREMENTS/v2-builder-contract.md) | **Canonical requirements** — execution packet protocol, atomic diff ops, builder behavior contract |
| [`IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md`](./IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md) | Builder → MessageBox handoff ships the Execution Packet manifest |
| [`IMPLEMENTATION_PLANS/pending/say-hello-from-pipeline-v0118.md`](./IMPLEMENTATION_PLANS/pending/say-hello-from-pipeline-v0118.md) | First end-to-end slice exercising packet-based dispatch (also §1, §26) |
| [`SPECS/cognitive-integrity-rule-system.md`](./SPECS/cognitive-integrity-rule-system.md) | CIR/IR/AUD constraints the v2 contract must satisfy |
| [`SPECS/REQUIREMENTS_CAPTURE_BOUNDARY.md`](./SPECS/REQUIREMENTS_CAPTURE_BOUNDARY.md) | Boundary: planner captures invariants; builder only consumes them |
| [`ENGINEERING/pipeline-manager-acceptance-checklist.md`](./ENGINEERING/pipeline-manager-acceptance-checklist.md) | Acceptance checklist the contract must pass |
| [`ENGINEERING/conduit-code-assessment.md`](./ENGINEERING/conduit-code-assessment.md) | Prior assessment identifying root-cause defects v2 addresses |
| [`PROMPTS/0088-peb-mcp-spec-critique-and-revision.md`](./PROMPTS/0088-peb-mcp-spec-critique-and-revision.md) | Pattern: a single revision prompt can drive a contract redesign (PEB v2 thread) |

---

## 41. Inspections Registry (Bug Tracking Architecture)

**Phrase reuse:** "INSPECTIONS/REGISTRY", "inspection root", "ticket state directory", "V-class failure ticket", "FM catalog entry"

The `INSPECTIONS/` subtree (errors/, processed/, reports/, resolved/, todo/, triage/, unresolved/, warnings/) is the durable artifact pool whose inventory lives in `INSPECTIONS/REGISTRY.md`. The registry indexes every bug or warning captured across the project; the directories separate ticket state.

| File | Relationship |
| --- | --- |
| [`INSPECTIONS/REGISTRY.md`](./INSPECTIONS/REGISTRY.md) | **Catalog** — central index of every inspection and its current state |
| [`SPECS/VALIDATOR_SPEC.md`](./SPECS/VALIDATOR_SPEC.md) | Validators trip inspections: V-class failures route into `errors/` |
| [`SPECS/CCNF_FAILURE_MODES.md`](./SPECS/CCNF_FAILURE_MODES.md) | FM catalog — FM entries map to inspection roots |
| [`ANALYSIS.md`](./ANALYSIS.md) | §15–§17: 3-authority problem and inspectional reasoning lineage |
| [`ENGINEERING/codex-session-ingest-findings.md`](./ENGINEERING/codex-session-ingest-findings.md) | Sessioning findings — concrete precedent for ingestion-time inspection |
| [`ENGINEERING/terminology-audit.md`](./ENGINEERING/terminology-audit.md) | Terminology discrepancies become `warnings/` tickets |

---

## Quick-Reference: File → Concepts

| File | Concepts Defined |
| --- | --- |
| `SPECS/WORKREQUEST_SPEC.md` | WorkRequest IR |
| `SPECS/EXECUTION_GRAPH_SCHEMA.md` | ExecutionGraph |
| `SPECS/LOWERING_PASS.md` | Lowering Pass |
| `SPECS/VALIDATOR_SPEC.md` | ExecutionGraph Validator |
| `SPECS/CER_SPEC.md` | Canonical Event Record |
| `SPECS/CER_CCNF.md` | CCNF |
| `SPECS/CER_SNAPSHOT_ENGINE.md` | Snapshot Engine |
| `SPECS/REPLAY_ENGINE.md` | Replay Engine |
| `SPECS/EVENT_GRAMMAR.md` | Event Grammar |
| `SPECS/OBSERVATION_MODEL.md` | Observation Model (Phase 3) |
| `SPECS/PHASE1_SPECIFICATION_COMPILER.md` | Specification Compiler (Phase 1) |
| `SPECS/PHASE2_EXECUTION_RUNTIME.md` | Execution Runtime (Phase 2) |
| `SPECS/COMPILER_ARCHITECTURE.md` | Four-phase compiler architecture (hub) |
| `SPECS/peb-mcp-spec.md` | PEB architecture |
| `SPECS/peb-spring-boot-spec.md` | PEB implementation |
| `SPECS/cognitive-integrity-rule-system.md` | CIRS |
| `SPECS/atten-spec.md` | Atten |
| `ANALYSIS/nexus_irl_taxonomy.md` | IRL archetypes |
| `ANALYSIS/nexus_interaction_taxonomy.md` | IR archetypes |
| `ARCHITECTURE/messagebox-core-architecture.md` | MessageBox |
| `ARCHITECTURE/steward-spec.md` | Steward |
| `ARCHITECTURE/message-semantic-taxonomy.md` | Message taxonomy |
| `ARCHITECTURE/transport-abstraction-spec.md` | Transport abstraction |
| `SPECS/DISTRIBUTED_SCHEDULER.md` | Distributed Scheduler |
| `conduit-db-conversion.md` | PostgreSQL migration |
| `PIPELINE_INTENT_SPEC.md` | Pipeline Intent |
| `AUTHORITY_GRAPH_IR.md` | Authority Graph |
| `PLANS/completed/0082-nebula-localstorage-to-postgres-migration.md` | localStorage → PostgreSQL |
| `PLANS/completed/0083-conduit-markdown-metadata-to-postgres.md` | Conduit markdown → PostgreSQL |
| `PLANS/completed/0084-rename-conduit-io-to-conduit.md` | Conduit rename |
| `PLANS/completed/0085-migrate-mysql-to-postgres-nexus.md` | MySQL → PostgreSQL |
| `PLANS/completed/0086-replace-ingest-parsers-with-docling.md` | DocLing ingest migration |
| `IMPLEMENTATION_PLANS/proposed/messagebox-mcp-steward-v0115.md` | MessageBox + Steward impl |
| `IMPLEMENTATION_PLANS/pending/e2e-pipeline-test-v0127.md` | E2E pipeline test |
| `IMPLEMENTATION_PLANS/pending/model-integration-and-fallback-test-v0130.md` | Model fallback test |
| `IMPLEMENTATION_PLANS/pending/model-chain-ollama-qwen-test-v0132.md` | 3-model chain test |
| `IMPLEMENTATION_PLANS/pending/add-plans-display-endpoint-v0134.md` | Plans display API |
| `IMPLEMENTATION_PLANS/pending/0075-reduce-message-box-size.md` | MessageBox dimensions |
| `IMPLEMENTATION_PLANS/pending/0077-slash-commands-in-chat-ui.md` | Slash commands |
| `ENGINEERING/reports/NATS_CASCADE_INTEGRATION_STATUS.md` | NATS integration status |
| `ENGINEERING/reports/MODEL_FITNESS_ANALYSIS.md` | Model fitness assessment |
| `ANALYSIS.md` | Architecture analysis (19 transcripts) |
| `ANALYSIS/atten-is-not-a-brain.md` | Atten architectural correction |
| `ANALYSIS/operator-plane-gap-analysis.md` | Operator plane gap analysis |
