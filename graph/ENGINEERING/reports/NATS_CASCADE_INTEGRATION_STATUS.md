# NATS / Cascade Integration Status

**Date:** 2026-06-16
**Assessment:** What's planned vs. what's implemented for NATS transport in the cascade pipeline.

---

## 1. Bottom Line

**NATS integration with cascade is a written plan — not implemented.** The plan document
(`NATS_INTEGRATION_PLAN.md`) is detailed and well-structured (12 sections, 4 phases),
but the actual code files it describes (`nats_publisher.py`, `nats_subscriber.py`)
**do not exist**.

Voyager already has production NATS code. Cascade uses filesystem-based transport
(`events/` and `offsets/` directories, sequential subprocess calls from `main.py`).

---

## 2. What Exists (Implemented)

### 2.1 Voyager — NATS Publisher (Working)

| File | Status |
|---|---|
| `nexus/python/voyager/src/fs_crawler_v2/publisher.py` | ✅ Real code |
| `nexus/python/voyager/src/main.py` | ✅ `--nats` CLI flag |

```python
# Actual running code in voyager
class Publisher:
    def __init__(self, nats_url=None, origin_layer=None)
    async def connect(self)             # nats-py connect
    async def publish(subject, event)   # publish + fallback to logging
    def scoped(layer) -> Publisher      # shared connection, different layer
    async def close()
```

- Uses `nats-py` (async)
- Subject pattern: `nexus.fs.v1.>`
- CER envelope with `origin_layer`, `epoch_id`, `source_event_ids`
- Graceful fallback to logging when NATS unavailable
- CLI entry: `python -m voyager --nats nats://localhost:4222`

### 2.2 Other NATS Dependencies

| Component | NATS Status |
|---|---|
| `nexus/jvm/spring/service-broker/losm-host-service/pom.xml` | ✅ `jnats` + `nats-spring` dependencies |
| `nexus/moleculer/search/package.json` | ✅ `"cli": "moleculer connect NATS"` |

---

## 3. What's Planned (Not Implemented)

### 3.1 Plan Document

| File | Status |
|---|---|
| `nexus/python/cascade/NATS_INTEGRATION_PLAN.md` | 📋 Draft plan — June 16, 2026 |
| `nexus/python/cascade/nats_publisher.py` | ❌ Does not exist |
| `nexus/python/cascade/nats_subscriber.py` | ❌ Does not exist |

The plan describes these files with full code examples, but none have been created.

### 3.2 Cascade's Current Architecture (Filesystem Only)

```
main.py
  └─ while True (every 2s):
       ├─ architect_agent.py  — reads IdeaCaptured from events/, writes WorkflowPlanned
       ├─ dispatcher.py       — reads StepRequested from events/, routes to handlers
       └─ update_tasks.py     — reads events, updates projections
```

- **Transport:** Local filesystem (`events/` directory, `offsets/` directory)
- **State tracking:** Local offset files (`offsets/architect`, `offsets/dispatcher`)
- **Concurrency:** Sequential subprocess calls (failure isolation)
- **LLM integration:** Direct Ollama calls (`agents/llm.py`)

---

## 4. Phase Breakdown (from the Plan)

| Phase | Name | Effort | Risk | Status |
|---|---|---|---|---|
| 1 | Dual-Write Bridge (File + NATS) | 1-2 days | Low | ❌ Not started |
| 2 | File Consumer → NATS Subscriber | 2-3 days | Medium | ❌ Not started |
| 3 | File Polling Retirement + JetStream | 3-4 days | Medium | ❌ Not started |
| 4 | Distributed Workers (Claim/Lease) | 4-5 days | High | ❌ Not started |
| — | WorkflowIntent Bridge | 2-3 days | Medium | ❌ Not started |

