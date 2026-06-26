# Cascade NATS Integration Plan

**Status:** Draft — June 16, 2026
**Context:** cascade (formerly event-pipeline) is being integrated with NATS as its primary transport. Voyager already uses NATS (`nats-py`, subject `nexus.fs.v1.>`). This plan defines how cascade adopts the same pattern.

**Design lineage:** This plan builds on the existing IMPLEMENTATION_RECORD docs:
- **001** (EnvelopeMapper) — adopted conceptually; the WorkflowIntent bridge replaces the direct `IR_v2_EventEnvelope` mapping
- **002** (Systems Integrity) — the stateless-worker direction is deferred to Phase 4, but the core insight (abolish local offsets) is implemented in Phase 2
- **003** (Stateless Worker Architecture) — deferred to Phase 4; Phases 1-3 keep the existing step-machine model
- **004** (Worker Protocol v1) — claim/lease protocol adopted nearly verbatim in Phase 4

---

## 1. Current State

### What cascade does today
```
main.py
  └─ while True (every 2s):
       ├─ architect_agent.py  — reads IdeaCaptured from events/, writes WorkflowPlanned
       ├─ dispatcher.py       — reads StepRequested from events/, routes to handlers
       └─ update_tasks.py     — reads events, updates projections
```

- **Transport:** Local filesystem (`events/` directory, `offsets/` directory)
- **State tracking:** Local offset files (`offsets/architect`, `offsets/dispatcher`) with `last_timestamp` + `processed_ids`
- **Concurrency model:** Sequential subprocess calls, single-threaded (benefit: failure isolation — if `dispatcher.py` crashes, `architect_agent.py` has already completed)
- **LLM integration:** Direct Ollama calls (`agents/llm.py`)
- **Event types:** 12 flat JSON types (IdeaCaptured, WorkflowPlanned, StepRequested, StepApproved, StepRejected, KernelPanic, VocabularyDrafted, RequirementsFormalized, TypeSpecDrafted, SpecCompiled, RefactorDrafted, Integrated)

### What voyager already does (the pattern to follow)
```python
# voyager/src/fs_crawler_v2/publisher.py — reference implementation
class Publisher:
    def __init__(self, nats_url=None, origin_layer=None)
    async def connect(self)           # nats-py connect, graceful fallback
    async def publish(subject, event)  # publish + fallback to logging
    def scoped(layer) -> Publisher     # shared connection, different layer
    async def close()                  # clean disconnect
```
- Uses `nats-py` (async)
- Subject pattern: `nexus.fs.v1.>`
- CER envelope with `origin_layer`, `epoch_id`, `source_event_ids`
- Graceful fallback to logging when NATS unavailable
- CLI entry: `python -m voyager --nats nats://localhost:4222`

---

## 2. NATS Subject Hierarchy

### Subjects for cascade
```
nexus.cascade.v1.workflow.>        # Workflow lifecycle events
  .idea_captured                    # IdeaCaptured → triggers workflow planning
  .workflow_planned                 # WorkflowPlanned → steps defined
  .step_requested                   # StepRequested → dispatch a step
  .step_approved                    # StepApproved → human review pass
  .step_rejected                    # StepRejected → human review fail
  .step_completed.{step_name}       # Completion events (vocabulary/requirements/...)
  .kernel_panic                     # KernelPanic → unrecoverable failure

nexus.cascade.v1.control.>         # Control-plane subjects
  .claim                            # Worker claims a transition
  .claim_ack                        # Kernel acknowledges claim
  .health                           # Worker health checks
```

### Cross-subsystem subjects
```
nexus.ingest.v1.>                   # html-importer → IR events
nexus.fs.v1.>                       # voyager → file observations (existing)
nexus.vision.v1.>                   # vision (losm) → lifecycle events
nexus.cascade.v1.>                  # cascade → workflow events
nexus.ccnf.v1.>                     # Go CCNF → canonical verification (future)
```

### Subject alignment with voyager's SCCM
| Producer | Subject | Consumers |
|----------|---------|-----------|
| voyager | `nexus.fs.v1.observation` | topology, identity, cascade |
| voyager | `nexus.fs.v1.metadata_span` | vision (losm) |
| html-importer | `nexus.ingest.v1.workflow_intent` | cascade |
| cascade | `nexus.cascade.v1.workflow.>` | Conduit MCP, vision, audit |
| vision | `nexus.vision.v1.requirement_candidate` | WRP, cascade |

---

## 3. Phase 1: Dual-Write Bridge (File + NATS)

**Goal:** Add NATS publishing alongside existing file writes. Zero behavior change. No consumer changes required. This is a non-breaking bridge.

