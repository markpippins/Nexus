# /dev Runtime Authority Manifest

**Version:** 0.1 (Exploratory)  
**Status:** Design sketch — no implementation exists  
**File:** `graph/dev-runtime-manifest.md`  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Problem: Descriptive vs Binding Metadata](#2-problem-descriptive-vs-binding-metadata)
3. [Mount Semantics](#3-mount-semantics)
4. [Manifest Schema](#4-manifest-schema)
5. [Agent Instantiation Model](#5-agent-instantiation-model)
6. [Relationship to Existing Artifacts](#6-relationship-to-existing-artifacts)
7. [Pipeline Integration](#7-pipeline-integration)

---

## 1. Overview

The **/dev Runtime Authority Manifest** is a root-level contract file that
declares authority hierarchy, execution rules, and governance scope for
an agent runtime. It answers:

> *What is the valid action space for agents operating in this context?*

The manifest is inspired by the observation (from "Self-audit in Agent
Runtime" transcript) that agents currently interpret authority through
descriptive metadata rather than binding contracts. The manifest flips
this: instead of describing who has authority, it **declares** it as a
root-level binding contract.

### Design Principle

```
Do not describe authority — declare it.
Do not suggest constraints — enforce them.
Do not document governance — embed it.
```

---

## 2. Problem: Descriptive vs Binding Metadata

### Current State

The `.agent/` directory structure currently serves as **descriptive
metadata** — it documents roles, skills, and pipeline modes but does not
constitute a binding authority declaration.

| Issue | Consequence |
|-------|-------------|
| `.agent/` is "just another directory pattern" | Agents can ignore it or treat it as advisory |
| Authority is implied by role descriptions | Models infer hierarchy ("above me") rather than reading contracts |
| Rules are documented, not encoded | Violations are noticed post-facto, not prevented |
| No root-level contract | Each subsystem defines its own authority model independently |

### The Fix: /dev Manifest

The `/dev` manifest provides **mount semantics** — a UNIX-filesystem-inspired
model where agents and subsystems are mounted under a root that declares
their authority at the point of mounting:

```
/dev
  ├── (host runtime — opencode / agent server)
  ├── Nexus/   ← mounted governance subsystem
  ├── Conduit/ ← mounted execution subsystem
  └── tools/   ← mounted tool subsystem
```

Under this model:
- Each mount point declares what the subsystem **may do**
- The manifest is loaded before any execution pathway opens
- Agents are instantiated as "running under /dev with Nexus mounted
  as governance layer"
- Authority is a property of **mount position**, not role description

---

## 3. Mount Semantics

Mount semantics define how subsystems relate to each other and to the
runtime.

### Mount Types

| Type | Behavior | Example |
|------|----------|---------|
| **governance** | Defines valid action space; all other mounts inherit constraints | `Nexus/` |
| **execution** | Executes within governance constraints | `Conduit/` |
| **tool** | Provides capabilities, no authority | `tools/` |
| **epistemic** | Read-only observation and analysis | `analysis/` |

### Mount Hierarchy

```
/dev
  ├── nexus/         (governance) — CIRS rules, PEB invariants
  │   ├── schema/    (epistemic) — type definitions
  │   ├── operators/ (epistemic) — projection operators
  │   └── conduit/   (execution) — WR execution
  ├── tools/         (tool)      — utilities
  └── users/         (epistemic) — workspace context
```

### Mount Properties

Each mount point declares:

| Property | Description |
|----------|-------------|
| `mount_path` | Where in the /dev tree this lives |
| `mount_type` | governance / execution / tool / epistemic |
| `authority` | List of allowed actions (subset of universal action set) |
| `constraints` | CIRS rules that apply (inherits parent rules) |
| `visibility` | What other mounts can see |

---

## 4. Manifest Schema

A minimal /dev manifest file:

```yaml
# /dev/manifest.yaml
version: 0.1

# Root authority declaration
root:
  runtime: opencode
  boot_sequence:
    - load: governance   # Load CIRS rules first
    - load: mounts       # Mount all subsystems
    - open: execution    # Open execution pathways

# Governance mount
mounts:
  - path: /dev/nexus
    type: governance
    authority:
      - enforce_cirs_rules
      - validate_transitions
      - manage_canonical_state
    constraints:
      - CIRS-CORE
      - CIRS-IR-01
      - CIRS-IR-05

  - path: /dev/nexus/operators
    type: epistemic
    authority:
      - project_observations
      - emit_projection_ir
    constraints:
      - CIRS-IR-04  # operator boundary integrity
      - CIRS-IR-10  # no contamination

  - path: /dev/conduit
    type: execution
    authority:
      - execute_work_requests
      - record_execution_traces
    constraints:
      - CIRS-IR-05  # no IR in execution
      - CIRS-CORE   # synthesis/execution separation

  - path: /dev/tools
    type: tool
    authority: []
    constraints: []
```

### Schema Rules

1. **Mounts cannot escalate authority.** A mount's authority is a subset of
   its parent's authority.
2. **Constraints cascade.** A mount inherits all constraints from its parents.
3. **No shadow governance.** Two governance mounts cannot have overlapping
   authority domains.
4. **Execution mounts must have a governance parent.** An execution mount
   with no governance mount in its ancestry is invalid.

---

## 5. Agent Instantiation Model

Under the /dev manifest model, agents are instantiated as:

```
agent_instance = mount(path="/dev/nexus/operators/atten", context=...)
```

### What This Means

- The agent is **mounted** at a specific position in the /dev hierarchy
- Its authority is determined by the mount point's declaration
- It inherits all constraints from ancestor mounts
- It cannot act outside its mount's declared authority
- It cannot read other mount points' internal state unless `visibility`
  permits

### Comparison to Current Model

| Aspect | Current (`.agent/` metadata) | /dev Manifest |
|--------|------------------------------|---------------|
| Authority source | Role description in prompts | Mount position in manifest |
| Constraint model | Advisory (can be ignored) | Binding (cannot be violated) |
| Agent identity | "I am an X agent" | "I am mounted at /dev/nexus/operators/X" |
| Governance visibility | Documented, not embedded | Embedded in the manifest |
| Cross-agent boundaries | Implicit | Explicit (mount isolation) |

### Boot Sequence

```
1. Load /dev/manifest.yaml
2. Validate manifest structure (self-check)
3. Load CIRS rules from governance mounts
4. Mount all subsystems (allocate agents, open channels)
5. Validate all mounts against CIRS rules
6. Open execution pathways
7. [System is now operational]
```

---

## 6. Relationship to Existing Artifacts

The /dev manifest does **not** replace existing artifacts — it wraps them
with a binding authority declaration.

| Existing Artifact | Relationship |
|-------------------|-------------|
| `.agent/pipeline-mode.json` | Defines active/inactive pipeline mode. The manifest declares *why* a mode is active and *what authority it carries*. |
| `.agent/OPERATING_MODEL.md` | Documents operating principles. The manifest would encode binding versions of those principles. |
| `.agent/skills/` | Defines skill directories. The manifest declares which skills are mounted and under what authority. |
| `.agent/config/` | Configuration files. The manifest references them as mounted resources. |
| `AGENTS.md` (workspace root) | Governs agent behavior. The manifest would provide the runtime binding for AGENTS.md directives. |
| `CLAUDE.md` | Agent identity file. The manifest replaces "you are an X agent" role descriptions with mount positions. |

### Migration Path

1. Audit current `.agent/` directory for authority-relevant content
2. Define manifest schema that captures current implicit authority model
3. Generate manifest from existing metadata (not rewrite)
4. Phase in enforcement: start with advisory, graduate to binding
5. Deprecate `.agent/` role descriptions in favor of manifest declarations

---

## 7. Pipeline Integration

The /dev manifest integrates directly with the Nexus WRP pipeline:

### WorkRequest Lifecycle

```
1. Agent is mounted at /dev/nexus/operators/<op>
2. Agent receives observation
3. Agent projects within mount authority
4. Agent emits ProjectionIR
5. Synthesis (mounted at /dev/nexus/synthesis) consumes IR
6. Planner (mounted at /dev/nexus/planner) creates WorkRequest
7. WorkRequest crosses into Conduit (mounted at /dev/conduit)
8. Conduit executes
```

At each step, the manifest's authority declarations and CIRS constraints
govern what transitions are valid. No step can exceed its mount's
declared authority.

### Pipeline State Integration

The manifest could be extended to declare pipeline state transitions:

```yaml
mounts:
  - path: /dev/nexus/pipeline
    type: governance
    pipeline:
      states: [proposed, planning, pending, executing, reviewing, completed]
      transitions:
        proposed: [planning]
        planning: [pending, proposed]
        pending: [executing, planning]
        executing: [reviewing, pending]
        reviewing: [completed, pending]
```

This would make pipeline state a **mounted contract** rather than a
convention documented in markdown files.

---

*End of /dev Runtime Authority Manifest v0.1 — Exploratory design sketch
for root-level binding authority declarations. See also:
`graph/cognitive-integrity-rule-system.md`, `nexus/.agent/pipeline-mode.json`.*
