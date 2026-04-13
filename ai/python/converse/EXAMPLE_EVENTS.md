# Example Event JSONs for Testing
# Place these in events/ directory to test handlers in isolation.

## 1. CompileHandler — Success Event

```json
{
  "id": "evt-compile-success-example",
  "type": "SpecCompiled",
  "timestamp": "2026-04-09T05:00:00Z",
  "source": "agent",
  "payload": {
    "idea_id": "evt-0006",
    "step": "compile",
    "artifact_path": "artifacts/evt-0006/compiled.json",
    "exit_code": 0,
    "output_files": ["tsp-output/openapi.json", "tsp-output/types.json"]
  }
}
```

## 2. CompileHandler — Failure Event (emitted by handler on compile error)

```json
{
  "id": "evt-compile-failure-example",
  "type": "StepRejected",
  "timestamp": "2026-04-09T05:00:00Z",
  "source": "system",
  "payload": {
    "idea_id": "evt-0006",
    "step": "compile",
    "reason": "Compilation failed: error TS-1234: Unknown type 'FooBar' at line 5",
    "artifact_path": "artifacts/evt-0006/compile_failure.json"
  }
}
```

## 3. IntegrateHandler — Success Event

```json
{
  "id": "evt-integrate-success-example",
  "type": "Integrated",
  "timestamp": "2026-04-09T05:00:00Z",
  "source": "agent",
  "payload": {
    "idea_id": "evt-0006",
    "step": "integrate",
    "artifact_path": "artifacts/evt-0006/integrate_plan.json",
    "patch_path": "artifacts/evt-0006/integrate.patch",
    "changes_count": 3
  }
}
```

## 4. KernelPanic Event (emitted after 3 consecutive failures)

```json
{
  "id": "evt-kernel-panic-example",
  "type": "KernelPanic",
  "timestamp": "2026-04-09T05:00:00Z",
  "source": "system",
  "payload": {
    "idea_id": "evt-0006",
    "step": "compile",
    "reason": "Compile failed 3x consecutively (last exit: 1): error TS-1234: Unknown type",
    "action": "Workflow paused. Human intervention required."
  }
}
```

## 5. Auto-Advance StepRequested (emitted by dispatcher)

```json
{
  "id": "evt-auto-advance-example",
  "type": "StepRequested",
  "timestamp": "2026-04-09T05:00:00Z",
  "source": "auto_advance",
  "payload": {
    "idea_id": "evt-0006",
    "step": "requirements"
  }
}
```

## How to Test

```bash
# Test CompileHandler in isolation (tsp compiler not installed):
cd /mnt/c/dev/nexus/ai/python/converse
python3 -c "
import sys; sys.path.insert(0, '.')
from handlers.steps import CompileHandler
h = CompileHandler('test-idea', {'idea': 'Test idea'}, 'artifacts')
result = h.handle()
print(result)
"

# Test IntegrateHandler:
python3 -c "
import sys; sys.path.insert(0, '.')
from handlers.steps import IntegrateHandler
h = IntegrateHandler('test-idea', {'idea': 'Test idea'}, 'artifacts')
result = h.handle()
print(result)
"

# Clean up test artifacts:
rm -rf artifacts/test-idea

# Test converse clean:
bin/converse clean --dry-run
bin/converse clean
```
