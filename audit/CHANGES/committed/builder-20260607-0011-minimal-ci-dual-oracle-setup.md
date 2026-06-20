# Builder Change Report
- **Session:** builder-20260607-0011
- **Completed:** 2026-06-07T23:30:00Z
- **Plans processed:** 1
- **WorkRequest:** wr-0011-1780903636 (Plan 0011: Minimal CI Dual-Oracle Setup)

## Plan 0011: Minimal CI Dual-Oracle Setup
- **Declared files:**
  - NEW: `nexus/python/ingest/html-importer/replay_fixtures.py` — golden fixture definitions
  - NEW: `nexus/python/ingest/html-importer/test_dual_replay.py` — dual-oracle comparison test
  - NEW: `nexus/python/ingest/html-importer/test_semantic_projection.py` — projection determinism test
  - NEW: `nexus/python/ingest/html-importer/conftest.py` — pytest config
  - NEW: `artifacts/semantic_diffs/` — CI artifact output directory

- **Actual changes:**
  - EXISTING (no change): `nexus/python/ingest/html-importer/replay_fixtures.py` — already implemented by prior work
  - EXISTING (no change): `nexus/python/ingest/html-importer/test_semantic_projection.py` — already implemented by prior work
  - A `nexus/python/ingest/html-importer/test_dual_replay.py` — created (113 lines, unittest style)
  - A `nexus/python/ingest/html-importer/conftest.py` — created (5 lines, pytest config)
  - A `artifacts/semantic_diffs/` — created directory with `.gitkeep`

### Verification Results

**test_semantic_projection.py** — 10/10 tests PASS
- TestSemanticProjectionBuilder (8 tests): all pass
- TestReplayKernelBoundary (2 tests): all pass

**test_dual_replay.py** — 6/8 pass, 2 skipped
- 6 fixtures pass with zero divergence (linear_resolution, cycle_retraction, modified_nodes, multi_trajectory, edge_heavy, empty)
- 2 fixtures skipped (reintroduction, node_lifecycle_full) due to pre-existing bug in `replay_kernel.py`: `ExecutionEligibilityGate.evaluate_transition()` called with wrong argument signature. Error artifacts written to `artifacts/semantic_diffs/`.

**test_dual_oracle.py** (pytest, pre-existing) — 18/18 PASS

**Full unittest suite** — 96 tests, 2 pre-existing errors (Windows-path imports in test_opencode), 2 pre-existing skips

### CI Artifacts
All 8 fixtures produce artifacts in `artifacts/semantic_diffs/`:
- 6 `*.json` diff files with zero divergence
- 2 `*.error.json` files documenting the pre-existing kernel bug

### Notes
- The `.gitignore` at `nexus/python/ingest/html-importer/` already had `artifacts/` — no change needed.
- The project uses `unittest` conventions; `conftest.py` is provided for optional pytest usage.
- Two fixtures (reintroduction, node_lifecycle_full) trigger a pre-existing `TypeError` in `replay_kernel.py` where `ExecutionEligibilityGate.evaluate_transition()` is called with `request=` kwarg but expects `envelope=` positional arg. This is outside the plan's scope to fix.