### What changes

**New file: `nexus/python/cascade/nats_publisher.py`**
```python
# Copy voyager's Publisher pattern exactly.
# Same graceful fallback: NATS → [LOGGER] on failure.
# Same scoped() method for per-component use.
# Same nats-py dependency.
```

**Phase 1 keeps subprocess isolation.** Instead of converting `main.py` to an async loop, the subprocess model is preserved for failure isolation. A NATS-sidecar approach is used: each component imports a shared `publish_queue` that buffers events, and a background thread drains the queue to NATS.

**Modified: `nexus/python/cascade/main.py`** — minimal change
```python
# OLD:
while True:
    subprocess.call(["python3", "agents/architect_agent.py"])
    subprocess.call(["python3", "handlers/dispatcher.py"])
    subprocess.call(["python3", "projections/update_tasks.py"])
    time.sleep(2)

# NEW: Start NATS sidecar thread before the loop, stop after.
# Subprocess calls unchanged — failure isolation preserved.
from nats_publisher import start_nats_sidecar, stop_nats_sidecar

nats_url = os.getenv("NATS_URL")
if nats_url:
    start_nats_sidecar(nats_url)
try:
    while True:
        subprocess.call(["python3", "agents/architect_agent.py"])
        subprocess.call(["python3", "handlers/dispatcher.py"])
        subprocess.call(["python3", "projections/update_tasks.py"])
        time.sleep(2)
finally:
    if nats_url:
        stop_nats_sidecar()
```

**New file: `nexus/python/cascade/nats_publisher.py`**
```python
# Thread-safe publish queue + background NATS connection.
# Solves the sync-code → async-NATS impedance mismatch.

import json
import logging
import threading
import queue

_publish_queue = queue.Queue()
_nats_thread = None
_nc = None

def _nats_worker(nats_url):
    """Background thread: drains queue and publishes to NATS."""
    import nats
    import asyncio
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    async def drain():
        global _nc
        try:
            _nc = await nats.connect(nats_url)
            logging.info(f"[cascade] NATS sidecar connected to {nats_url}")
        except Exception as e:
            logging.warning(f"[cascade] NATS unavailable: {e}. Queue will buffer.")
        
        while True:
            try:
                subject, payload = _publish_queue.get(timeout=1)
                if _nc:
                    try:
                        await _nc.publish(subject, json.dumps(payload).encode())
                    except Exception as e:
                        logging.error(f"[cascade] NATS publish error: {e}")
                        logging.info(f"[cascade] [STUB] {subject}: {json.dumps(payload, indent=2)}")
                else:
                    logging.info(f"[cascade] [LOGGER] {subject}: {json.dumps(payload, indent=2)}")
            except queue.Empty:
                continue
            except Exception:
                break
    
    loop.run_until_complete(drain())

def start_nats_sidecar(nats_url):
    global _nats_thread
    _nats_thread = threading.Thread(target=_nats_worker, args=(nats_url,), daemon=True)
    _nats_thread.start()

def stop_nats_sidecar():
    # Daemon thread exits when main process exits
    pass

def enqueue_publish(subject, event_dict):
    """Thread-safe: called from sync handlers. Queues event for NATS publish."""
    _publish_queue.put((subject, event_dict))
```

**Modified: `dispatcher.py` — add enqueue after `write_event()`**
```python
def write_event(evt_dict):
    # Existing file write (preserved)
    path = os.path.join(OUTPUT_DIR, f"{evt_dict['id']}.json")
    with open(path, "w") as f:
        json.dump(evt_dict, f, indent=2)

    # NEW: Enqueue for NATS publish (fire-and-forget, handled by sidecar thread)
    try:
        from nats_publisher import enqueue_publish
        subject = f"nexus.cascade.v1.workflow.{event_type_to_subject(evt_dict['type'])}"
        enqueue_publish(subject, evt_dict)
    except ImportError:
        pass  # nats_publisher not installed yet

    return path
```

**New dependency: `nats-py` in `requirements.txt`**
```
nats-py>=0.8.0
```

### What does NOT change
- Event JSON schema (same flat dicts)
- File-based state (events/ and offsets/ still exist)
- CLI interface (still runs as `python main.py`)
- Consumer model (no consumers switch to NATS yet)

### Success criteria
- `python main.py` runs as before
- Events appear in `events/` directory (unchanged)
- When NATS is available, events also appear on `nexus.cascade.v1.workflow.>`
- When NATS is unavailable, cascade continues working via files alone
- Zero changes to html-importer, Conduit MCP, or any consumer

---

