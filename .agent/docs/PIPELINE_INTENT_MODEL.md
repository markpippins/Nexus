# Pipeline Intent Model v1

## 1. Problem Statement

When asked to "set up a pipeline in project X", agents routinely misinterpret what the pipeline is for:

- **Misinterpretation A**: "Project X should generate WorkRequests" — treating the project as a producer
- **Misinterpretation B**: "Project X should consume WorkRequests at runtime" — treating the pipeline as a runtime dependency
- **Reality**: The pipeline is a **development tool** applied to project X. Project X is the target of pipeline-driven changes, not a participant in the pipeline.

The Pipeline Intent Model eliminates this ambiguity by making the pipeline's relationship to its target project explicit through a structured contract.

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
| `generate` | Pipeline produces WorkRequests for downstream consumers. No code mutation. (Was `producer`.) |
| `execute` | Pipeline reads and applies WorkRequests — writes code, makes changes. (Was `consumer`.) |
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

The three axes are not independently executable. They compose into a single derived **ExecutionState** used for routing decisions.

```
ExecutionState = f(direction, processingMode, mutationScope)
```

| ExecutionState | Direction | processingMode | mutationScope |
|---|---|---|---|
| `READ_ONLY_PLAN` | external | generate | filesystem.read=true, code.write=false, runtime.instrument=false |
| `CODE_EXECUTION` | external | execute | code.write=true, runtime.instrument=false |
| `RUNTIME_INSTRUMENT` | internal | execute | code.write=true, runtime.instrument=true |
| `TRANSFORM` | external | transform | filesystem.read=true, filesystem.write=non-code-only, code.write=false |

### 3.2 Valid Intent Combinations

Invalid combinations MUST fail intent resolution. No coercion.

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

- No stage may mutate the canonical intent
- Stages may emit `IntentProposal` events (for logging/audit)
- `IntentProposal` events are validated but do not change `pipelineIntent`
- Changing intent requires a new pipeline initialization

---

## 4. Intent Declaration Schema

Declared in `.pipeline/PIPELINE_INTENT.yaml`:

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

## 5. Intent Resolution

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

## 6. Intent Normalization Layer

Before any routing decision, raw intent undergoes normalization:

```
PIPELINE_INTENT.yaml
        ↓
Intent Normalizer
  - validates against schema v1
  - rejects invalid combinations per §3.2 validity matrix
  - canonicalizes flags to canonical form
  - derives ExecutionState per §3.1
  - outputs normalized intent object
        ↓
ExecutionState
        ↓
Mode Router (or other consumer)
```

Raw axis values are never consumed directly by routing logic. Only the normalized ExecutionState is used. This prevents future drift between the schema and execution rules.

---

## 7. Contract Binding Table

| Stage | Reads | Effect |
|---|---|---|
| `mode-router` | ExecutionState | Selects plan/execute/instrument mode for the agent |
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

Inference:
  Target has src/         → direction=external-only
  Making changes          → processingMode=execute
  Writing code            → mutationScope.code.write=true

Result:
  direction: external-only
  processingMode: execute
  mutationScope:
    filesystem:
      read: true
      write: all
    code:
      write: true
    runtime:
      instrument: false

ExecutionState: CODE_EXECUTION
Meaning: Pipeline is a dev tool, not a runtime integration.
```

### Example 2: Planning session

```
Request: "generate WorkRequests from this architecture discussion"

Inference:
  "plan" keyword          → processingMode=generate
  No code changes         → mutationScope.code.write=false

Result:
  direction: external-only
  processingMode: generate
  mutationScope:
    filesystem:
      read: true
      write: non-code-only
    code:
      write: false
    runtime:
      instrument: false

ExecutionState: READ_ONLY_PLAN
```

### Example 3: Runtime instrumentation

```
Request: "add telemetry to the payment service"

Inference:
  "instrument" keyword      → direction=internal-instrumentation
  "telemetry" keyword       → mutationScope.runtime.instrument=true
  Code changes needed       → mutationScope.code.write=true

Result:
  direction: internal-instrumentation
  processingMode: execute
  mutationScope:
    filesystem:
      read: true
      write: all
    code:
      write: true
    runtime:
      instrument: true

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
