# Cascade: Inference Subscriber POC

**Project:** nexus
**Plan Number:** 1022
**Status:** pending

## Goal

Create a temporary, single-file NATS subscriber that bridges Cascade events to LLM inference via Tackle. When Cascade is stripped of its LLM/workflow components (Plan #1021), this subscriber serves as the temporary home for "event capture + LLM orchestration" — preventing a vacuum during the refactor.

## Architectural Problem

After stripping LLM from Cascade, events (IdeaCaptured, etc.) will be published on NATS subjects (`nexus.cascade.v1.workflow.>`) but nothing will consume them to invoke inference. Cascade itself becomes a pure event bus (ingest → validate → sequence → publish). The LLM invocation pattern needs a temporary bridge until the permanent inference layer (agent roles with Tackle subscriptions) matures.

## Target Architecture

```
Cascade (pure event bus)
  │  publishes IdeaCaptured on nexus.cascade.v1.workflow.idea_captured
  │
  ▼
inference_subscriber.py  (single-file POC, lives in nexus/python/cascade/)
  │
  ├─ 1. NATS subscribe to nexus.cascade.v1.workflow.idea_captured
  ├─ 2. Resolve inference config via Tackle (tackle.db.get_role_config)
  ├─ 3. Build HarnessLauncher from config, inject prompt
  ├─ 4. subprocess.run(cmd) — fire-and-forget inference invocation
  └─ 5. Emit InferenceCompleted event (dual-write: events/ + NATS)
```

## Design Decisions

- **Single-file, zero new packages.** Reuses `nats_publisher.py`, `nats_envelope`, `tackle.db`, `tackle.harness_launcher`.
- **NATS-only input.** No file polling — subscribes via NATS.
- **Tackle as inference provider, not agent runtime.** Uses `get_role_config()` for model/harness resolution + `HarnessLauncher` for CLI command building. No session management, no streaming.
- **Dual-write output.** Follows existing Cascade pattern: write to `events/` directory + publish via NATS.
- **Temporary.** Single file, easy to delete or promote when the real inference layer exists.

## What This Is NOT

- Not an agent runtime (no sessions, no concurrency gates)
- Not Ollama-specific (HarnessLauncher abstracts the binary)
- Not bidirectional (subscribes to Cascade, publishes results back)

## Files Affected

- `nexus/python/cascade/inference_subscriber.py` — **CREATE** (POC NATS subscriber)

## Acceptance Criteria

- [ ] Subscribes to `nexus.cascade.v1.workflow.idea_captured` via NATS
- [ ] Resolves model/harness configuration via Tackle (`tackle.db.get_role_config`)
- [ ] Builds CLI command via `HarnessLauncher`
- [ ] Invokes inference via subprocess and captures output
- [ ] Publishes `InferenceCompleted` event back to NATS
- [ ] Writes completion event to `events/` directory (dual-write)
- [ ] Graceful fallback: logs output when NATS/Tackle unavailable
- [ ] Runs standalone: `python3 inference_subscriber.py`

## Dependencies

- NATS server on port 4222
- `nats-py` installed in cascade Python environment
- Tackle-MCP on port 3400 (for model resolution)
- `tackle` package importable (nexus/python/tackle/)
- `nats_envelope` package importable (nexus/python/nats_envelope/)

## Implementation Notes

- Event type → role mapping: `IdeaCaptured` → `architect` (hardcoded for POC; configurable later)
- Prompt: minimal wrapper around event payload text
- Invocation: synchronous `subprocess.run()` with timeout
- Result: wrapped in `CanonicalEnvelope` via existing `envelope_adapter.py`
- Published via existing `nats_publisher.py` infrastructure