## 4. Phase 2: File Consumer → NATS Subscriber

**Goal:** cascade consumes inbound events from NATS instead of polling `events/` directory. Outbound still dual-writes.

### What changes

**New: `nexus/python/cascade/nats_subscriber.py`**
```python
class CascadeSubscriber:
    """Subscribes to inbound cascade workflow events from NATS."""
    
    def __init__(self, nats_url=None):
        self.nc = None
        self.nats_url = nats_url
    
    async def connect(self):
        # Same connect pattern as Publisher
    
    async def subscribe(self, subject, handler):
        """Subscribe to a NATS subject with a handler callback."""
        sub = await self.nc.subscribe(subject)
        async for msg in sub.messages:
            event = json.loads(msg.data.decode())
            await handler(event)
    
    async def subscribe_workflow_events(self, architect_handler, dispatcher_handler):
        """Subscribe to all inbound workflow subjects."""
        # architect_agent subscribes to IdeaCaptured
        await self.subscribe("nexus.cascade.v1.workflow.idea_captured", architect_handler)
        # dispatcher subscribes to StepRequested, StepApproved
        await self.subscribe("nexus.cascade.v1.workflow.step_requested", dispatcher_handler)
        await self.subscribe("nexus.cascade.v1.workflow.step_approved", dispatcher_handler)
```

**Modified: `architect_agent.py`**
```python
# OLD: Polls events/ directory, uses read_offset()/write_offset()
# NEW: Exposes process_event() as async handler, receives events via NATS subscription
# Offset tracking removed. Event deduplication via event_id already in NATS.

async def handle_idea_captured(event, publisher):
    """Handler called when IdeaCaptured arrives via NATS."""
    if event["type"] == "IdeaCaptured":
        result = process_event(event)  # existing logic, now with publisher arg
        if publisher:
            await publisher.publish("nexus.cascade.v1.workflow.workflow_planned", result)
```

**Modified: `dispatcher.py`**
```python
# OLD: Polls events/ directory, uses read_offset()/write_offset()
# NEW: Exposes process_step_requested() as async handler
# Offset tracking removed. NATS handles delivery and deduplication.

async def handle_step_requested(event, publisher):
    """Handler called when StepRequested arrives via NATS."""
    result = process_step_requested(event, ...)  # existing logic
    if publisher:
        await publisher.publish(subject_for(result), result)
```

### Offset Retirement
The `offsets/` directory and `read_offset()`/`write_offset()` functions are removed in this phase. NATS provides at-least-once delivery. Idempotency is handled by:
- Checking `event["id"]` against already-processed IDs (in-memory set per run)
- Completion events carry `idea_id` + `step_name` — re-processing is safe (idempotent check in dispatcher)

### Success criteria
- No more `offsets/` directory reads/writes
- cascade still produces events to `events/` directory (dual-write)
- cascade consumes events from NATS when available
- When NATS is unavailable, falls back to polling `events/` directory
- `main.py` can run without `--nats` flag (file-only mode)

---

## 5. Phase 3: File Polling Retirement

**Goal:** cascade reads and writes exclusively via NATS. Filesystem is optional fallback only.

### What changes

**`events/` directory becomes optional**
- `--events-dir` flag for file fallback
- Default: no file I/O
- Events stored in NATS JetStream for persistence and replay

**`artifacts/` directory migration**
- Step handlers currently write artifacts (vocabulary JSON, compiled specs, patches) to `artifacts/{idea_id}/`
- In Phase 3, artifacts are embedded in completion event payloads (small: <1MB) or written to a shared object store path referenced in the event (large: patches, compiled binaries)
- `artifacts/` directory becomes a local cache, not the authority

**JetStream configuration**
```yaml
# NATS JetStream stream for cascade workflow events
stream: CASCADE_WORKFLOW
subjects:
  - nexus.cascade.v1.workflow.>
retention: interest      # Keep while consumers exist (not time-series)
max_age: 30d             # 30-day max retention as safety net
storage: file            # Persistent on disk
replicas: 1              # Single-node for now
```

**Projections via JetStream consumer**
```python
# projections/update_tasks.py becomes a JetStream consumer
# Instead of polling events/ directory, it subscribes to the stream
# and maintains a materialized view (tasks_by_priority.json) from the event log

class ProjectionConsumer:
    async def run(self):
        js = self.nc.jetstream()
        psub = await js.pull_subscribe(
            "nexus.cascade.v1.workflow.>",
            durable="cascade-projections"
        )
        while True:
            msgs = await psub.fetch(batch=50, timeout=5)
            for msg in msgs:
                self.apply_event(json.loads(msg.data))
                await msg.ack()
            self.write_materialized_view()  # tasks_by_priority.json
```

