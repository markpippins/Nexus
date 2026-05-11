# Execution Context (Current Run)

This document is the explicit execution trace. It is immutable during the run and fully replayable afterward. It operates strictly outside of the Long-Term PEB and Short-Term Thought Context.

## State Snapshot
- `PEB_STATE_HASH`: [To be injected]
- `THOUGHT_CONTEXT_HASH`: [To be injected]

## Causal Trace DAG
(Segments will be appended here following the schema defined in `peb/meta/trace_policy.md`)

```yaml
RUN_SEGMENT:
  id: init_0
  parent_segment_id: null
  stage: system_initialization
  inputs: []
  causal_entries: [Waiting for initial WorkRequest]
  rejected_alternatives: []
```