### Phase 1: Dual-Write Bridge
- Add `nats_publisher.py` (copy voyager's Publisher pattern)
- Add NATS sidecar thread to `main.py` (preserves subprocess isolation)
- Add `enqueue_publish()` calls in `dispatcher.py`
- **Required dependency:** `nats-py>=0.8.0` (not yet added to cascade's requirements)

### Phase 2: NATS Subscriber
- Add `nats_subscriber.py` (class `CascadeSubscriber`)
- Architect agent subscribes to `nexus.cascade.v1.workflow.idea_captured`
- Dispatcher subscribes to `nexus.cascade.v1.workflow.step_requested`
- Retire `offsets/` directory — NATS handles delivery and deduplication

### Phase 3: File Polling Retirement + JetStream
- `events/` directory becomes optional (`--events-dir` fallback flag)
- JetStream stream `CASCADE_WORKFLOW` with 30-day retention
- Projection consumer replaces `update_tasks.py` polling
- Small artifacts embedded in events, large artifacts in shared object store

### Phase 4: Distributed Workers
- Multiple cascade workers with NATS claim/lease (JetStream KV-backed)
- Health heartbeats on `nexus.cascade.v1.control.health`
- Stalled claim timeout: 5 minutes
- Zero shared filesystem state

### WorkflowIntent Bridge (Parallel)
- Schema: `nexus/.agent/schema/workflow_intent.schema.json`
- Python: `nexus/python/cascade/workflow_intent.py`
- Bridge: `nexus/python/ingest/html-importer/workflow_intent_bridge.py`
- Flow: html-importer → SemanticDistillation → WorkflowIntent → NATS → cascade

---

## 5. NATS Subject Hierarchy (Planned)

```
nexus.cascade.v1.workflow.>        # Workflow lifecycle events
  .idea_captured
  .workflow_planned
  .step_requested
  .step_approved
  .step_rejected
  .step_completed.{step_name}
  .kernel_panic

nexus.cascade.v1.control.>         # Control-plane
  .claim
  .claim_ack
  .health

nexus.ingest.v1.>                  # html-importer → cascade
nexus.fs.v1.>                      # voyager → all (EXISTING)
nexus.vision.v1.>                  # vision → cascade
nexus.ccnf.v1.>                    # Go CCNF → future
```

---

## 6. Cross-Subsystem Producer/Consumer Map (Current + Planned)

| Producer | Subject | Consumers | Status |
|---|---|---|---|
| voyager | `nexus.fs.v1.observation` | topology, identity, cascade | ✅ Live |
| voyager | `nexus.fs.v1.metadata_span` | vision (losm) | ✅ Live |
| html-importer | `nexus.ingest.v1.workflow_intent` | cascade | ❌ Planned |
| cascade | `nexus.cascade.v1.workflow.>` | Conduit MCP, vision, audit | ❌ Planned |
| vision | `nexus.vision.v1.requirement_candidate` | WRP, cascade | ❌ Planned |

---

## 7. Risks & Prerequisites

| Item | Status |
|---|---|
| NATS server running | ❓ Unknown — needs verification |
| `nats-py` installed in cascade venv | ❌ Not added yet |
| `nats-py` in voyager venv | ✅ Already present |
| JetStream enabled | ❓ Unknown — Phase 3 dependency |
| Go CCNF integration path | ❌ Separate plan, not part of this scope |
| Conduit MCP → NATS subscriber | ❌ Out of scope — Conduit currently reads files |
| Auth/ACLs | ❌ Deferred — all subjects open in dev |

---

## 8. Recommendations

1. **Verify NATS server availability** — `nats-server --version` and `curl http://localhost:8222`
2. **Install `nats-py`** in cascade's environment (follows voyager's pattern)
3. **Implement Phase 1 first** — lowest risk, non-breaking, validates the NATS transport
4. **Test cascade with NATS sidecar** — verify events appear on subjects via `nats sub`
5. **Don't start Phase 2 before Phase 1 is stable** — the plan's go/no-go gates are sensible
