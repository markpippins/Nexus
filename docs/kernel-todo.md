# WRP Kernel Phase 2 — Done (2026-06-28)

## What was built

### Architecture Decision (2026-07-04): in-process, no HTTP layer

The wrp-kernel was previously framed as a FastAPI service on port 3102 with HTTP delta ingestion. **It is now an in-process Python library** at `python/conduit/wrp_kernel/`. The bridge daemon (`python/conduit/bridge/daemon.py` → `bridge/sync/syncer.py`) imports `wrp_kernel.engine.KernelEngine` and calls `engine.reduce(delta)` directly — no HTTP boundary, no `POST /delta/`, no port binding. The endpoints listed below are therefore **aspirational, not running**. If/when wrp-kernel is re-introduced as a service, those endpoints describe the boundary.

For the live status of the kernel as of 2026-07-04, see `python/conduit/wrp_kernel/engine.py` (5-step reduce), `python/conduit/bridge/daemon.py` (in-process caller), `nexus/audit/WRP_PIPELINE_FLOW.md` (reconciled diagram), and `mcp_server_standalone_discrepancies` in `nexus/graph/nexus-knowledge-graph.json` (canonical note).

>Aspirational HTTP boundary (NOT in use):
- ~~**POST /delta/**~~ — ingest a KernelDelta, runs the 5-step reduce pipeline,
  persists to PG, returns new kernel version
- ~~**GET /delta/state**~~ — summary of current kernel state
- ~~**GET /state/**~~ — full kernel state (summary or full view)
- ~~**GET /state/health**~~ — health check
- ~~**GET /state/lineage**~~ — lineage event history from PG
- ~~**GET /replay/**~~ — KSRA reconstruction at any version
- **GET /replay/compare** — compare live engine vs replay (integrity check)

### Storage Layer (PostgreSQL via SQLAlchemy)
- `app/storage/delta_store.py` — KernelDelta persistence (JSONB, merge semantics)
- `app/storage/snapshot_store.py` — KernelSnapshot checkpoints
- `app/storage/lineage_store.py` — lineage event log (append-only)

### Service Layer
- `app/services/reducer_service.py` — orchestration: persist → reduce → lineage → snapshot
- `app/services/replay_service.py` — KSRA: Snapshot(K) + Replay(deltas K+1 → N)

### CLI Tools
- `cli/replay.py` — reconstruct KernelState at any version
- `cli/ingest.py` — POST a KernelDelta JSON file to the kernel API

### Infrastructure
- `docker-compose.yml` — kernel-api + postgres
- `Dockerfile.kernel` — container for the kernel API
- `examples/sample-delta.json` — test payload
- `schema.sql` — already has kernel_delta_log, kernel_snapshot, lineage_log tables

## Design

The kernel implements Option A from the KERNEL_OPTIONS.md analysis:
- WRP Kernel Engine = pure in-memory state machine (wrp_kernel/)
- Persistence = PostgreSQL (app/storage/ + app/models/)
- Routes are thin — orchestration is in reducer_service.py

## Verification
- All 83 wrp_kernel unit tests pass
- All module imports verified with CONDUIT_PG_DSN
- All 11 FastAPI routes registered
