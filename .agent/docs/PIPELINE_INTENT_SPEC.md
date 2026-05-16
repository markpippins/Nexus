# Pipeline Intent Specification v1 — Control Plane

> **This is a control-plane specification. It defines the pre-pipeline compiler pass.
> It is not a pipeline stage. Pipeline stages begin only after ExecutionState is produced.**

## 1. Problem Statement

When asked to "set up a pipeline in project X", agents routinely misinterpret what the pipeline is for:

- **Misinterpretation A**: "Project X should generate WorkRequests" — treating the project as a producer
- **Misinterpretation B**: "Project X should consume WorkRequests at runtime" — treating the pipeline as a runtime dependency
- **Reality**: The pipeline is a **development tool** applied to project X. Project X is the target of pipeline-driven changes, not a participant in the pipeline.

The Pipeline Intent Specification eliminates this ambiguity by making the pipeline's relationship to its target project explicit through a structured contract that the [`normalize-intent`](../skills/normalize-intent/SKILL.md) compiler pass validates and normalizes.

---

## 2. The Three Axes

The pipeline's relationship to its target is described along three axes.

### 2.1 Direction

Where the pipeline's effects land.

| Value | Meaning |
|---|---|
| `external-only` | Pipeline operates **on** the repository — reads files, writes changes, creates artifacts. It is a development tool, not a runtime component. |
| `internal-instrumentation` | Pipeline modifies runtime behavior — adds telemetry, changes configuration that affects execution. The pipeline's effects are observable at runtime, not just in the repo. |

### 2.2 processingMode

What the pipeline does with WorkRequests.

| Value | Meaning |
|---|---|
| `generate` | Pipeline produces WorkRequests for downstream consumers. No code mutation. |
| `execute` | Pipeline reads and applies WorkRequests — writes code, makes changes. |
| `transform` | Pipeline converts WorkRequests between lifecycle states (e.g., DRAFT → READY). |

### 2.3 mutationScope

Capability grants — what the pipeline is allowed to touch.

```yaml
mutationScope:
  filesystem:
    read: true
    write: non-code-only | all
  code:
    write: true | false
  runtime:
    instrument: true | false
```

| Flag | Effect |
|---|---|
| `filesystem.read` | May read project files |
| `filesystem.write: non-code-only` | May write docs, configs, records — but not source code |
| `filesystem.write: all` | May write any file including non-code assets |
| `code.write: true` | May create or modify source code |
| `runtime.instrument: true` | May alter runtime behavior (telemetry, config injection, etc.) |

---

## 3. Axis Composition

### 3.1 ExecutionState Derivation

The three axes are not independently executable. They compose into a single derived **ExecutionState** used for routing decisions. This derivation is implemented by [`normalize-intent`](../skills/normalize-intent/SKILL.md).

```
ExecutionState = f(direction, processingMode, mutationScope)
```

| ExecutionState | Direction | processingMode | mutationScope |
|---|---|---|---|
| `READ_ONLY_PLAN` | external | generate | filesystem.read=true, code.write=false, runtime.instrument=false |
| `CODE_EXECUTION` | external | execute | code.write=true, runtime.instrument=false |
| `RUNTIME_INSTRUMENT` | internal | execute | code.write=true, runtime.instrument=true |
| `TRANSFORM_PIPELINE` | external | transform | filesystem.read=true, filesystem.write=non-code-only, code.write=false |

Note: `TRANSFORM` was renamed to `TRANSFORM_PIPELINE` in v1.1 of the routing model.

### 3.2 Valid Intent Combinations

Invalid combinations MUST fail intent resolution. No coercion. These rules are enforced by `normalize-intent` rules R2–R4.

| Direction | processingMode | filesystem.write | code.write | runtime.instrument | Valid |
|---|---|---|---|---|---|
| external | generate | non-code-only | false | false | **YES** — plan mode, WR emission only |
| external | generate | all | true | false | **YES** — plan mode with artifact generation |
| external | generate | any | any | true | **NO** — producer cannot instrument runtime |
| external | execute | all | true | false | **YES** — standard code execution |
| external | execute | any | any | true | **NO** — external tool cannot instrument runtime |
| external | transform | non-code-only | false | false | **YES** — WR lifecycle management |
| external | transform | all | true | false | **YES** — transform with artifact writes |
| internal | execute | all | true | true | **YES** — runtime instrumentation |
| internal | generate | any | any | any | **NO** — internal pipelines cannot be producers |
| any | any | false | true | any | **NO** — code.write requires filesystem.read |
| any | any | false | false | true | **NO** — runtime instrumentation requires filesystem access |

### 3.3 Intent Stability Rule

`pipelineIntent` is **immutable after initialization**.

- No component may mutate the canonical intent
- Components may emit `IntentProposal` events (for logging/audit)
- `IntentProposal` events are validated but do not change `pipelineIntent`
- Changing intent requires a new pipeline initialization

---

## 4. Intent Declaration Schema

Declared in `.pipeline/PIPELINE_INTENT.yaml` (the input file read by `normalize-intent`):

```yaml
pipelineIntent:
  specification: "v1"
  direction: external-only | internal-instrumentation
  processingMode: generate | execute | transform
  mutationScope:
    filesystem:
      read: true
      write: non-code-only | all
    code:
      write: true | false
    runtime:
      instrument: true | false
```

---

## 5. Intent Resolution (Authoring Rules)

These inference rules are used by [`pipeline-intent`](../skills/pipeline-intent/SKILL.md) to *author* a `PIPELINE_INTENT.yaml` from user context. They are not part of the validation or normalization pass — that is the responsibility of `normalize-intent`.

### 5.1 Deterministic Inference Rules

