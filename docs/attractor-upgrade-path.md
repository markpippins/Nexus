# Attractor Upgrade Path — Delta Analysis

**Date:** 2026-07-24
**Author:** Architect (via Buffy/Codex)
**Status:** Exhaustive first pass — to be refined into implementation candidates

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Methodology](#2-methodology)
3. [Capability Matrix](#3-capability-matrix)
4. [Detailed Delta Analysis](#4-detailed-delta-analysis)
   - [4.1 Pipeline Definition](#41-pipeline-definition)
   - [4.2 Execution Engine](#42-execution-engine)
   - [4.3 Node Handlers](#43-node-handlers)
   - [4.4 Human-in-the-Loop](#44-human-in-the-loop)
   - [4.5 State and Context](#45-state-and-context)
   - [4.6 Checkpoint and Resume](#46-checkpoint-and-resume)
   - [4.7 Retry and Failure Recovery](#47-retry-and-failure-recovery)
   - [4.8 LLM Integration](#48-llm-integration)
   - [4.9 Coding Agent Loop](#49-coding-agent-loop)
   - [4.10 Validation and Linting](#410-validation-and-linting)
   - [4.11 Parallel Execution](#411-parallel-execution)
   - [4.12 Edge-Based Routing](#412-edge-based-routing)
   - [4.13 Observability and Events](#413-observability-and-events)
5. [Gap-to-Subsystem Mapping](#5-gap-to-subsystem-mapping)
6. [New Subsystems Required](#6-new-subsystems-required)
7. [Implementation Phasing Recommendations](#7-implementation-phasing-recommendations)
8. [Deep-Dive: Architecture Integration Gaps](#8-deep-dive-architecture-integration-gaps)
   - [8.1 Kernel Bridge Integration with Attractor Checkpoints](#81-kernel-bridge-integration-with-attractor-checkpoints)
   - [8.2 MCP Tool Overlap with Node Handlers](#82-mcp-tool-overlap-with-node-handlers)
   - [8.3 Nexus Console UI as Pipeline Frontend](#83-nexus-console-ui-as-pipeline-frontend)
   - [8.4 Database Schema Impact](#84-database-schema-impact)
   - [8.5 Security and Permissions Model](#85-security-and-permissions-model)

---

## 1. Executive Summary

This document provides an exhaustive delta analysis between the **Attractor specification** (a DOT-based pipeline runner for AI workflows) and **Nexus as it exists today** (a polyglot service mesh with a cron-driven WorkRequest pipeline called Conduit).

### Key Findings

| Category | Count |
|----------|-------|
| Capabilities fully present in both | 5 |
| Capabilities present in Nexus with partial overlap | 8 |
| Capabilities present in Attractor, absent in Nexus | 18 |
| New subsystems required | 4 |

**Headline:** Nexus and Attractor overlap in their core mission — orchestrating AI-powered work — but diverge sharply in architecture. Nexus is a **service mesh with an AI pipeline grafted on**; Attractor is a **pipeline-native system with service orchestration as a node type**. The upgrade path is to evolve Nexus's pipeline layer toward Attractor's declarative graph model while preserving the service mesh infrastructure as the execution substrate.

The single largest gap is the **pipeline definition format**. Nexus has no declarative pipeline language — its execution order is hardcoded in `main.py` as a sequential role loop (`reviewer → planner → builder → critic`). Attractor defines pipelines as DOT graphs that can express branching, parallelism, human gates, and conditional routing.

---

## 2. Methodology

This analysis was conducted by:

1. Reading all four Attractor spec files in full: `attractor-spec.md`, `unified-llm-spec.md`, `coding-agent-loop-spec.md`, `README.md`
2. Exploring the Nexus codebase: `python/conduit/`, `typescript/`, `angular/`, `sql/`, `schemas/`, `bin/`, `.agents/`
3. Reading key Nexus architecture documents: `CLAUDE.md`, `AGENTS.md`, `README.md`, `docs/architect.md`
4. Searching the codebase for specific patterns: circuit breaker, checkpoint, execution authority, budget, retry, tool call
5. Reading the full Conduit implementation: `main.py`, `db_adapter.py`, `executor_registry.py`, `bridge/`, `wrp_kernel/`, `app/`, `schema.sql`

For each Attractor capability, we asked:
- Does Nexus have a parallel implementation? If so, where?
- If not, where would it logically belong?
- Is the gap fundamental (new subsystem) or incremental (extension to existing)?

---

## 3. Capability Matrix

### Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Present in Nexus with comparable capability |
| ⚠️ | Partial overlap — Nexus has something related but not equivalent |
| ❌ | Absent in Nexus — requires new implementation |
| 🔶 | Covered by companion spec (Unified LLM / Coding Agent Loop) |

### Pipeline Definition & Structure

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| DOT DSL pipeline definition | ❌ | Nexus has no declarative pipeline language. Execution order is hardcoded: `["reviewer", "planner", "builder", "critic"]` in `main.py:run_all()`. |
| Graph-level attributes (goal, label, retry_target) | ⚠️ | Nexus has `goal` on plans (via `nebula.plans` table), but no graph-level retry targets or pipeline-scoped defaults. |
| Node attributes (prompt, max_retries, timeout, fidelity) | ⚠️ | Tickets and work_requests have some attributes (token budgets, retry state), but no per-node prompt/fidelity configuration. |
| Edge attributes (condition, weight, label) | ❌ | No edge concept at all — Nexus uses sequential role dispatch, not a graph. |
| Subgraphs for scoping defaults | ❌ | No subgraph or scoping concept. |
| Shape-to-handler-type mapping | ❌ | No shape concept. Handler resolution is role-based, not type/shape-based. |
| Model stylesheet (CSS-like model config) | ⚠️ | Model chain via `tackle-mcp` provides per-role model configuration but no node-level stylesheet. |
| Condition expression language | ❌ | No condition language for routing decisions. |

### Execution Engine

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| PARSE → TRANSFORM → VALIDATE → INITIALIZE → EXECUTE → FINALIZE lifecycle | ⚠️ | Conduit has `_init_db()` → `run_role()` → finalization, but no parse/transform/validate phases. |
| Graph traversal algorithm | ❌ | No graph traversal. Fixed sequential role execution. |
| Edge selection algorithm (5-step priority) | ❌ | No edge concept. |
| Goal gate enforcement | ❌ | No goal gate concept. Pipeline succeeds if all roles complete. |
| Checkpoint after each node | ⚠️ | `bridge/checkpoint.py` has kernel sync checkpoints and `wrp_kernel/snapshot.py` has versioned snapshots. Not used for pipeline crash recovery. |
| Resume from checkpoint | ❌ | No resume capability. Pipeline runs are stateless between cron invocations. |
| Run directory structure (logs, artifacts, status) | ⚠️ | Conduit writes logs to `CONDUIT_LOG_PATH` and plan artifacts to `CONDUIT_DATA_DIR`. No per-run directory structure. |
| Concurrency model (single-threaded traversal) | ✅ | Conduit is single-threaded; parallelism is planned but not implemented. |

### Node Handlers

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| Handler interface (`execute(node, context, graph, logs_root) → Outcome`) | ❌ | No formal handler interface. Each role has custom dispatch logic in `main.py`. |
| Handler registry (type → handler mapping) | ❌ | No registry. Role dispatch is a simple `for role in [...]` loop. |
| Start handler | ❌ | No explicit start node. Cron entry point is `--run <role>` or `--all`. |
| Exit handler | ❌ | No explicit exit. Pipeline ends when all roles complete. |
| Codergen handler (LLM task) | ⚠️ | `_dispatch_one()` in `main.py` calls LLM models via model chain. Prompts are role-specific, not node-specific. No variable expansion. |
| Wait-for-human handler | ❌ | No human-in-the-loop mechanism. Reviewer role is AI-driven. |
| Conditional handler | ❌ | No conditional routing. |
| Parallel handler (fan-out) | ❌ | No parallel execution. |
| Fan-in handler | ❌ | No fan-in. |
| Tool handler (shell command) | ⚠️ | `cli_executor.py` and `ccnf_bridge.py` execute external commands, but not as formal pipeline nodes. |
| Manager loop handler (supervise child pipeline) | ❌ | No supervisor pattern. |
| Custom handler registration | ❌ | No extensibility mechanism. |

### Human-in-the-Loop

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| Interviewer interface | ❌ | No interviewer abstraction. |
| Question model (YES_NO, MULTIPLE_CHOICE, FREEFORM, CONFIRMATION) | ❌ | No question model. |
| Answer model | ❌ | No answer model. |
| AutoApprove interviewer | ❌ | No auto-approve path. |
| Console interviewer | ❌ | No CLI interaction. |
| Callback interviewer | ❌ | No callback. |
| Queue interviewer | ❌ | No queue. |
| Recording interviewer | ❌ | No recording. |
| Timeout handling | ❌ | No timeout for human interaction. |
| Accelerator key parsing | ❌ | Not applicable. |

### State and Context

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| Thread-safe key-value context | ⚠️ | Nexus context flows through PostgreSQL tables: `work_requests`, `sessions`, `receipts`, `tickets`. Not an in-memory KV store. |
| Context clone for parallel branches | ❌ | No parallel branches, so no clone needed. |
| Built-in context keys (`graph.goal`, `current_node`, `last_stage`) | ⚠️ | Some equivalents: `plan.goal` in DB, `pipeline_cursor` tracks position. |
| Outcome model (SUCCESS, FAIL, PARTIAL_SUCCESS, RETRY, SKIPPED) | ⚠️ | Receipt statuses cover some states. Tickets can be `open`, `in_progress`, `completed`, `failed`. |
| Context fidelity modes (full, truncate, compact, summary) | ❌ | No fidelity concept. Each LLM call is independent. |
| Thread resolution for session reuse | ❌ | No session reuse across calls. |
| Artifact store | ❌ | No artifact store. Plan outputs are files in `CONDUIT_DATA_DIR`. |

### Checkpoint and Resume

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| Serializable checkpoint JSON | ⚠️ | `bridge/checkpoint.py` has kernel sync checkpoints. `wrp_kernel/snapshot.py` has versioned snapshots. Different purpose. |
| Checkpoint after each node | ❌ | Not per-node. |
| Resume from checkpoint | ❌ | No resume — pipeline runs are stateless between cron. |
| Retry counter preservation | ❌ | Not in checkpoints. |
| Fidelity degradation on resume (full → summary:high) | ❌ | Not applicable. |

### Retry and Failure Recovery

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| Per-node `max_retries` attribute | ⚠️ | Tickets have retry counts. Not per-"node" (role). |
| Graph `default_max_retries` | ❌ | No graph-level defaults. |
| Retry policy (none, standard, aggressive, linear, patient) | ⚠️ | Circuit breaker trips after exhaustion. No configurable backoff presets. |
| Backoff config (initial delay, factor, max delay, jitter) | ❌ | No configurability. |
| `should_retry` predicate | ⚠️ | Implicit in `_dispatch_one()`: certain errors trip circuit breaker, others skip. Not configurable. |
| Failure routing (fail edge → retry target → fallback → terminate) | ❌ | Circuit breaker trips, retry tickets created. No edge-based failure routing. |
| `retry_target` / `fallback_retry_target` on nodes | ❌ | No node-level retry targets. |
| `allow_partial` flag for partial success on exhaustion | ❌ | No partial success concept. |

### LLM Integration (Unified LLM Spec — Companion)

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| 🔶 Multi-provider unified client | ⚠️ | Nexus has model chain via `tackle-mcp` with primary + fallbacks. Provider-specific logic is in executor modules (`executor_cloud.py`). No unified adapter pattern. |
| 🔶 Provider adapter interface | ❌ | No formal adapter interface. |
| 🔶 Four-layer architecture | ❌ | No layered LLM architecture. |
| 🔶 Streaming support | ❌ | No streaming — all calls are fire-and-forget. |
| 🔶 Tool calling (native per-provider) | ❌ | No tool calling. LLM responses are plain text processed by the pipeline. |
| 🔶 Model catalog | ❌ | Model config in tackle-mcp, but no catalog with capabilities/costs. |
| 🔶 Prompt caching | ❌ | No caching. |
| 🔶 Reasoning token tracking | ❌ | No reasoning token separation. |
| 🔶 Error taxonomy (ProviderError, RateLimitError, etc.) | ⚠️ | Circuit breaker handles some error types but no formal taxonomy. |
| 🔶 Response format (text, json, json_schema) | ❌ | No structured output. |
| 🔶 Usage aggregation across steps | ❌ | No multi-step usage tracking. |

### Coding Agent Loop (Coding Agent Loop Spec — Companion)

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| 🔶 Session management | ⚠️ | `sessions` table in conduit schema. No agentic loop session. |
| 🔶 Agentic loop (LLM → tool → LLM until done) | ❌ | No agentic loop. Each role dispatches one LLM call per work request. |
| 🔶 Provider-aligned toolsets (read_file, write_file, edit_file, shell, grep, glob) | ❌ | No file operation tools. The Builder role generates code via LLM but does not execute file operations. |
| 🔶 apply_patch (OpenAI) / edit_file (Anthropic) | ❌ | No code editing tools. |
| 🔶 ExecutionEnvironment abstraction | ❌ | No abstraction. Shell execution is via `cli_executor.py` but not integrated into pipeline. |
| 🔶 Event system (15+ event types) | ❌ | Conduit uses structured logging, not events. |
| 🔶 Steering (mid-task message injection) | ❌ | No steering. |
| 🔶 Subagents (spawn, send_input, wait, close) | ❌ | No subagent concept. |
| 🔶 Loop detection | ❌ | No loop detection. |
| 🔶 Context window awareness | ❌ | No context window tracking. |
| 🔶 Tool output truncation (head/tail split) | ❌ | No truncation. |

### Validation and Linting

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| Diagnostic model (ERROR, WARNING, INFO) | ❌ | No diagnostic model. |
| 13 built-in lint rules | ❌ | No lint rules. |
| `validate_or_raise()` API | ❌ | No validation API. |
| Custom lint rules | ❌ | No custom rules. |
| `start_node` rule (exactly one start) | ❌ | Not applicable. |
| `reachability` rule (all nodes reachable) | ❌ | Not applicable. |
| `condition_syntax` rule | ❌ | Not applicable. |
| `stylesheet_syntax` rule | ❌ | Not applicable. |

### Service Mesh Integration

| Attractor Capability | Nexus Status | Notes |
|---------------------|-------------|-------|
| Tool handler for external commands | ⚠️ | `cli_executor.py`, `ccnf_bridge.py` — partial overlap. |
| Manager loop for child pipeline supervision | ❌ | No supervisor. |
| Service-aware nodes | ❌ | No service-awareness in pipeline. |

| Nexus Capability (not in Attractor) | Status |
|-------------------------------------|--------|
| Service mesh (registry, gateway, topology) | ✅ Unique to Nexus |
| Polyglot SDKs (Python, Node.js, Go) | ✅ Unique to Nexus |
| Angular console (58 components, 3D graph) | ✅ Unique to Nexus |
| Execution Authority (ADR-006): leases, attempts, execution receipts | ✅ Unique to Nexus |
| Per-role circuit breaker | ✅ Unique to Nexus |
| Agent budget enforcement | ✅ Unique to Nexus |
| PostgreSQL canonical store (multi-schema) | ✅ Unique to Nexus |
| Kernel bridge (wrp_kernel with snapshots, deltas, lineages) | ✅ Unique to Nexus |
| Role memory procedure registry (Redis) | ✅ Unique to Nexus |
| Assembly forum system (cross-role communication) | ✅ Unique to Nexus |
| Agent record system (tag-routed messaging) | ✅ Unique to Nexus |

---

## 4. Detailed Delta Analysis

### 4.1 Pipeline Definition

**Gap:** Attractor defines pipelines as DOT graphs. Nexus has no pipeline definition format — the pipeline is hardcoded.

**Current Nexus State:**
```python
# nexus/python/conduit/main.py — the "pipeline definition"
for role in ["reviewer", "planner", "builder", "critic"]:
    run_role(args.db, role, registry)
```

This is an imperative sequence with no branching, no parallelism, no conditions, and no human gates. Adding a new step requires editing Python source code.

**Where It Belongs:**
A declarative pipeline format belongs as a new input to Conduit. The DOT file would be version-controlled alongside the codebase and loaded at runtime by the execution engine. The existing hardcoded role loop would become a **default pipeline** (the "simple sequential" pipeline) while Attractor DOT files provide custom pipeline definitions.

**Proposed Location:** `nexus/python/conduit/pipeline/` — new module containing:
- `pipeline_loader.py` — parse DOT files into in-memory graph model
- `pipeline_validator.py` — lint rules for graph correctness
- `pipeline_registry.py` — map plan types to pipeline definitions

### 4.2 Execution Engine

**Gap:** Attractor has a six-phase execution lifecycle with graph traversal, edge selection, and goal gate enforcement. Nexus has a simple sequential role loop.

**Current Nexus State:**
- `_init_db()` — connects to PostgreSQL
- `_resolve_model_chain()` — loads model config from tackle-mcp
- `_check_budget()` — validates agent/ticket budgets
- `run_role()` — dispatches one role's work requests
- `_dispatch_one()` — sends one work request to an LLM model

There is no graph concept, no edge selection, and no traversal algorithm.

**Where It Belongs:**
The execution engine would be a new layer in Conduit that sits between `main.py` and the role dispatch. It would:
1. Load the pipeline graph (DOT or default sequential)
2. Traverse nodes, dispatching to handlers
3. Select edges based on outcomes
4. Enforce goal gates and retry targets

**Proposed Location:** `nexus/python/conduit/engine/` — new module:
- `engine.py` — core traversal loop (replaces `run_all()`)
- `edge_selector.py` — 5-step edge selection algorithm
- `goal_gate.py` — goal gate enforcement
- `checkpoint.py` — per-node checkpoint (extends existing `bridge/checkpoint.py`)

### 4.3 Node Handlers

**Gap:** Attractor has a formal handler interface with a registry. Nexus has role-based dispatch with no interface contract.

**Current Nexus State:**
Each role has bespoke logic in `main.py`:
- `_run_planner()` — generates implementation plans from proposals
- `_run_builder()` — implements plans via LLM code generation
- `_run_reviewer()` — reviews completed implementations
- `_run_critic()` — criticizes/analyzes work

These share no common interface. Adding a new role type requires modifying multiple functions in `main.py`.

**Where It Belongs:**
The existing role functions would be refactored into handler classes implementing a common interface. New handler types (wait.human, conditional, parallel, fan-in, tool, manager_loop) would be added as new handler classes.

**Proposed Location:** `nexus/python/conduit/handlers/` — new module:
- `base.py` — `Handler` interface
- `registry.py` — `HandlerRegistry`
- `codergen.py` — LLM task handler (wraps existing role dispatch)
- `wait_human.py` — human-in-the-loop handler
- `conditional.py` — conditional routing handler
- `parallel.py` — parallel fan-out handler
- `fan_in.py` — parallel consolidation handler
- `tool.py` — external tool execution handler
- `manager_loop.py` — supervisor loop handler

### 4.4 Human-in-the-Loop

**Gap:** Attractor has a formal human interaction pattern with an Interviewer interface, question/answer models, and multiple implementations. Nexus has no human gate capability.

**Current Nexus State:**
All pipeline roles are AI-driven. The reviewer role evaluates work automatically. There is no mechanism to pause the pipeline and wait for human input.

**Where It Belongs:**
The human-in-the-loop capability would be a new handler type (`wait.human`) plus an interviewer implementation backed by the existing Assembly forum system or the Nexus Console UI.

**Integration with existing Nexus systems:**
- The `wait.human` handler would post a question to the Assembly forum
- The human response would be submitted via Assembly API or Nexus Console
- The handler would wake up and route based on the human's choice
- The existing `human.gate.*` context keys namespace is reserved for this

### 4.5 State and Context

**Gap:** Attractor has an in-memory thread-safe key-value context. Nexus uses PostgreSQL as its state store.

**Current Nexus State:**
Context flows through database tables:
- `work_requests` — work to be done
- `sessions` — execution sessions
- `receipts` — execution outcomes (in `vision` schema)
- `tickets` — retry/work items (in `vision` schema)
- `pipeline_cursor` — position tracking

This is durable but not designed for the high-frequency read/write pattern of a graph traversal engine.

**Where It Belongs:**
An in-memory context would be added for pipeline execution, backed by PostgreSQL for durability. The context would be serialized into checkpoints after each node completes, providing both speed (in-memory during execution) and durability (PostgreSQL for crash recovery).

### 4.6 Checkpoint and Resume

**Gap:** Attractor saves a checkpoint after every node and can resume from crash. Nexus has kernel snapshots and bridge checkpoints but no pipeline crash recovery.

**Current Nexus State:**
- `bridge/checkpoint.py` — tracks kernel sync position (last synced receipt ID)
- `wrp_kernel/snapshot.py` — versioned kernel state snapshots

Neither is used for pipeline crash recovery. If Conduit crashes mid-execution, the next cron run starts fresh.

**Where It Belongs:**
A new checkpoint layer would wrap the execution engine, saving state after each node completes. On restart, the engine would load the last checkpoint, restore context state, and resume from the next node. This integrates with the existing kernel bridge checkpoints.

### 4.7 Retry and Failure Recovery

**Gap:** Attractor has per-node retry policies with configurable backoff. Nexus has circuit breaker and retry tickets but no per-node retry configuration.

**Current Nexus State:**
- Circuit breaker trips after model exhaustion
- Retry tickets are created when work fails
- `PIPELINE_WATCHDOG_STALE` (1500s) kills stale sessions
- Budget enforcement rejects work before dispatch

Missing: configurable backoff strategies, per-node retry counts, failure routing edges.

**Where It Belongs:**
The existing circuit breaker and retry ticket system would be extended with:
- Per-node `max_retries` attribute
- Configurable backoff presets (standard, aggressive, linear, patient)
- `should_retry` predicate for selective retry
- Failure routing through `retry_target` attributes

### 4.8 LLM Integration

**Gap:** The Attractor companion Unified LLM Client spec defines a multi-provider adapter pattern. Nexus has model chain but no unified adapter layer.

**Current Nexus State:**
- `_resolve_model_chain()` queries tackle-mcp for primary + fallback models
- Executor modules (`executor_cloud.py`) dispatch to LLM providers
- No streaming, no tool calling, no structured output
- No model catalog, no prompt caching, no reasoning token tracking

**Where It Belongs:**
A new `llm/` module in Conduit would implement the Unified LLM Client specification, providing:
- Provider adapters (OpenAI Responses API, Anthropic Messages API, Gemini API)
- Model catalog with capabilities and costs
- Streaming support for real-time response consumption
- Tool calling integration with the handler system
- Prompt caching for reduced costs

This would be a new subsystem, not an extension of existing code.

### 4.9 Coding Agent Loop

**Gap:** The Attractor companion Coding Agent Loop spec defines an autonomous agent with Session management, events, subagents, and provider-aligned toolsets. Nexus has no agent loop — each role makes a single LLM call per work request.

**Current Nexus State:**
- `_dispatch_one()` sends a prompt to an LLM, gets a response, processes it
- No multi-turn conversation
- No tool execution loop
- No subagent spawning
- No event stream

**Where It Belongs:**
The Builder role would be the natural place to integrate the agent loop. Instead of a single LLM call that generates code in one shot, the Builder would:
1. Read files using `read_file` tool
2. Edit files using `edit_file` / `apply_patch` tool
3. Execute commands using `shell` tool
4. Iterate until the implementation is complete

This would be a new subsystem (`nexus/python/conduit/agent/`) that implements the full agent loop specification.

### 4.10 Validation and Linting

**Gap:** Attractor has 13 built-in lint rules for pipeline validation. Nexus has no pipeline validation — incorrect state is caught at runtime via database constraints.

**Where It Belongs:**
A new `pipeline/validator.py` module would implement lint rules for pipeline graphs:
- `start_node` — exactly one start node
- `terminal_node` — exactly one exit node
- `reachability` — all nodes reachable from start
- `edge_target_exists` — all edge targets valid
- `condition_syntax` — valid condition expressions

### 4.11 Parallel Execution

**Gap:** Attractor supports parallel fan-out with join policies. Nexus is strictly sequential.

**Where It Belongs:**
A new `parallel` handler would manage concurrent execution:
- Fan-out: spawn multiple branches from a parallel node
- Context cloning: each branch gets an isolated context
- Join policies: `wait_all`, `first_success`
- Fan-in: consolidate results from all branches

### 4.12 Edge-Based Routing

**Gap:** Attractor uses edge conditions, labels, and weights for routing. Nexus has no routing concept.

**Where It Belongs:**
The edge selection algorithm would be implemented as part of the execution engine, evaluating conditions against the runtime context and selecting the best edge.

### 4.13 Observability and Events

**Gap:** The Attractor companion specs define typed events for every action. Nexus uses structured logging.

**Current Nexus State:**
- Rotating file logs at `CONDUIT_LOG_PATH`
- Structured log format with levels (DEBUG, INFO, WARNING, ERROR)
- No event stream for programmatic consumption
- Agent records provide an audit trail but not real-time events

**Where It Belongs:**
An event emitter would be added to the execution engine, emitting typed events for each node execution, edge selection, checkpoint save, and pipeline state change. The existing structured logging would be extended to emit events.

---

## 5. Gap-to-Subsystem Mapping

For capabilities that are missing in Nexus, this table maps each to the existing subsystem where it logically belongs (or notes that a new subsystem is required).

| Attractor Capability | Target Nexus Subsystem | Type |
|---------------------|----------------------|------|
| DOT DSL pipeline definition | `conduit/pipeline/` | **New module** |
| Graph traversal engine | `conduit/engine/` | **New module** |
| Handler interface + registry | `conduit/handlers/` | **New module** |
| Human-in-the-loop (Interviewer) | `conduit/handlers/wait_human.py` + Assembly integration | **New handler** |
| In-memory context | `conduit/engine/context.py` | **New module** |
| Per-node checkpoint/resume | `conduit/engine/checkpoint.py` (extends `bridge/checkpoint.py`) | **Extension** |
| Configurable retry policies | `conduit/engine/retry.py` | **New module** |
| Failure routing | `conduit/engine/edge_selector.py` | **New module** |
| Unified LLM client (multi-provider) | `conduit/llm/` | **New subsystem** |
| Coding agent loop | `conduit/agent/` | **New subsystem** |
| Provider-aligned toolsets | `conduit/agent/tools/` | **New subsystem** |
| Event system | `conduit/engine/events.py` | **New module** |
| Pipeline validation/linting | `conduit/pipeline/validator.py` | **New module** |
| Model stylesheet | `conduit/pipeline/stylesheet.py` | **New module** |
| Condition expression language | `conduit/engine/conditions.py` | **New module** |
| Parallel execution | `conduit/handlers/parallel.py` | **New handler** |
| Artifact store | `conduit/engine/artifacts.py` | **New module** |
| Context fidelity | `conduit/engine/fidelity.py` | **New module** |
| Subagents | `conduit/agent/subagent.py` | **New module** |
| Loop detection | `conduit/agent/loop_detector.py` | **New module** |

---

## 6. New Subsystems Required

### 6.1 Pipeline Definition Subsystem (`conduit/pipeline/`)

**Purpose:** Load, parse, validate, and transform DOT pipeline definitions.

**Components:**
- DOT parser (Graphviz subset)
- In-memory graph model (nodes, edges, attributes)
- Variable expansion ($goal, context keys)
- Stylesheet application
- Lint rule engine (13 built-in rules)
- Validation API (`validate_or_raise()`)

**Dependencies:** None (greenfield within Conduit)

### 6.2 Execution Engine Subsystem (`conduit/engine/`)

**Purpose:** Traverse pipeline graphs, dispatch to handlers, manage state.

**Components:**
- Core traversal loop (6-phase lifecycle)
- Edge selection algorithm (5-step priority)
- Goal gate enforcement
- Context management (in-memory KV + PostgreSQL backing)
- Per-node checkpoint/resume
- Retry policy engine
- Event emitter

**Dependencies:** Pipeline definition subsystem, handler subsystem

### 6.3 Handler Subsystem (`conduit/handlers/`)

**Purpose:** Execute nodes based on type/shape, with a common interface.

**Components:**
- Handler interface
- Handler registry
- Codergen handler (wraps existing role dispatch)
- Wait-for-human handler (new)
- Conditional handler (new)
- Parallel handler (new)
- Fan-in handler (new)
- Tool handler (wraps `cli_executor.py`)
- Manager loop handler (new)

**Dependencies:** Execution engine, existing role functions in `main.py`

### 6.4 Agent Loop Subsystem (`conduit/agent/`)

**Purpose:** Implement the Coding Agent Loop spec for autonomous multi-turn task execution.

**Components:**
- Session management
- Agentic loop (LLM → tool → LLM)
- Provider-aligned toolsets (OpenAI, Anthropic, Gemini)
- Execution environment abstraction
- Tool output truncation
- Steering and follow-up
- Subagent spawning
- Loop detection
- Context window tracking

**Dependencies:** Unified LLM client subsystem, execution environment

### 6.5 Unified LLM Client Subsystem (`conduit/llm/`)

**Purpose:** Implement the Unified LLM Client spec for multi-provider LLM access.

**Components:**
- Provider adapter interface
- OpenAI adapter (Responses API)
- Anthropic adapter (Messages API)
- Gemini adapter (Gemini API)
- Model catalog
- Prompt caching
- Streaming support
- Tool calling
- Error taxonomy
- Usage tracking

**Dependencies:** tackle-mcp (for model config), existing executor modules

---

## 7. Implementation Phasing Recommendations

### Phase 1: Pipeline Foundation (Weeks 1-4)

**Goal:** Introduce declarative pipeline definitions without disrupting existing Conduit operation.

1. **Pipeline Definition Subsystem** — DOT parser, graph model, validation
2. **Execution Engine Core** — Graph traversal with edge selection
3. **Handler Interface + Registry** — Refactor existing roles into handlers
4. **Default Sequential Pipeline** — Replicate current behavior as DOT graph

**Risk:** Low. The existing cron pipeline continues to work. The new engine runs in parallel behind a feature flag.

### Phase 2: Advanced Execution (Weeks 5-8)

**Goal:** Add graph-native features: branching, retry, human gates.

5. **Retry Policy Engine** — Configurable backoff, failure routing
6. **Conditional Handler** — Edge-based conditional routing
7. **Human-in-the-Loop** — Interviewer interface + Assembly integration
8. **Per-Node Checkpoint/Resume** — Crash recovery

**Risk:** Medium. Human gates introduce latency (waiting for human input) that the cron model doesn't handle well. Requires an event-driven wake mechanism instead of cron polling.

### Phase 3: Agentic Capabilities (Weeks 9-16)

**Goal:** Transform the Builder from single-shot code generation to autonomous multi-turn agent.

9. **Unified LLM Client Subsystem** — Multi-provider adapters
10. **Agent Loop Subsystem** — Session, events, tool execution
11. **Provider-Aligned Toolsets** — read_file, edit_file, shell, grep, glob
12. **Subagents** — Task decomposition and parallel work

**Risk:** High. The agent loop is the most complex subsystem and represents a fundamental shift from "LLM generates code, human applies it" to "agent autonomously reads, edits, and tests."

### Phase 4: Advanced Orchestration (Weeks 17-24)

**Goal:** Parallel execution, supervisor loops, full pipeline expressiveness.

13. **Parallel Handler** — Fan-out/fan-in with join policies
14. **Manager Loop Handler** — Supervisor pattern for child pipelines
15. **Context Fidelity** — Context window management
16. **Artifact Store** — Large output management
17. **Model Stylesheet** — Per-node model configuration

**Risk:** Medium. These are extensions to a working system rather than foundational changes.

### Phase 5: Service Mesh Integration (Ongoing)

**Goal:** Bridge the service mesh and pipeline worlds.

18. **Service-Aware Nodes** — Nodes that query/update the service registry
19. **Pipeline-Triggered Deployments** — Work requests that deploy services
20. **Observability Loop** — Service health → pipeline tickets → remediation

**Risk:** High (organizational). This requires schema alignment between the service mesh (H2/MySQL) and pipeline (PostgreSQL) databases.

---

## 8. Deep-Dive: Architecture Integration Gaps

*This section addresses five completeness gaps identified in the code review of the initial delta analysis. Each subsection examines how an existing Nexus subsystem interacts with (or constrains) the Attractor upgrade path.*

### 8.1 Kernel Bridge Integration with Attractor Checkpoints

#### Current Kernel Architecture

Nexus already has a sophisticated kernel bridge system with three layers:

| Layer | File | Purpose |
|-------|------|---------|
| Bridge checkpoint | `bridge/checkpoint.py` | Singleton row (id=1) in `conduit.bridge_checkpoint` tracking the last synced receipt (`last_id`, `last_recorded_on_dt`). Survives process restarts. |
| Bridge sync | `bridge/sync.py` | Polls `vision.receipts`, enriches with `nebula.plans`, maps to `KernelDelta`, reduces through `KernelEngine` in-process. Cursor-based batching (max 500 receipts per poll cycle) with composite cursor ordering. |
| WRP kernel engine | `wrp_kernel/engine.py` | 5-step deterministic reduce pipeline: Materialization → Identity Resolution → Graph Update → Lineage Recording → Commit. All-or-nothing semantics with version increment. |

Supporting layers:
- `wrp_kernel/snapshot.py` — `KernelSnapshot` at version K + `SnapshotStore` with nearest-ancestor lookup (KSRA: `KernelState(N) = Snapshot(K) + Replay(deltas K+1→N)`)
- `wrp_kernel/delta.py` — `KernelDelta` and `KernelDeltaBatch` (re-exports from `nexus_core`)
- `wrp_kernel/lineage.py` — Append-only causal event recorder for the reduce pipeline

The kernel bridge is primarily a **receipt projection consumer** — its checkpoint model tracks "which receipts have been synced to the kernel," not "where are we in a pipeline traversal."

#### Attractor Checkpoint Model

Attractor checkpoints are **pipeline execution checkpoints** saved after each node:

```
Checkpoint:
    timestamp       : Timestamp
    current_node    : String           -- last completed node ID
    completed_nodes : List<String>     -- ordered list of completed node IDs
    node_retries    : Map<String, Integer>  -- per-node retry counters
    context_values  : Map<String, Any> -- serialized context snapshot
```

These serve a fundamentally different purpose from kernel bridge checkpoints — they enable **crash recovery of an in-progress pipeline run**, not tracking which domain events have been projected.

#### Integration Strategy: Two-Layer Checkpoint Architecture

Attractor pipeline checkpoints should be a **separate checkpoint layer** that coexists with the kernel bridge:

```
┌─────────────────────────────────────────────────────────────────┐
│  Pipeline Execution Layer                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Attractor Checkpoint (per-run, per-node)                 │  │
│  │  Table: conduit.pipeline_checkpoint                       │  │
│  │  PK: (run_id, version)                                    │  │
│  │  Fields: run_id, version, current_node, completed_nodes,  │  │
│  │          node_retries, context_snapshot, created_at       │  │
│  │  Purpose: Crash recovery for pipeline execution           │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ node completion events            │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Kernel Bridge Checkpoint (existing)                      │  │
│  │  Table: conduit.bridge_checkpoint                         │  │
│  │  PK: id=1 (singleton)                                     │  │
│  │  Fields: id, last_id, last_recorded_on_dt                 │  │
│  │  Purpose: Receipt projection cursor for kernel sync       │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ map receipts → KernelDeltas       │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Kernel Snapshot (existing)                               │  │
│  │  Table: conduit.kernel_snapshot                           │  │
│  │  PK: version                                              │  │
│  │  Fields: version, state (JSONB), identity_hash,          │  │
│  │          graph_hash, lineage_cursor                       │  │
│  │  Purpose: Acceleration layer for KSRA reconstruction      │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Key design decisions:**

1. **Pipeline checkpoints are scoped to a run** (`run_id`). Each cron invocation or pipeline trigger creates a new run. The kernel bridge checkpoint is global (singleton).

2. **Pipeline checkpoints feed into the kernel bridge.** When a pipeline node completes, it writes both a receipt (via `db_adapter.insert_receipt()`) and a pipeline checkpoint. The kernel bridge picks up the receipt and maps it to a `KernelDelta`. This preserves the existing projection pipeline.

3. **KSRA (Kernel Snapshot Reconstruction Algorithm) extends naturally to pipeline state.** The kernel already supports `reconstruct_kernel_state(snapshot, deltas)`. Pipeline run state could be reconstructed similarly: `PipelineState(N) = PipelineCheckpoint(K) + Replay(receipts K+1→N)`.

4. **New tables should use PostgreSQL-native defaults.** The existing `kernel_delta_log` table in `schema.sql` uses `DEFAULT (datetime('now'))` — SQLite syntax. This needs a migration to `DEFAULT NOW()` for PostgreSQL compatibility. All new tables proposed here use PostgreSQL-compatible syntax exclusively.

5. **Fidelity degradation on resume.** Attractor specifies that when resuming after crash, the first node's fidelity degrades from `full` to `summary:high` because in-memory LLM sessions cannot be serialized. This maps naturally: the pipeline checkpoint stores `context_snapshot` (serialized context values) but not the LLM session state. On resume, the engine sets `fidelity_override = "summary:high"` for the first node.

6. **Lineage integration.** The kernel's `LineageEngine` already records every reduce step. Pipeline checkpoint events (save, load, resume) should be recorded as lineage events with step=`"pipeline"` and event_type=`"checkpoint"`.

#### New Tables Required

```sql
-- Pipeline execution checkpoints (per-run, per-node)
CREATE TABLE conduit.pipeline_checkpoint (
    run_id          TEXT NOT NULL,
    version         INTEGER NOT NULL,
    current_node    TEXT NOT NULL,
    completed_nodes TEXT NOT NULL DEFAULT '[]',  -- JSON array
    node_retries    TEXT NOT NULL DEFAULT '{}',   -- JSON object
    context_snapshot TEXT NOT NULL DEFAULT '{}',  -- JSON object
    created_at      TEXT NOT NULL,
    PRIMARY KEY (run_id, version),
    CHECK(version >= 0)
);
```

#### Migration Path

1. Create `conduit.pipeline_checkpoint` table (new DDL, no migration of existing data)
2. Add `save_pipeline_checkpoint()` to `db_adapter.py`
3. Add `load_pipeline_checkpoint()` to `db_adapter.py`
4. Wire into execution engine's traversal loop
5. Add `run_id` to the kernel bridge's receipt enrichment for lineage tracing

---

### 8.2 MCP Tool Overlap with Node Handlers

#### Current MCP Tool Infrastructure

Nexus has four active MCP servers, each exposing tools via JSON-RPC:

| Server | Port | Tools | Canonical Responsibility |
|--------|------|-------|--------------------------|
| **conduit-mcp** | 3100 | `create_plan`, `create_receipt`, `list_plans`, `get_plan_status`, `create_proposed_plan`, `promote_plan`, etc. | Plan lifecycle state management |
| **nebula-mcp** | 3101 | `nebula_create_agent_record`, `nebula_list_agent_records`, `nebula_create_harvest`, `nebula_list_requirements`, etc. | Agent artifacts and knowledge graph |
| **tackle-mcp** | 3400 | `memory_get_procedures`, `memory_get_procedure`, `memory_refresh`, model config tools | Role memory and AI configuration |
| **assembly-mcp** | port 3107 (REST API at `/api/forums`, `/api/users`; JSON-RPC tools at `/tools/call`) | Forum/thread/comment CRUD, user management | Cross-role communication |

Each MCP server implements the JSON-RPC `tools/list` and `tools/call` methods. Tools are registered via server-specific registry patterns (e.g., `tackle-mcp/src/tools/registry.ts`, `conduit-mcp/src/tools/register.ts`).

#### The Overlap Question

Attractor node handlers and MCP tools are **conceptually similar but architecturally distinct**:

| Dimension | MCP Tools | Attractor Node Handlers |
|-----------|-----------|------------------------|
| **Trigger** | External JSON-RPC call | Pipeline engine traversal |
| **State** | Stateless per invocation | May carry pipeline context |
| **Composition** | Independent calls | Composed into graph traversal |
| **Error model** | JSON-RPC error response | Outcome (SUCCESS/FAIL/RETRY) |
| **Routing** | None (caller decides order) | Edge-based routing with conditions |
| **Persistence** | Via database (tool-specific) | Via checkpoint and context |

**There is no need for handlers to be MCP tools, or vice versa.** They serve different architectural roles. However, there are integration points:

#### Integration Points

1. **Handlers call MCP tools as implementation.** A `codergen` handler might call `tackle-mcp` tools to resolve model config. A `tool` handler might call `conduit-mcp` to create receipts. This is a **composition pattern**: handlers are the orchestrators, MCP tools are the primitives.

2. **MCP tools could represent pipeline state.** The `conduit-mcp` server already exposes plan lifecycle tools. Adding pipeline-graph-specific tools (`list_pipelines`, `get_pipeline_status`, `get_pipeline_node`) would give the UI visibility into pipeline execution without coupling it to the engine.

3. **Handler registry vs MCP tool registry.** These should remain separate. The handler registry maps `type` strings to `Handler` instances for pipeline execution. The MCP tool registries map `tool_name` to tool implementations for external API access. A handler *may* call MCP tools, but handlers are not exposed as MCP tools directly.

#### Recommended Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Attractor Execution Engine                             │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Handler Registry (type → Handler)                │  │
│  │  ├── codergen  ─── calls LLM via model chain      │  │
│  │  ├── wait.human ─── posts to Assembly forum       │  │
│  │  ├── tool      ─── calls conduit-mcp / shell      │  │
│  │  └── parallel  ─── spawns concurrent branches     │  │
│  └───────────────────────────────────────────────────┘  │
│                         │                                │
│                         │ composition (handlers call)     │
│                         ▼                                │
│  ┌───────────────────────────────────────────────────┐  │
│  │  MCP Tool Layer (existing, unchanged)             │  │
│  │  ├── conduit-mcp  (plan lifecycle)                │  │
│  │  ├── nebula-mcp   (agent records)                 │  │
│  │  ├── tackle-mcp   (model config)                  │  │
│  │  └── assembly-mcp (forum/threads)                 │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Key principle:** Handlers compose MCP tools; they do not replace them. The MCP layer remains the stable API for external access to pipeline state. Handlers add graph-aware orchestration on top.

**Migration path:** No MCP tools need to be removed or changed. New pipeline-specific MCP tools may be added to `conduit-mcp` for pipeline graph management (`register_pipeline`, `get_pipeline_graph`, `validate_pipeline`).

---

### 8.3 Nexus Console UI as Pipeline Frontend

#### Current UI Assets

Nexus has two Angular applications relevant to pipeline visualization:

| Application | Path | Components | Role |
|-------------|------|------------|------|
| **Nexus Console** | `angular/nexus-console/` | 58 components, 48 services | Service mesh management, 3D graph visualization |
| **Conduit UI** | `angular/conduit-ui/` | Planner, plan-detail, dashboard components | Plan lifecycle management |

Key reusable infrastructure identified in the codebase:
- **`viz/graph-renderer.service.ts`** — D3-based graph renderer supporting node/edge rendering, zoom, pan, layout (present in the Angular source tree)
- **`viz/d3-helpers.ts`** — D3 utility functions for force-directed layouts
- **`services/pipeline-topology.service.ts`** — Service for pipeline topology data (found in the codebase)
- **`components/pipeline-node/pipeline-node.component.ts`** — Per-node visualization component (found in the codebase; may be a stub)
- **`components/service-graph/service-graph.component.ts`** — 3D service graph with Three.js (confirmed working)
- **`components/topology-view/topology-view.component.ts`** — General topology visualization
- **`conduit-ui` dashboard** — Already shows plan status, receipts, and pipeline progress

#### Pipeline Visualization Opportunity

Attractor's DOT graph format is **inherently visualizable** — this is the entire rationale for choosing DOT. The Nexus Console already has graph rendering infrastructure. Connecting them is a natural integration:

```
DOT Pipeline File (.dot)
        │
        ▼
  DOT Parser (conduit/pipeline/)
        │
        ├── In-memory graph model ──► Execution Engine
        │
        └── Graph JSON ──► conduit-mcp API
                                │
                                ▼
                     Conduit UI / Nexus Console
                     ┌──────────────────────────┐
                     │  Pipeline Graph View     │
                     │  - Node status colors    │
                     │  - Edge animation        │
                     │  - Real-time progress    │
                     │  - Click to inspect node │
                     └──────────────────────────┘
```

#### Integration Strategy

1. **Add `GET /api/pipeline-graph/{run_id}` to `conduit-mcp`** — Returns the graph structure (nodes, edges, attributes) plus current execution state (which nodes are completed, active, pending, failed). This is a read-only projection of pipeline state.

2. **Reuse the D3 graph renderer** — The existing `graph-renderer.service.ts` and `d3-helpers.ts` already support node/edge rendering. Extend them with pipeline-specific node shapes (Mdiamond for start, Msquare for exit, hexagon for human gate, etc.) and status-based coloring (green=completed, blue=active, gray=pending, red=failed).

3. **Add real-time pipeline status** — The `conduit-ui` dashboard already polls for plan status. Extend the polling to include pipeline run status. When the execution engine emits events, the API serves them as a status endpoint.

4. **Human-in-the-loop via the UI** — When a `wait.human` node pauses the pipeline, the question is displayed in the Conduit UI (or Nexus Console). The human selects an option, which is submitted via `POST /api/pipeline/{run_id}/answer`. This is a natural extension of the existing Angular form patterns.

5. **DOT file editing in the UI** — The Nexus Console's existing code editor components could provide DOT syntax highlighting and live preview (render to SVG via Graphviz WASM or server-side rendering).

#### New UI Components Required

| Component | Purpose | Reuses |
|-----------|---------|--------|
| `pipeline-graph-view` | Visualize pipeline DOT graph with node status | `graph-renderer.service.ts`, `d3-helpers.ts` |
| `pipeline-node-detail` | Inspect a node's prompt, outcome, retries, artifacts | `plan-detail` patterns |
| `pipeline-run-list` | List active/completed pipeline runs | `dashboard` patterns |
| `human-gate-dialog` | Display questions and capture answers for `wait.human` nodes | Angular Material Dialog |
| `pipeline-editor` | DOT file editor with live SVG preview | Existing code editor components |

**Migration path:** Build the API endpoints first (conduit-mcp), then the Angular components. The existing `pipeline-topology.service.ts` and `pipeline-node` component suggest this integration was already anticipated.

---

### 8.4 Database Schema Impact

#### Current Schema Landscape

Nexus uses PostgreSQL with multiple schemas:

| Schema | Tables | Role in Pipeline |
|--------|--------|-----------------|
| `conduit` | `plans`, `tickets`, `receipts`, `sessions`, `circuit_breaker`, `work_requests`, `pipeline_cursor`, `bridge_checkpoint`, `kernel_delta_log`, `kernel_snapshot`, `lineage_log`, `model_pricing`, `agent_budgets`, `cost_logs` | Core pipeline state |
| `vision` | `receipts` (canonical source) | Receipt events (source of truth for bridge) |
| `nebula` | `plans` (with dependencies, files_affected), `plan_status` view | Plan metadata enrichment |
| `vector` | `providers`, `harnesses`, `models`, `role_config`, `role_models` | AI model configuration |
| `execution` | `requests`, `leases`, `attempts`, `receipts` | Execution Authority (ADR-006) |
| `tackle` | `agent_scheduler`, `agent_budget_usage` | Agent scheduling and budget tracking |

#### New Tables for Attractor Integration

##### Pipeline Graph Store (new: `conduit` schema)

```sql
-- Pipeline definitions (one row per pipeline graph)
CREATE TABLE conduit.pipeline_graphs (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    dot_source      TEXT NOT NULL,              -- original DOT source
    graph_json      JSONB NOT NULL,             -- parsed graph (nodes, edges, attrs)
    version         INTEGER NOT NULL DEFAULT 1,
    plan_id         TEXT,                       -- optional: bind to a specific plan
    is_default      BOOLEAN NOT NULL DEFAULT false,  -- default pipeline for unmatched plans
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- Pipeline runs (one row per execution)
CREATE TABLE conduit.pipeline_runs (
    run_id          TEXT PRIMARY KEY,
    graph_id        TEXT NOT NULL REFERENCES conduit.pipeline_graphs(id),
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK(status IN ('pending','running','completed','failed','cancelled')),
    trigger         TEXT NOT NULL DEFAULT 'cron'
                    CHECK(trigger IN ('cron','manual','webhook','api')),
    start_node      TEXT NOT NULL,
    current_node    TEXT,
    started_at      TEXT,
    completed_at    TEXT,
    created_at      TEXT NOT NULL
);

-- Pipeline checkpoints (already designed in §8.1)
CREATE TABLE conduit.pipeline_checkpoint (
    run_id          TEXT NOT NULL REFERENCES conduit.pipeline_runs(run_id),
    version         INTEGER NOT NULL,
    current_node    TEXT NOT NULL,
    completed_nodes TEXT NOT NULL DEFAULT '[]',
    node_retries    TEXT NOT NULL DEFAULT '{}',
    context_snapshot TEXT NOT NULL DEFAULT '{}',
    created_at      TEXT NOT NULL,
    PRIMARY KEY (run_id, version)
);
```

##### Enrichment of Existing Tables

Minimal changes to existing tables — the Attractor integration adds new tables rather than modifying existing ones:

| Table | Change | Rationale |
|-------|--------|-----------|
| `conduit.tickets` | Add `node_id TEXT` column | Link tickets to pipeline nodes for per-node retry tracking |
| `conduit.sessions` | Add `run_id TEXT` column | Link sessions to pipeline runs for audit trail |
| `conduit.receipts` | Add `node_id TEXT` column | Track which pipeline node produced each receipt |
| `vision.receipts` | Add `node_id TEXT` column | Mirror for kernel bridge enrichment |

##### Migration Impact Assessment

| Concern | Assessment |
|---------|------------|
| **Breaking changes** | None. All additions are additive (new tables, optional new columns). |
| **Data migration** | None required. Existing plans/tickets/receipts remain valid with NULL `node_id`. |
| **Performance** | New tables are write-heavy (pipeline_checkpoint inserts per node). Index on `(run_id, version)` handles reads. Expected volume: ~10-100 rows per pipeline run. |
| **Schema authority** | New tables follow the existing convention: `conduit-mcp` manages DDL via `createSchema()`. |
| **Cross-schema queries** | Pipeline graph queries join `conduit.pipeline_runs` with `vision.receipts` and `nebula.plans` — same pattern as the existing kernel bridge. |

#### Total New Surface Area

| Artifact | Count |
|----------|-------|
| New tables | 3 (`pipeline_graphs`, `pipeline_runs`, `pipeline_checkpoint`) |
| New columns on existing tables | 3 (`tickets.node_id`, `sessions.run_id`, `receipts.node_id`) |
| New indexes | 3 (PK indexes included) |
| New views | 1 (`pipeline_run_status` — joins runs + checkpoints + receipts) |

---

### 8.5 Security and Permissions Model

#### Current Security Posture

Nexus has several authentication/authorization mechanisms:

| Layer | Mechanism | Scope |
|-------|-----------|-------|
| **Kernel Runtime API** | API key via `X-API-Key` header (`KERNEL_API_KEYS` env var) | Opt-in, per-request auth on the FastAPI server (port 3103) |
| **Assembly** | User system with role-based UUIDs (architect, engineer, planner, reviewer, analyst, inspector, critic) | Thread/comment ownership, role-scoped visibility |
| **Service Mesh** | Token-based auth via login-service, broker-gateway routing | Inter-service communication |
| **MCP Servers** | No authentication (localhost-only by convention) | Internal tool access |

Notably absent: per-pipeline-node permissions, human-in-the-loop authorization, subagent isolation, and execution environment sandboxing.

#### Attractor Security Requirements

Attractor itself has no security model — it's a specification, not an implementation. However, integrating it into Nexus requires addressing:

1. **Pipeline definition authorization** — Who can create/modify pipeline graphs?
2. **Pipeline execution authorization** — Who can trigger pipeline runs?
3. **Human-in-the-loop authorization** — Who can answer `wait.human` questions?
4. **Node-level permissions** — Should certain nodes (e.g., shell execution) require elevated privileges?
5. **Subagent isolation** — Should subagents have restricted filesystem access?
6. **Artifact access control** — Who can read pipeline artifacts (prompts, responses, status files)?

#### Proposed Security Model

##### Layer 1: Pipeline Definition Authorization

Pipeline graphs are stored in `conduit.pipeline_graphs` and managed through `conduit-mcp` tools. Access control follows the existing Assembly role model:

| Role | Pipeline Graph Permissions |
|------|---------------------------|
| **Architect** | Create, read, update, delete any pipeline graph |
| **Planner** | Create, read, update pipeline graphs; cannot delete |
| **Engineer** | Read pipeline graphs; cannot modify |
| **Reviewer** | Read pipeline graphs; cannot modify |

This maps naturally to existing Assembly user UUIDs. The `conduit-mcp` tool handler checks the caller's role before allowing mutations.

##### Layer 2: Pipeline Execution Authorization

Pipeline runs are triggered via:
- **Cron** — system-level, no user auth needed (existing pattern)
- **Manual** — via `POST /api/pipeline/{graph_id}/run`, requires Architect or Planner role
- **API** — via `conduit-mcp` tool, requires API key (extends existing `KERNEL_API_KEYS` pattern)

##### Layer 3: Human-in-the-Loop Authorization

When a `wait.human` node pauses the pipeline:

1. The handler posts a question to the Assembly `intent-records` ("Plans") forum
2. The question is tagged with the required role: `["to:architect"]`, `["to:engineer"]`, etc.
3. Only users with the matching Assembly role can answer
4. The answer is submitted via `POST /api/forums/threads/{id}/comments` (existing Assembly API)
5. The handler polls for answers or waits on a PG NOTIFY event

This reuses the existing Assembly authorization model (role-scoped forums, user UUIDs) without introducing a new permission system.

##### Layer 4: Node-Level Permissions

Certain handler types carry inherent risk and should require explicit opt-in:

| Handler Type | Risk Level | Permission Required |
|-------------|------------|---------------------|
| `codergen` | Low | Default (all pipelines) |
| `wait.human` | Low | Default (all pipelines) |
| `conditional` | Low | Default (all pipelines) |
| `tool` (shell command) | **High** | Explicit `allow_shell: true` on node attribute |
| `tool` (API call) | Medium | Explicit `allow_api: true` on node attribute |
| `parallel` | Low | Default (all pipelines) |
| `manager_loop` | Medium | Explicit `allow_supervisor: true` on node attribute |

These permission flags are stored as node attributes in the DOT file and validated during pipeline validation (lint rule: `shell_without_permission` → ERROR).

##### Layer 5: Subagent Isolation

The Coding Agent Loop spec defines subagents that share the parent's execution environment. For security:

1. **Filesystem scoping** — Subagents can be constrained to a `working_dir` subdirectory (already in the `spawn_agent` tool spec)
2. **Depth limiting** — `max_subagent_depth` config (default: 1) prevents recursive spawning
3. **Turn limits** — `max_turns` per subagent prevents runaway loops
4. **Budget isolation** — Subagent costs are tracked against the parent's budget, not a separate ceiling

These are configuration constraints, not a new permission system. They map to existing `SessionConfig` fields.

##### Layer 6: Artifact Access Control

Pipeline artifacts (prompts, responses, status files) are stored in `CONDUIT_DATA_DIR` and accessible via:
- Filesystem path (for internal access)
- `conduit-mcp` tools (for API access)
- Conduit UI (for human access)

Access control follows the existing pattern: the Assembly user's role determines visibility. Agent records (`nebula_create_agent_record`) already implement role-scoped visibility via the two-axis stratification system — `visibilityScope` (builder, architect, planner, all) and `level` (L1–L4 for abstraction depth). Pipeline artifacts would extend this same two-axis model: `visibilityScope` controls who can see the artifact, and `level` controls the abstraction tier (e.g., L1 for raw prompts/responses, L2 for structured outcomes, L3 for pipeline-level summaries).

#### Integration with Existing Auth Infrastructure

```
┌─────────────────────────────────────────────────────────────────┐
│  Auth Layer                                                     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Assembly User System (existing)                          │  │
│  │  - Role-based UUIDs (architect, engineer, planner, ...)   │  │
│  │  - Forum-scoped permissions                               │  │
│  │  - Used for: human gate answers, pipeline permissions     │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Kernel API Key (existing)                                │  │
│  │  - X-API-Key header                                       │  │
│  │  - Used for: programmatic pipeline triggers, status queries│  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Node Permission Flags (new)                              │  │
│  │  - allow_shell, allow_api, allow_supervisor               │  │
│  │  - Stored as DOT node attributes                          │  │
│  │  - Validated at pipeline parse time (lint rules)          │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Migration path:** No changes to existing auth infrastructure. The Assembly user system and Kernel API key system remain unchanged. Node permission flags are new and validated at pipeline parse time.

---

## Appendix A: Files Referenced

### Attractor Spec Files
- `nexus/docs/attractor/attractor-spec.md` — Pipeline definition, execution engine, handlers, state, human-in-the-loop, validation, stylesheet
- `nexus/docs/attractor/unified-llm-spec.md` — Multi-provider LLM client architecture, types, generation, tool calling, error handling
- `nexus/docs/attractor/coding-agent-loop-spec.md` — Agentic loop, provider profiles, tool execution, subagents, events
- `nexus/docs/attractor/README.md` — Overview and NLSpec reference

### Nexus Implementation Files
- `nexus/python/conduit/main.py` — Cron orchestrator, role dispatch, model chain
- `nexus/python/conduit/db_adapter.py` — PostgreSQL adapter, circuit breaker, budgets, leases, attempts
- `nexus/python/conduit/executor_registry.py` — Executor registration
- `nexus/python/conduit/bridge/checkpoint.py` — Kernel sync checkpoints
- `nexus/python/conduit/bridge/sync.py` — Kernel bridge sync
- `nexus/python/conduit/bridge/daemon.py` — Kernel sync daemon
- `nexus/python/conduit/wrp_kernel/snapshot.py` — Versioned kernel state snapshots
- `nexus/python/conduit/wrp_kernel/engine.py` — Kernel WRP engine
- `nexus/python/conduit/app/main.py` — Kernel Runtime API (FastAPI, port 3103)
- `nexus/python/conduit/schema.sql` — Conduit DDL
- `nexus/python/conduit/cli_executor.py` — CLI command executor
- `nexus/python/conduit/ccnf_bridge.py` — CCNF adapter
- `nexus/python/conduit/agent_scheduler_runner.py` — Agent schedule runner
- `nexus/python/conduit/token_estimator.py` — Token estimation

### Nexus Architecture Files
- `nexus/CLAUDE.md` — Agent identity and database-first architecture
- `nexus/AGENTS.md` — Full routing specification (at `/home/codex/dev/AGENTS.md`)
- `nexus/README.md` — Service mesh architecture and ports
- `nexus/.agents/OPERATING_MODEL.md` — WorkRequest pipeline operating model
- `nexus/docs/architect.md` — Architect status briefing
