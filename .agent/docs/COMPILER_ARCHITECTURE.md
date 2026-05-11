# WorkRequest Compiler — Architecture

## Purpose

This document describes the internal architecture of the **WorkRequest Compiler**, the system responsible for transforming structured development intent into deterministic AI-driven implementation.

Where `README.md` explains *what* the compiler is, this document explains *how it works*.

---

# 1. Architectural Model

The WorkRequest Compiler follows a **layered compiler architecture** rather than a traditional automation script design.

```
Intent Layer
    ↓
WorkRequest Layer
    ↓
Compilation Layer
    ↓
Execution Layer
    ↓
Recording Layer
```

Each layer has strict responsibilities.

---

## Architectural Goal

The system exists to guarantee:

* reproducible AI execution
* persistent architectural memory
* deterministic continuation of work
* model independence
* project-local state with centralized tooling

---

# 2. High-Level Components

```
.agent/
 └── scripts/
     ├── executor.py      ← Compiler Driver
     └── process.sh       ← Execution Runtime

.pipeline/
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

---

## Component Overview

| Component          | Role                              |
| ------------------ | --------------------------------- |
| executor.py        | Compiler frontend & orchestration |
| process.sh         | Runtime executor                  |
| Skills             | Compiler passes                   |
| WorkRequest Folder | Compilation unit                  |
| Records            | Persistent build artifacts        |

---

# 3. Layered System Design

---

## 3.1 Intent Layer

**Source:** Human discussion or architectural reasoning.

Examples:

* conversation with AI
* design notes
* architectural decisions

Output:

* structured WorkRequest definition

This layer is intentionally informal.

---

## 3.2 WorkRequest Layer

A WorkRequest is equivalent to an **Abstract Syntax Tree (AST)**.

It contains:

* objective
* constraints
* execution strategy
* model preferences
* continuation state

Key invariant:

> A WorkRequest must be resumable without reconstructing context from memory.

---

## 3.3 Compilation Layer

Handled primarily by `executor.py`.

Responsibilities:

* locate project root
* resolve relative paths
* initialize workspace
* normalize folder structure
* select execution model
* invoke compiler passes (skills)

This layer translates intent into executable form.

---

### Compiler Pass Model

Skills behave like compiler passes:

```
initialize → analyze → generate → execute → record → continue
```

Each pass:

* consumes state
* mutates state
* emits artifacts

---

## 3.4 Execution Layer

Handled by `process.sh`.

Responsibilities:

* environment setup
* model invocation
* execution isolation
* consistent runtime entrypoint

Design rule:

> Execution must remain replaceable without changing compiler logic.

Possible future runtimes:

* local CLI models
* remote APIs
* agent frameworks
* distributed workers

---

## 3.5 Recording Layer

The most important layer.

Without recording, deterministic AI workflows are impossible.

Two permanent records exist:

### PROMPT_RECORDS

Captures:

* constructed prompts
* injected context
* model used
* execution timestamps

Equivalent to:

* compiler intermediate output
* build logs

---

### IMPLEMENTATION_PLAN_RECORD

Captures:

* decisions made
* files modified
* synchronization events
* architectural evolution

Equivalent to:

* commit history + rationale

---

# 4. Execution Lifecycle

```
1. WorkRequest created
2. Compiler initializes environment
3. Skills prepare prompt
4. Model executes work
5. Output applied
6. Records updated
7. WorkRequest state advanced
```

A WorkRequest may execute multiple times.

The compiler must support **incremental compilation**.

---

# 5. State Management

State is stored locally within each WorkRequest.

```
STATE.json
```

Tracks:

* execution phase
* selected model
* continuation pointer
* completion status
* retry information

Design principle:

> State lives with work, not tooling.

---

# 6. Project Root Resolution

A core architectural requirement.

The compiler must:

* detect repository root
* detect subproject boundaries
* resolve artifact locations
* replicate WorkRequest folders correctly

Future detection signals may include:

* `.git`
* build files
* language artifacts
* workspace manifests

---

# 7. Single Toolchain Rule

There must be:

* **one** `executor.py`
* **one** `process.sh`

Reasons:

1. Prevent version drift
2. Maintain consistent execution semantics
3. Enable global upgrades
4. Avoid duplicated logic

WorkRequests are replicated — tooling is not.

---

# 8. Continuation Model

The compiler is designed for **long-running intellectual work**.

A WorkRequest:

* does not end after one execution
* accumulates knowledge
* evolves implementation

Continuation enables:

* retroactive refactoring
* synchronization passes
* architectural correction

---

# 9. Model Routing Architecture (Planned)

Future compiler behavior:

```
Planning Pass        → Model A
Implementation Pass  → Model B
Review Pass          → Model C
Synchronization Pass → Model D
```

The compiler becomes a **model scheduler**.

Models become interchangeable backends.

---

# 10. Failure Philosophy

Failures are expected and must be recoverable.

Required properties:

* rerunnable execution
* append-only records
* no destructive overwrites
* deterministic restart

The compiler should behave more like `git` than a script.

---

# 11. Future Evolution

## Near-Term

* fix record update regression
* stabilize folder replication
* automatic workspace initialization
* configurable model selection
* pipeline trigger skill

---

## Mid-Term

* multi-file compiler modules
* explicit WorkRequest schema
* dependency graph between WorkRequests
* incremental compilation cache

---

## Long-Term

The WorkRequest Compiler evolves into:

* an AI-native build system
* a distributed execution coordinator
* a persistent architectural memory engine

---

# 12. Guiding Architectural Principle

Traditional development separates:

* planning
* implementation
* documentation

The WorkRequest Compiler unifies them.

> **Thinking, building, and recording become one continuous compilation process.**

---

# 13. Mental Model Summary

You are not running scripts.

You are compiling intent.

```
Human Reasoning
        ↓
Structured Work
        ↓
Compiler Passes
        ↓
AI Execution
        ↓
Recorded Software Evolution
```

This architecture treats AI not as an assistant, but as a **deterministic execution backend** for engineering cognition.

---

**Status:** Active Design
**Priority:** Stability before abstraction