| Keyword or context | direction | processingMode | mutationScope |
|---|---|---|---|
| "instrument", "telemetry", "observe" | internal-instrumentation | execute | code.write=true, runtime.instrument=true |
| "plan", "architect", "design", "spec" | external-only | generate | filesystem.write=non-code-only, code.write=false |
| "implement", "code", "build", "fix", "feature" | external-only | execute | filesystem.write=all, code.write=true |
| "transform", "promote", "migrate-wr" | external-only | transform | filesystem.write=non-code-only, code.write=false |
| Target is a git repo with `src/` directory | external-only | execute | filesystem.write=all, code.write=true |
| Target is an empty directory | external-only | generate | filesystem.write=non-code-only, code.write=false |

### 5.2 Ambiguity Resolution Policy

If multiple valid intents match the same input:

- **MUST** require user confirmation
- **MUST NOT** default to any value
- **MUST** present all valid options with their ExecutionState consequences
- **MUST** fail if user does not confirm

---

## 6. Normalization Pass

Before any routing decision, the raw `PIPELINE_INTENT.yaml` undergoes deterministic normalization by the [`normalize-intent`](../skills/normalize-intent/SKILL.md) compiler pass:

```
PIPELINE_INTENT.yaml  (or pipeline-mode.json fallback)
        ↓
normalize-intent (CONTROL PLANE — exclusive owner)
  - validates schema (R1)
  - checks mode compatibility matrix (R2)
  - enforces direction consistency (R3)
  - enforces mutation safety (R4)
  - derives ExecutionState (ES1–ES5)
  - verifies determinism (R5)
  - outputs canonical ExecutionState
        ↓
ExecutionState (canonical, pre-validated)
        ↓
mode-router (PURE ROUTER — consumes ExecutionState only)
```

Raw axis values are never consumed directly by routing logic. Only the normalized ExecutionState is used. This prevents future drift between the schema and execution rules.

**Invariant**: `normalize-intent` is the exclusive owner of ExecutionState derivation. No other component may interpret `PIPELINE_INTENT.yaml` or derive ExecutionState.

Pipeline stages begin ONLY after ExecutionState is produced.

---

## 7. Contract Tables

### 7.1 Control Plane

| Component | Reads | Produces |
|---|---|---|
| `pipeline-intent` | User context + project analysis | `PIPELINE_INTENT.yaml` |
| `normalize-intent` | `PIPELINE_INTENT.yaml` (or `pipeline-mode.json`) | Canonical `ExecutionState` |
| `mode-router` | `ExecutionState` | Execution pipeline selection |

### 7.2 Execution Pipeline

| Stage | Reads | Effect |
|---|---|---|
| `requirements-capture` | processingMode | Determines WorkRequest shape (generate vs execute vs transform) |
| `archive-prompt` | mutationScope.filesystem | Determines whether prompts may reference code files |
| `work-request-emission` | processingMode | Generates WRs only if processingMode=generate |
| codegen operations | mutationScope.code.write | Gates all write-to-code operations |
| instrumentation hooks | direction + mutationScope.runtime | Gates runtime hook insertion |
| `archive-implementation` | mutationScope.filesystem | Determines record format and scope |

---

## 8. Examples

### Example 1: Dev tool applied to a project

```
Request: "set up a pipeline in project X"

Inference (pipeline-intent):
  Target has src/         → direction=external-only
  Making changes          → processingMode=execute
  Writing code            → mutationScope.code.write=true

Validation (normalize-intent):
  Schema valid            → R1 pass
  EXECUTE + code.write    → R2 pass (ANY mutationScope allowed)
  external + execute      → R3 pass
  No mutation safety issue → R4 pass

Result:
  direction: external-only
  processingMode: execute
  mutationScope:
    filesystem: { read: true, write: all }
    code:       { write: true }
    runtime:    { instrument: false }

ExecutionState: CODE_EXECUTION
Meaning: Pipeline is a dev tool, not a runtime integration.
```

### Example 2: Planning session

```
Request: "generate WorkRequests from this architecture discussion"

Inference (pipeline-intent):
  "plan" keyword          → processingMode=generate
  No code changes         → mutationScope.code.write=false

Validation (normalize-intent):
  Schema valid            → R1 pass
  generate + code.write=false → R2 pass
  external + generate     → R3 pass
  No mutation safety issue → R4 pass

Result:
  direction: external-only
  processingMode: generate
  mutationScope:
    filesystem: { read: true, write: non-code-only }
    code:       { write: false }
    runtime:    { instrument: false }

ExecutionState: READ_ONLY_PLAN
```

### Example 3: Runtime instrumentation

```
Request: "add telemetry to the payment service"

Inference (pipeline-intent):
  "instrument" keyword      → direction=internal-instrumentation
  "telemetry" keyword       → mutationScope.runtime.instrument=true
  Code changes needed       → mutationScope.code.write=true

Validation (normalize-intent):
  Schema valid                → R1 pass
  execute + code.write=true   → R2 pass
  internal + execute          → R3 pass
  No mutation safety issue    → R4 pass

Result:
  direction: internal-instrumentation
  processingMode: execute
  mutationScope:
    filesystem: { read: true, write: all }
    code:       { write: true }
    runtime:    { instrument: true }

ExecutionState: RUNTIME_INSTRUMENT
```

### Example 4: Ambiguous input

```
Request: "set up a pipeline"

Keywords:
  "set up"     → could be generate (initialize WR structure)
  "pipeline"   → could be execute (tool applied to project)

Result: AMBIGUOUS — require user confirmation
Present options:
  A) READ_ONLY_PLAN    — initialize WR infrastructure, no code changes
  B) CODE_EXECUTION    — apply pipeline as dev tool to current project
```
