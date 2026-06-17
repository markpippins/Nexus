# Pipeline Triage Tool — Manual

## What It Does

Identifies the **earliest pipeline layer** where actual output diverges from
expected output. It does not fix anything — it classifies, so you know where
to look.

The pipeline is treated as a sequence of 6 checkpoints:

| Order | Layer             | Category        | Fingerprint                                   |
|-------|-------------------|-----------------|-----------------------------------------------|
| 1     | normalized_messages | PARSE         | message count, speakers, turn range           |
| 2     | graph               | GRAPH_BUILDER  | node count, edge count, concept count, ...    |
| 3     | trajectories        | TRAJECTORY     | trajectory count, per-state breakdown         |
| 4     | semantic_projection | PROJECTION     | resolved_concepts count, resolve_edges count  |
| 5     | graph_state         | REPLAY         | node count, edge count, hash                  |
| 6     | ccnf_hash           | CCNF           | hash, hash_prefix                             |

A failure belongs to the **first checkpoint** where outputs stop matching.

---

## Quick Start

### 1. Capturing a Snapshot During a Run

In your test or harness code, call `capture_snapshot` after each pipeline
phase passes:

```python
from triage import capture_snapshot, save_snapshot

# After parse:
snap = capture_snapshot(
    transcript_id="transcript_001",
    normalized_messages=parsed_messages,
)
save_snapshot(snap, "snapshots/transcript_001_after_parse.json")

# After graph build:
snap = capture_snapshot(
    transcript_id="transcript_001",
    normalized_messages=parsed_messages,
    graph=conversation_graph,
)
save_snapshot(snap, "snapshots/transcript_001_after_graph.json")

# ... repeat for later phases
```

The snapshot only holds fingerprints (counts, hashes), not full objects, so
snapshots are small and serializable.

### 2. Capturing a Complete Snapshot (all layers)

When you have every pipeline stage available:

```python
snap = capture_snapshot(
    transcript_id="transcript_001",
    normalized_messages=parsed_messages,
    graph=conversation_graph,
    semantic_projection=projection,
    graph_state=replay_result,
    ccnf_hash=replay_result.ccnf_hash(),
)
save_snapshot(snap, "snapshots/transcript_001_golden.json")
```

### 3. Triaging a Failure

Compare an actual run against a golden snapshot:

```python
from triage import load_snapshot, triage

expected = load_snapshot("snapshots/transcript_001_golden.json")
actual   = load_snapshot("snapshots/transcript_001_failed_run.json")

report = triage(transcript_id="transcript_001", expected=expected, actual=actual)

print(report.to_text())
```

This prints:

```
============================================================
TRANSCRIPT: transcript_001
STATUS: FAIL
============================================================

ROOT CAUSE:
  Layer: graph
  Category: GRAPH_BUILDER
  Confidence: 0.92

UPSTREAM:
  normalized_messages: PASS

FAILED:
  graph
    nodes: {'expected': 42, 'actual': 39}
    edges: {'expected': 87, 'actual': 91}

DOWNSTREAM:
  trajectories: NOT_EVALUATED
  semantic_projection: NOT_EVALUATED
  graph_state: NOT_EVALUATED
  ccnf_hash: NOT_EVALUATED
```

### 4. CLI Usage

```bash
# Compare two captured snapshot files
python triage.py \
    --expected snapshots/transcript_001_golden.json \
    --actual   snapshots/transcript_001_failed.json

# Save report to file
python triage.py \
    --expected snapshots/transcript_001_golden.json \
    --actual   snapshots/transcript_001_failed.json \
    --output   reports/transcript_001_triage.yaml

# Use custom known-drifts file
python triage.py \
    --expected snapshots/transcript_001_golden.json \
    --actual   snapshots/transcript_001_failed.json \
    --known-drifts ci/custom_drifts.yaml
```

Exit code: `0` if PASS, `1` if FAIL.

---

## In-Code API

### `capture_snapshot(transcript_id, ...)` → `PipelineSnapshot`

Create a snapshot. Any slot can be `None` if that layer hasn't run yet.
`trajectories` is auto-extracted from `graph.reconstructed_trajectories`
if the graph has it, so you only need to pass `graph=`.

### `fingerprint_snapshot(snapshot)` → `Dict[str, Dict]`

Produce fingerprints for all 6 layers. Returns a dict keyed by layer name.

### `compare_layer(layer, expected_fp, actual_fp, known_drifts=None)` → `LayerDiff`