**Replay capability**
```python
class JetStreamReplay:
    """Replay historical cascade events from JetStream."""
    
    async def replay_workflow(self, idea_id):
        """Replay all events for a specific workflow."""
        consumer = await js.pull_subscribe(
            f"nexus.cascade.v1.workflow.>",
            durable=f"replay-{idea_id}"
        )
        # Fetch and replay in order by timestamp
```

### Success criteria
- No `events/` writes in default mode
- Events durable in JetStream
- Replay works end-to-end for a given `idea_id`
- File fallback works when `--events-dir` specified
- All 6 step handlers produce correct artifacts from replay

---

## 6. Phase 4: Distributed Workers

**Goal:** Multiple cascade workers can run concurrently, with NATS-based claim/lease for work distribution.

### Architecture
```
                    ┌─────────────────┐
                    │   NATS Server    │
                    │  (JetStream)     │
                    └──────┬──────────┘
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼──────┐
    │ cascade-01  │ │ cascade-02 │ │ cascade-03 │
    │ (worker)    │ │ (worker)   │ │ (worker)   │
    └─────────────┘ └────────────┘ └────────────┘
```

### Claim/Lease Protocol (JetStream KV-backed)
```
1. Worker subscribes to nexus.cascade.v1.workflow.step_requested (queue group)
2. On receiving StepRequested, worker attempts JetStream KV create:
     key: "claims.{idea_id}.{step_name}"
     value: { execution_id, worker_id, claimed_at }
   Only one worker succeeds — KV create is atomic.
3. Winning worker receives claim_ack, executes LLM
4. Other workers see KV create fail → skip the work
5. Worker publishes completion to:
     nexus.cascade.v1.workflow.step_completed.{step_name}
   and deletes the KV claim key.
```

**Why JetStream KV instead of raw pub/sub:** nats-py core NATS does not guarantee cross-publisher ordering. JetStream KV provides atomic create-or-fail, which is the correct primitive for distributed claim/lease.

### Worker health
- Periodic heartbeat on `nexus.cascade.v1.control.health`
- If heartbeat stops, stalled claims re-enter the work queue
- Claim timeout: 5 minutes (configurable)

### Success criteria
- 3 workers running concurrently, no duplicate executions
- Kill a worker mid-execution → another worker picks up stalled claim
- No shared filesystem state (all coordination via NATS)

---

## 7. Testing Strategy

| Phase | Test Approach |
|-------|--------------|
| 1 | Existing file-based pipeline runs end-to-end. `nats bench` verifies events on subjects. Run cascade with/without NATS — both modes produce identical `events/` output. |
| 2 | `nats sub` verifies inbound events consumed from NATS instead of files. Remove an event file → cascade still picks it up from JetStream replay. Offset files absent. |
| 3 | Delete `events/` directory entirely. Run cascade → all events in JetStream only. Replay a full workflow from JetStream → identical artifacts produced. Projections consumer produces correct `tasks_by_priority.json`. |
| 4 | 3 workers + 1 NATS. Inject 10 StepRequested events → exactly 10 completions, no duplicates. Kill worker-02 mid-execution → worker-03 claims and completes. KV claims clean up correctly. |

---

## 8. The WorkflowIntent Bridge

**Goal:** Define the contract between html-importer (semantic world) and cascade (operational world).

### Schema
```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "WorkflowIntent",
  "type": "object",
  "required": ["intent_id", "workflow_type", "title", "summary", "source", "priority"],
  "properties": {
    "intent_id": { "type": "string", "format": "uuid" },
    "workflow_type": {
      "type": "string",
      "enum": [
        "subsystem_formalization",
        "design_ratification",
        "question_resolution",
        "architecture_analysis",
        "transcript_ingestion"
      ]
    },
    "priority": {
      "type": "string",
      "enum": ["low", "medium", "high"],
      "description": "Scheduling priority for cascade dispatcher"
    },
    "title": { "type": "string" },
    "summary": { "type": "string" },
    "semantic_refs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "ref_type": { "enum": ["observation", "entity", "conversation", "constraint"] },
          "ref_id": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    },
    "objectives": {
      "type": "array",
      "items": { "type": "string" }
    },
    "source": {
      "type": "object",
      "properties": {
        "component": { "type": "string" },
        "transcript_id": { "type": "string" },
        "timestamp": { "type": "string", "format": "date-time" }
      }
    }
  }
}
```

