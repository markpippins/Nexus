>**Nexus WRP aspirational architecture (inactive).** This document describes
> the intended design of the Nexus Work Request Pipeline, which is under
> construction and not yet operational. The active system is **Conduit**
> (see `nexus/python/conduit/` and `nexus/typescript/conduit-mcp/`). The
> only shared concept between Nexus and Conduit is the `WorkRequest` type.
> 
# WorkRequest Compiler — README

## Overview

The **WorkRequest Compiler** is the execution engine that converts structured *Work Requests* into reproducible AI-assisted development actions.

It exists to solve a specific problem:

> **How do we turn conversational design decisions into deterministic, auditable implementation work?**

Instead of treating LLM interaction as chat, this system treats it as a **compile pipeline**:

```
Intent → WorkRequest → Prompt → Model Execution → Implementation → Record
```

The compiler ensures that work is:

* reproducible
* logged
* project-scoped
* model-agnostic
* resumable

---

## Core Concepts

### WorkRequest

A **WorkRequest** represents a single unit of intentional work.

Examples:

* implement a feature
* refactor a subsystem
* synchronize implementation with plans
* generate architecture artifacts

A WorkRequest is **not** a prompt.

It is closer to:

* a build target
* a task specification
* a compilation unit

---

### Compiler Philosophy

The system follows a *compiler mental model*:

| Compiler Concept | WorkRequest Equivalent               |
| ---------------- | ------------------------------------ |
| Source code      | Design intent / conversation outcome |
| AST              | WorkRequest folder                   |
| Code generation  | Prompt construction                  |
| Backend          | Selected LLM                         |
| Object file      | Implementation changes               |
| Build artifacts  | Records + logs                       |

The goal is **deterministic AI usage**, not ad-hoc prompting.

---

## Directory Structure

Each project contains a project-local pipeline workspace.

```
<Project Root>
│
├── .agent/
│   └── scripts/
│       ├── process.sh
│       └── executor.py
│
└── .pipeline/
    ├── IMPLEMENTATION_PLAN_RECORD/
    ├── PROMPT_RECORDS/
    └── WORK_REQUESTS/
        ├── active/
        ├── artifacts/
        ├── complete/
        ├── failed/
        ├── log/
        └── queued/
```

> **Note:** The `.pipeline/` workspace shown above is the **aspirational Nexus
> WRP** directory structure. The active **Conduit** system stores its data in
> `nexus/.conduit-data/` instead. These are separate — Conduit is temporary
> scaffolding, and the eventual Nexus WRP may use a different layout.

### Important Rules

* `process.sh` and `executor.py` exist **once only**.
* WorkRequests are **replicated per project**, not globally.
* Logs live *with the work*, not with the tooling.

---

## Components

### `executor.py`

The compiler front-end.

Responsibilities:

* Locate project root
* Detect or create pipeline folders
* Normalize relative paths
* Load WorkRequest metadata
* Select model
* Invoke execution pipeline
* Update records

Think of this as the **compiler driver**.

---

### `process.sh`

Execution wrapper.

Responsibilities:

* environment setup
* model invocation
* skill orchestration
* consistent execution entrypoint

This is analogous to a build system launcher (`make`, `gradle`, etc.).

---

### Skills

Skills extend the compiler.

Typical skills include:

* `initialize_workrequest`
* `generate_prompt`
* `execute_model`
* `sync_implementation`
* `update_records`

Skills must be **idempotent** whenever possible.

---

## Records System

The compiler maintains two mandatory logs.

### PROMPT_RECORDS

Tracks:

* prompts sent to models
* system instructions
* context construction
* model selection

Purpose:

* auditability
* reproducibility
* debugging model behavior

---

### IMPLEMENTATION_PLAN_RECORD

Tracks:

* files changed
* decisions taken
* synchronization actions
* retroactive refactors

Purpose:

* implementation lineage
* architectural memory
* software archaeology

---

## Current Known Issues (Design Phase)

The following behaviors are intentional focus areas:

1. Output location inconsistencies
2. Project root detection from subprojects
3. Pipeline folder auto-creation
4. Relative path normalization
5. Single shared executor/process scripts
6. PROMPT_RECORDS + IMPLEMENTATION_PLAN_RECORD not updating after WorkRequest emission

**Priority:**
Stabilize execution before refactoring into multiple modules.

---

## Execution Flow

```
1. Create WorkRequest
2. Compiler initializes workspace
3. Prompt generated
4. Model executes work
5. Changes applied
6. Records updated
7. WorkRequest continues or completes
```

The compiler must support **continuation**.

A WorkRequest is allowed to evolve across multiple executions.

---

## Model Selection

Future behavior:

* WorkRequest declares preferred model
* Compiler routes execution automatically
* Different models may handle:

  * planning
  * implementation
  * review
  * synchronization

Example:

```
planning → ChatGPT
implementation → Gemini
review → ChatGPT
```

The compiler is intentionally **model-neutral**.

---

## Design Principles

### 1. Conversation is Specification

Discussion produces intent.
Intent becomes structured work.

---

### 2. Logs Are First-Class Artifacts

If it isn’t recorded, it didn’t happen.

---

### 3. One Toolchain, Many Projects

Execution logic is centralized.
Work context is project-local.

---

### 4. Deterministic AI Usage

The system avoids:

* random prompting
* context loss
* undocumented changes

---

### 5. Refactor After Stability

Multi-file architecture comes **after**:

* reliable execution
* correct logging
* stable folder behavior

---

## Future Roadmap

Planned evolution:

* multi-module compiler structure
* explicit WorkRequest schema
* incremental compilation
* dependency graph between WorkRequests
* automated synchronization passes
* CI/CD integration
* model capability routing

Long-term goal:

> Treat AI development workflows like a real compiler toolchain.

---

## Quick Start (Conceptual)

```
1. Create WorkRequest
2. Run compiler skill
3. Review PROMPT_RECORDS
4. Review IMPLEMENTATION_PLAN_RECORD
5. Continue or finalize
```

---

## Status

**Phase:** Pipeline Stabilization
**Focus:** Correctness over abstraction

The system is intentionally conservative right now.
Architecture refinement will follow once execution behavior is reliable.

---

## Guiding Idea

The WorkRequest Compiler is not an AI assistant.

It is:

> **a build system for thinking, planning, and implementing with AI.**
