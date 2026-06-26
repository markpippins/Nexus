> **Status:** Aspirational Nexus WRP architecture (inactive). The active system is **Conduit** — see [CONDUIT_STATUS.md](./CONDUIT_STATUS.md) for the full status, active system details, and the relationship between WRP specs and operational Conduit.

# CER Snapshot Engine v1

## Related Specifications

| Document | Relationship |
|---|---|
| [`CER_SPEC.md`](./CER_SPEC.md) | Canonical Event Record format — source event schema |
| [`CER_CCNF.md`](./CER_CCNF.md) | Normalization function — ensures identity stability across snapshots |
| [`CCNF_FAILURE_MODES.md`](./CCNF_FAILURE_MODES.md) | Failure mode analysis for normalization |
| [`REPLAY_ENGINE.md`](./REPLAY_ENGINE.md) | Replay Engine — snapshots are derived compression artifacts; replay is the primary reconstruction path |

## 0. Purpose

The Snapshot Engine is an independent, asynchronous subsystem that consumes the CER event log and builds materialized state snapshots at semantic boundaries. It replaces the previous checkpoint model entirely.

**Key principle**: Snapshots are derived compression artifacts of CER history, not canonical truth. They are deletable, regenerable, and MUST NOT be inputs to the CER pipeline.

## 1. System Position

```
CER Event Log (canonical truth)
    ↓
Snapshot Engine (async, independent)
    ↓
Snapshots (derived compression artifacts)
    ↓
Replay Engine (reads snapshots for fast start)
```

## 2. Trigger Model

Snapshots are NOT time-based. They are triggered by semantic boundaries:

### Condition A — Causal Depth Threshold

```
if event.causality.trace_depth > N (default 1000):
    trigger_snapshot(event.causality.causal_chain_id)
```

### Condition B — Identity Merge Event

A large collapse event detected (Rule 2 or Rule 3 merge affecting ≥ M entities, default 10):

```
if event.compression.strategy == "alias" AND entity_merge_count >= M:
    trigger_snapshot(event.causality.causal_chain_id)
```

### Condition C — Semantic Boundary Crossing

Domain changes in causal flow:

```
BOUNDARIES = [
    ("specification", "lowering"),
    ("lowering", "execution"),
    ("execution", "system"),
]

for each (from_domain, to_domain) in BOUNDARIES:
    if event_pre.domain == from_domain AND event.domain == to_domain:
        trigger_snapshot(event.causality.causal_chain_id)
```

### Condition D — Compression Ratio Trigger

```
if event_stream_size / latest_snapshot_size > threshold (default 100):
    trigger_snapshot(event.causality.causal_chain_id)
```

## 3. Snapshot Format

```json
{
  "snapshot_id": "uuid",
  "causal_chain_id": "uuid",
  "domain": "executiongraph",

  "ccnf_version": 1,
  "collapse_engine_version": 1,
  "rehydration_version": 1,

  "entity_state_index": {
    "node:EX-001": { "lifecycle_state": "SUCCEEDED", "outputs": "...", ... },
    "node:EX-002": { "lifecycle_state": "RUNNING", ... },
    "graph:EX-GLOBAL": { "edges": [...], ... }
  },

  "event_range": {
    "start_event_id": "uuid",
    "end_event_id": "uuid",
    "start_index": 0,
    "end_index": 1500
  },

  "hash_chain_anchor": {
    "start_event_hash": "SHA256 of first event in range",
    "end_event_hash": "SHA256 of last event in range",
    "global_hash": "SHA256(entity_state_index + event_range)"
  },

  "compressed_event_count": 1500,
  "created_at": 1730000000
}
```

## 4. Triple-Version Lock (Snapshot Validity)

```
snapshot_n is valid iff:
  ccnf_version(snapshot) == ccnf_version(CER_STREAM)  AND
  collapse_engine_version(snapshot) == collapse_engine_version(READ_PATH)  AND
  rehydration_version(snapshot) == rehydration_version(READ_PATH)
```

**No partial matching.** All three must match exactly. If any version differs, the snapshot MUST be regenerated from the CER event stream.

## 5. Verification Invariant

```
replay(rehydrate(CER_events[0..n])) == snapshot_n
```

This is the core invariant. The snapshot engine verifies this invariant at creation time:

```
function verify_snapshot(snapshot, cer_events, ccnf_version,
                         collapse_engine_version, rehydration_version):
    reconstructed = replay(
        rehydrate(cer_events[0:snapshot.event_range.end_index],
                  collapse_engine_version, rehydration_version),
        empty_state(),
        ccnf_version, collapse_engine_version, rehydration_version
    )
    reconstructed_hash = SHA256(reconstructed.entity_state_index)
    assert reconstructed_hash == SHA256(snapshot.entity_state_index)
    // If mismatch: snapshot creation failed, discard and retry
```

## 6. Storage Location

```
.pipeline/snapshots/
    {domain}/
        {causal_chain_id}/
            snapshot_0001.cer.json    ← materialized snapshot
            snapshot_0001.hash.json   ← hash chain anchor (redundant integrity)
            snapshot_0002.cer.json
            ...
```

### 6.1 Separation Rule

**Snapshots MUST NOT be colocated with events.** Events live at `.pipeline/events/cer/`. Snapshots live at `.pipeline/snapshots/`. They are never in the same logical store.

### 6.2 Snapshots MUST NOT Feed the CER Pipeline

```
❌ SNAPSHOT → CER Pipeline (forbidden — version leak risk)
✔ SNAPSHOT → Replay Engine (for fast start, then switch to event stream)
```

This prevents replay acceleration from leaking back into the write path.

## 7. Recovery Protocol

```
function recover(causal_chain_id, ccnf_version, collapse_engine_version, rehydration_version):
    snapshot = find_latest_valid_snapshot(causal_chain_id)

    if snapshot is None:
        // No snapshot available — full replay from start
        return replay_all_events()

    // Verify triple-version lock
    if not verify_versions(snapshot, ccnf_version, collapse_engine_version, rehydration_version):
        // Version mismatch — snapshot invalid for current engine
        return replay_all_events()

    // Verify hash chain anchor
    if not verify_hash_chain(snapshot, cer_events):
        // Corrupted snapshot — full replay
        return replay_all_events()

    // Fast start from snapshot
    state = snapshot.entity_state_index
    remaining = cer_events[snapshot.event_range.end_index + 1:]
    rehydrated = rehydrate(remaining, collapse_engine_version, rehydration_version)
    return fold(rehydrated, state)
```

## 8. Scanning Cycle

The snapshot engine runs as an independent async process:

```
loop:
    for each causal_chain_id in active_chains:
        if any_trigger_condition_met(chain_id):
            snapshot = build_snapshot(chain_id, cer_events)
            verify_snapshot(snapshot, cer_events)
            write_snapshot(snapshot)

    sleep(SCAN_INTERVAL)  // configurable
```

The engine MAY also receive explicit trigger signals:
- Causal chain completion signal (all nodes terminal)
- Validation system request (pre-validate snapshot boundary)
- Manual trigger (operator command)

## 9. Snapshot Deletion Policy

Snapshots are:
- **Deletable at any time** — no correctness impact, only performance
- **Regenerable** — `replay(rehydrate(CER_events[0..n])) == snapshot_n`
- Subject to retention policy (keep last N, keep by time, keep all)

## 10. Relationship to Replay Engine

| Aspect | Snapshot Engine | Replay Engine |
|---|---|---|
| Role | Creates snapshots | Consumes snapshots for fast start |
| Timing | Async, independent | On-demand, synchronous |
| State | Scans CER log, builds entity index | Applies events via fold |
| Output | Snapshots (persisted) | RuntimeSnapshot (in-memory) |
| Storage | Writes to `.pipeline/snapshots/` | Reads from `.pipeline/snapshots/` |

## 11. Invariants

| # | Invariant |
|---|---|
| S1 | `replay(rehydrate(CER_events[0..n])) == snapshot_n` — core verification |
| S2 | Triple-version lock: snapshot validity requires CCNF + collapse + rehydration match |
| S3 | Snapshot MUST NOT be input to CER pipeline — no write-path acceleration leak |
| S4 | Snapshots are never colocated with events — separate logical stores |
| S5 | Snapshots are deletable at any time — no correctness impact |
| S6 | Snapshots are regenerable — `replay(rehydrate(events[0..n]))` produces identical state |