**Known type gap:** `source.timestamp` uses ISO8601 string (Python convention). Go CCNF canonical types use int64 unix epoch. When the CCNF bridge is implemented, a conversion layer will handle this. For cascade's internal use, ISO8601 is fine.

### Flow
```
html-importer (IR_v2_EventEnvelope)
    │
    ▼
SemanticDistillation (extract actionable intent from semantic graph)
    │
    ▼
WorkflowIntent (schema-valid JSON)
    │
    ▼  NATS: nexus.ingest.v1.workflow_intent
    │
cascade (IdeaCaptured handler)
    │
    ▼
WorkflowPlanned → StepRequested → ...
```

### Location
- Schema: `nexus/.agents/schema/workflow_intent.schema.json`
- Python: `nexus/python/cascade/workflow_intent.py` (Pydantic model)
- Bridge: `nexus/python/ingest/html-importer/workflow_intent_bridge.py`

### Success criteria
- html-importer can emit `WorkflowIntent` JSON
- cascade can consume `WorkflowIntent` and create `IdeaCaptured`
- Round-trip: transcript → html-importer → WorkflowIntent → cascade → IdeaCaptured → WorkflowPlanned

---

## 9. Implementation Phases Summary

| Phase | Name | Risk | Estimated Effort | Depends On |
|-------|------|------|-----------------|------------|
| 1 | Dual-Write Bridge | Low | 1-2 days | nats-py installed |
| 2 | File Consumer → NATS Subscriber | Medium | 2-3 days | Phase 1 |
| 3 | File Polling Retirement + JetStream | Medium | 3-4 days | Phase 2 |
| 4 | Distributed Workers | High | 4-5 days | Phase 3 |
| — | WorkflowIntent Bridge | Medium | 2-3 days | None (parallel) |

### Go/No-Go Gates

**Phase 1 → 2:** NATS server running, dual-write confirmed, no regressions in existing file-based pipeline.

**Phase 2 → 3:** All consumers confirmed working via NATS, JetStream configured, replay tested.

**Phase 3 → 4:** JetStream durable, replay verified, claim protocol designed and reviewed.

---

## 10. Dependencies

### New Python dependencies
```
nats-py>=0.8.0          # NATS client (same as voyager)
```

### Infrastructure
```
NATS Server >= 2.10     # With JetStream enabled
  - nats://localhost:4222 (client)
  - http://localhost:8222 (monitoring)
```

### No changes to
- Go CCNF reference (separate integration path)
- vision (losm) packages (separate NATS integration)
- Angular UI (no direct NATS dependency)

**Note on Conduit MCP:** Conduit MCP has its own watcher system that monitors `.codex/` directories — it does not directly consume cascade's `events/` directory. The integration point between cascade and Conduit is via `WorkRequest` types and the MCP tools (`save_prompt`, `create_plan`, etc.), which cascade invokes. A future NATS subscriber on the Conduit side could replace direct MCP tool calls with event-driven dispatch, but this is out of scope for this plan.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| NATS server not available in dev | Graceful fallback to file I/O (Phase 1-2). Phase 3+ requires NATS. |
| nats-py async vs existing sync code | Phase 1 uses thread-safe publish queue + background NATS sidecar thread (no async conversion needed). Phase 3+ rewrites handlers as native async. |
| Event schema drift between file and NATS | Both use same `write_event()` function — single code path for serialization. |
| Duplicate execution in distributed workers | Claim/lease protocol (Phase 4). Until then, single-worker is safe. |
| JetStream disk usage | Retention policy (30-day max_age). Purging old workflow data. |
| Offsets retirement breaks idempotency | Event ID deduplication in-memory per worker run. JetStream consumer tracks delivered messages. |
| Subprocess failure isolation lost in async model | Phase 1 preserves subprocess model with NATS sidecar. Phase 3+ uses per-handler try/except with graceful degradation. |
| Artifacts not in NATS payloads (size) | Small artifacts (<1MB) embedded in completion events. Large artifacts (patches, compiled specs) stored in shared object store path referenced in event. |

---

## 12. What This Plan Does NOT Cover

- **Go CCNF verification in the NATS path:** This is a separate integration — CCNF sits between semantic and operational layers, but is not required for Phase 1-4 cascade NATS integration. CCNF integration is a follow-on plan.
- **vision (losm) NATS integration:** vision needs its own NATS plan, following voyager's pattern.
- **Conduit MCP → NATS subscriber:** Conduit currently reads cascade events from files. Switching it to NATS subscriber is a separate task.
- **Authentication/ACLs:** NATS auth is deferred. All subjects are open in dev.
- **html-importer → WorkflowIntent bridge:** Schema defined here, implementation is separate.