Compare one layer's fingerprints. Returns `identical`, `score`, and `details`.

### `triage(transcript_id, expected, actual, known_drifts_path=None)` → `TriageReport`

Full comparison. Walks layers in order, finds the first divergence,
classifies it, computes confidence. Returns a `TriageReport`.

### `TriageReport`

| Method      | Output                          |
|-------------|---------------------------------|
| `.to_text()`| Human-readable console output   |
| `.to_yaml()`| YAML string                     |
| `.to_dict()`| Plain dict (JSON-serializable)  |

### `save_snapshot(snapshot, path)` / `load_snapshot(path)`

Persist/restore snapshots as JSON. Only fingerprint data is saved.

### `save_report(report, path)`

Save a triage report. If `path` ends with `.yaml`/`.yml`, output is YAML;
otherwise JSON.

---

## Understanding the Report

### PASS

All layers match. `confidence` is 1.0.

### FAIL

```
root_cause:
  layer: <first failing layer>
  category: <human-readable category>

upstream:
  <layer>: PASS              # all layers before the failure

failure:
  <field>:                   # specific diverging fields
    expected: <value>
    actual: <value>

downstream:
  <layer>: NOT_EVALUATED     # not checked — failure already found
```

### Confidence Scoring

Confidence = `LAYER_WEIGHT × (0.5 + 0.5 × DOWNSTREAM_AGREEMENT_RATIO)`

- Earlier layers get higher weights (PARSE failures are most confident).
- Downstream agreement bonus: if downstream layers have the same structure
  status (both reached / both not reached), confidence increases.
- Range: 0.00–1.00.

---

## Known Drifts

Some pipeline divergences are expected and documented in
`ci/known_drifts.yaml`. These are excluded from comparison.

**Current documented drifts:**

| Layer             | Field              | Reason                                                    |
|-------------------|--------------------|-----------------------------------------------------------|
| `graph_state`     | `node_count`       | Legacy `EnvelopeInterpreter_V1` doesn't track `reintroduced_nodes` or `modified_nodes` (Plan 0015 Phase 3) |
| `graph_state`     | `edge_count`       | Same gap — edges from reintroduced/modified nodes not captured |
| `semantic_projection` | `resolved_concepts` | Legacy interpreter projects flat working set without concept resolution (Plan 0016) |

To add a drift:

```yaml
# ci/known_drifts.yaml
<layer>:
  - field: <fingerprint_key>
    expected: <value_in_expected_snapshot>
    description: "<why this difference is acceptable>"
    reference: "<plan or issue link>"
```

When comparing, if a field differs and the expected value matches the drift's
`expected`, that field is excluded from the comparison.

---

## Integrating With Tests

Pattern for regression tests:

```python
import unittest
from triage import capture_snapshot, fingerprint_snapshot, triage, save_report

class TestPipelineRegressions(unittest.TestCase):
    def setUp(self):
        # Load expected snapshot (captured from a known-good run)
        self.golden = load_snapshot("golden/transcript_001.json")

    def test_regression_no_divergence(self):
        actual = run_pipeline("fixtures/transcript_001.html")
        snap = capture_snapshot("transcript_001", **actual)
        report = triage("transcript_001", self.golden, snap)
        self.assertEqual(report.status, "PASS",
            f"Pipeline diverged at {report.root_cause}: {report.failure}")

    def test_known_drift_still_acceptable(self):
        actual = run_pipeline("fixtures/special_case.html")
        snap = capture_snapshot("special_case", **actual)
        report = triage("special_case", self.golden, snap)
        # Known drifts are auto-excluded from comparison
        self.assertEqual(report.status, "PASS",
            f"Unexpected divergence: {report.root_cause}")
```

---

## File Locations

| File | Purpose |
|------|---------|
| `triage.py` | Main module |
| `test_triage.py` | Tests (32 cases) |
| `ci/known_drifts.yaml` | Documented divergence table |

---

## Design Decisions

1. **Fingerprints, not objects** — comparing full `ConversationGraph` objects
   would be expensive and fragile. Counts and hashes are stable and cheap.
2. **First-failure wins** — once a layer fails, downstream layers are
   `NOT_EVALUATED` because they likely also differ (cascade).
3. **Known drifts are field-level** — not layer-level. A drift on `node_count`
   doesn't exempt `edge_count`.
4. **Confidence is conservative** — early layers with downstream structure
   agreement score highest. A CCNF hash mismatch with no downstream layers
   scores lowest.
