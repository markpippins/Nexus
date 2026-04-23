# Agentic Pipeline - Sprint 2 Completion Report
Date: 2026-04-09

## Summary

Sprint 2 upgraded the bootloader from a functional event-sourced workflow engine into a
**resilient, semi-autonomous system** with sandboxed compilation, patch-based integration,
LLM warmup, auto-advance, KernelPanic safety, and structured logging.

## New Components

| File | Purpose |
|---|---|
| `EXAMPLE_EVENTS.md` | Copy-paste event templates for testing each handler |
| `suggestions.txt` | Forward-looking suggestions (items 1-10) |

## Completed Items (Sprint 2)

### 1. CompileHandler — Real `tsp compile` in Sandbox ✓
- Replaced placeholder with `subprocess.run(["tsp", "compile", "main.tsp"])`
- Runs in a **sandbox directory** (`artifacts/<idea_id>/sandbox_compile/`)
- Never writes outside the artifact directory
- Captures stdout, stderr, exit code
- On success → emits `SpecCompiled` with file list and logs
- On failure → emits `StepRejected` with error details + writes `compile_failure.json`
- Logs written to `artifacts/<idea_id>/compile_stdout.log` and `compile_stderr.log`
- **Example events**: see `EXAMPLE_EVENTS.md` §1 (success) and §2 (failure)

### 2. IntegrateHandler — Patch-Based Integration ✓
- Replaced placeholder with diff-based approach
- Gathers current artifact state → builds proposed state → generates unified diff
- Writes `artifacts/<idea_id>/integrate.patch`
- Writes `artifacts/<idea_id>/integrate_plan.json` with change summary
- Human approval would trigger `patch apply` (next step)
- **Example event**: see `EXAMPLE_EVENTS.md` §3

### 3. Auto-Advance Workflow ✓
- `auto_advance: true/false` flag on `WorkflowPlanned` events
- When a step is `StepApproved` and `auto_advance == true`, the dispatcher
  automatically emits the next `StepRequested` event
- Steps in `REVIEW_REQUIRED = {"typespec", "refactor"}` are **never** auto-advanced —
  they always require human approval
- `converse capture --no-auto` creates workflows with `auto_advance: false`
- `KernelPanic` clears `auto_advance` for the affected workflow

### 4. LLM Warmup ✓
- `warmup_all()` called at dispatcher startup
- Sends a minimal prompt ("OK") to each model in `MODEL_MAP` before processing
- Already-warmed models are cached (`_WARMED_MODELS` set)
- Warmup failure is logged but doesn't block the pipeline (fallback handles it)

### 5. Artifact Propagation / Step Dependency Injection ✓
- Handlers use `load_prior_artifact(filename)` from `StepHandler` base class
- `TypeSpecHandler` loads `requirements.json` and `vocabulary.json` from disk
- `RefactorHandler` loads `compiled.json` and `main.tsp`
- `IntegrateHandler` loads `refactor_plan.json` and `compiled.json`
- Workflow vocabulary stored as `artifacts/<idea_id>/workflow_vocabulary.json`
- `WorkflowPlanned` event carries `vocabulary_path` instead of inline vocabulary

### 6. Event Management ✓
- **Sequential numbering** for manual events: `0001.json`, `0002.json`, ...
- **UUID** for system-generated events (dispatchers, completions)
- `converse clean [--dry-run]` removes:
  - Invalid JSON files
  - Duplicate completion events (keeps latest per idea+step type)
  - Never removes manually-numbered events (preserves audit trail)

### 7. Concurrency Awareness ✓
- Dispatcher imports `concurrent.futures` for future parallel dispatch
- Current implementation processes events sequentially for safety
- Architecture ready for `ThreadPoolExecutor` dispatch of non-conflicting steps

### 8. Safety / KernelPanic ✓
- Each handler tracks consecutive failures per step in `.failures.json`
- After 3 consecutive failures → `KernelPanic` event emitted
- KernelPanic clears `auto_advance` and pauses the workflow
- Projection shows 🔴 PANIC indicator in `converse status`
- **Example event**: see `EXAMPLE_EVENTS.md` §4

### 9. Testing / Sandbox Rules ✓
- All file writes under `artifacts/<idea_id>/` or `artifacts/<idea_id>/sandbox_compile/`
- Network calls limited to Ollama API (localhost:11434)
- Structured logging on every action:
  ```
  [2026-04-09T05:00:00Z] [idea_id] [step_name] message
  [2026-04-09T05:00:00Z] [dispatcher] message
  ```
- Logs captured: step start, success/failure, auto-advance, artifact paths

### 10. Output Standardization ✓
- Every handler returns a completion event dict with:
  - `type`: the completion event type (or `StepRejected` on failure)
  - `payload.idea_id`: the workflow identifier
  - `payload.step`: the step name
  - `payload.artifact_path`: path to the generated artifact
  - `payload.generated_by`: `"ollama"` | `"fallback"` | `"tsp_compile"`
- All events written to `events/` directory
- All artifacts written to `artifacts/<idea_id>/` directory

## Updated Components

| File | Changes |
|---|---|
| `handlers/steps.py` | Full rewrite: sandbox compile, patch integration, logging, failure tracking |
| `handlers/dispatcher.py` | Full rewrite: warmup, auto-advance, KernelPanic awareness, structured logging |
| `handlers/base.py` | Added `load_prior_artifact()` for step dependency injection |
| `agents/architect_agent.py` | Stores vocabulary as artifact file, respects `auto_advance` from CLI |
| `agents/llm.py` | Added `warmup_model()`, `warmup_all()`, reduced timeout to 30s |
| `bin/converse` | Added `clean` command, sequential event numbering, `--no-auto` flag, auto_advance display |
| `projections/update_tasks.py` | Tracks `auto_advance`, `kernel_panic`, `vocabulary_path` |
| `validators/events.py` | Added `KernelPanic` schema |

## Event Types (Updated)

| Type | Source | New? | Purpose |
|---|---|---|---|
| `KernelPanic` | System | ✓ | Workflow paused after 3 consecutive failures |
| `StepRejected` | System or Human | Updated | Now includes `artifact_path` on compile failures |

## Artifact Structure

```
artifacts/<idea_id>/
├── workflow_vocabulary.json     # Original vocabulary (auto-created)
├── vocabulary.json              # Generated vocabulary
├── requirements.json            # Generated requirements
├── main.tsp                     # Generated TypeSpec source
├── compiled.json                # Compilation output
├── compile_failure.json         # On compile error
├── compile_stdout.log           # Compilation stdout
├── compile_stderr.log           # Compilation stderr
├── refactor_plan.json           # Refactor plan
├── integrate_plan.json          # Integration plan
├── integrate.patch              # Unified diff patch
├── sandbox_compile/             # Temporary compile sandbox
│   └── main.tsp
└── .failures.json               # Consecutive failure counts per step
```

## Known Limitations

- `tsp compile` not installed in current environment → CompileHandler always falls back
- Ollama model `deepseek-coder:latest` returns non-JSON → all LLM calls use fallback
- Concurrency not yet enabled (infrastructure in place, not activated)
- Patch application not yet automated (integrate step produces patch, human must apply)
- No multi-user or authentication support

## Testing

All handlers tested in isolation:
- `CompileHandler` — correctly detects missing TypeSpec, writes failure event
- `IntegrateHandler` — generates empty-diff patch (no prior artifacts), writes plan
- `converse clean --dry-run` — works correctly
- Dispatcher warmup — runs at startup, logs warnings on failure
