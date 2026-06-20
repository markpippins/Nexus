"""End-to-end integration tests for the full Phase 1 pipeline.

Exercises all 6 stations from prompt → CER log → replay state.
"""

import json
import subprocess
import sys
from pathlib import Path

from meep.pipeline import run_pipeline, run_and_replay
from meep.models import CERLog, ExecutionGraph, FrozenGraphError
from meep.irl_classifier import classify
from meep.ir_resolver import resolve
from meep.spec_compiler import compile_selection
from meep.lowering_pass import lower, lower_with_timestamp
from meep.scheduler import schedule
from meep.replay_engine import replay

MEEP_DIR = Path(__file__).resolve().parent.parent
MEEP_PARENT = MEEP_DIR.parent


# ── Acceptance: CLI produces valid CER log ────────────────────────────


def test_cli_produces_cer_log():
    """echo 'fix the bug' | python -m meep.cli produces JSON output."""
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli", "fix the bug"],
        capture_output=True, text=True, cwd=MEEP_PARENT,
    )
    assert result.returncode == 0
    assert result.stdout.strip().startswith("["), "Output should be a JSON array"
    events = json.loads(result.stdout)
    assert len(events) > 0
    for event in events:
        assert "event_id" in event
        assert "event_type" in event
        assert "prev_event_hash" in event


def test_cli_with_output_flag():
    """--output flag writes CER log to file."""
    tmp = "/tmp/meep-test-cli-output.json"
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli", "audit the database", "--output", tmp],
        capture_output=True, text=True, cwd=MEEP_PARENT,
    )
    assert result.returncode == 0
    content = Path(tmp).read_text()
    events = json.loads(content)
    assert len(events) > 0


def test_cli_replay_flag():
    """--replay flag completes without error."""
    result = subprocess.run(
        [sys.executable, "-m", "meep.cli", "build a service", "--replay"],
        capture_output=True, text=True, cwd=MEEP_PARENT,
    )
    assert result.returncode == 0


# ── Acceptance: Station 1—5 all exercised ────────────────────────────


def test_all_six_stations_exercised():
    """A single prompt exercises all stations."""
    log = run_pipeline("fix the bug")
    assert len(log) > 0

    # Station 6: replay
    state = replay(log)
    assert state.event_count == len(log)
    assert state.is_complete


def test_each_archetype_produces_valid_log():
    """Every functional archetype produces a valid, replayable CER log."""
    prompts = [
        "build a service",
        "run the pipeline",
        "why did this happen",
        "fix the bug",
        "merge the branches",
        "audit compliance",
        "summarize the log",
        "validate the input",
        "what if we tried X",
    ]
    for prompt in prompts:
        log = run_pipeline(prompt)
        assert len(log) > 0, f"Prompt {prompt!r} produced empty log"
        state = replay(log)
        assert state.is_complete, f"Prompt {prompt!r} produced incomplete state"
        assert len(state.completed_nodes) > 0


def test_reject_produces_empty_log():
    """REJECT archetype → compile_selection → lower → schedule → empty log."""
    from meep.models import IRSelection
    sel = IRSelection(archetype="REJECT", confidence=0.2)
    wg = compile_selection(sel, "anything")
    eg = lower(wg)
    log = schedule(eg)
    assert len(log) == 0


# ── Acceptance: Freeze boundary ──────────────────────────────────────


def test_freeze_boundary_stable_across_serialization():
    """ExecutionGraph hash is stable across serialization roundtrip."""
    log = run_pipeline("merge the branches")

    # Recreate the graph that was used (not exposed by pipeline directly,
    # so rebuild it)
    irl = classify("merge the branches")
    sel = resolve(irl)
    wg = compile_selection(sel, "merge the branches")
    eg = lower(wg)

    h1 = eg.content_hash()

    # Simulate serialization
    import json
    data = {
        "nodes": [
            {"id": n.id, "label": n.label, "handler": n.handler, "config": n.config}
            for n in eg.nodes
        ],
        "edges": list(eg.edges),
        "topological_order": list(eg.topological_order),
        "schema_version": eg.schema_version,
        "frozen_at": eg.frozen_at,
    }
    serialized = json.dumps(data, sort_keys=True)
    restored_data = json.loads(serialized)

    from meep.models import ExecNode
    restored = ExecutionGraph(
        nodes=[ExecNode(**n) for n in restored_data["nodes"]],
        edges=[tuple(e) for e in restored_data["edges"]],
        topological_order=restored_data["topological_order"],
        schema_version=restored_data["schema_version"],
        frozen_at=restored_data["frozen_at"],
    )
    # The restored graph has the same content but isn't frozen
    assert restored.content_hash() == h1


def test_freeze_boundary_rejects_modification():
    """After lowering, the ExecutionGraph rejects modification."""
    irl = classify("refactor the module")
    sel = resolve(irl)
    wg = compile_selection(sel, "refactor")
    eg = lower(wg)

    import pytest
    with pytest.raises(FrozenGraphError):
        eg.nodes = []


# ── Acceptance: Hash chain ────────────────────────────────────────────


def test_hash_chain_continuity():
    """Every event in the log has valid prev_event_hash chain back to genesis."""
    log = run_pipeline("fix the bug")
    for i, event in enumerate(log.events):
        if i == 0:
            assert event.prev_event_hash == "genesis"
        else:
            prev = log.events[i - 1]
            expected = _hash_event(prev)
            assert event.prev_event_hash == expected, (
                f"Hash chain broken at event {i} "
                f"(expected {expected[:16]}..., got {event.prev_event_hash[:16]}...)"
            )


# ── Acceptance: Append-only ──────────────────────────────────────────


def test_append_only_invariant():
    """Events are never modified, deleted, or reordered after creation."""
    log = run_pipeline("check compliance")
    tail_before = log.tail_hash
    count_before = len(log)
    events_before = list(log.events)

    # Verify no modification by checking hash chain
    for i, event in enumerate(log.events):
        if i == 0:
            assert event.prev_event_hash == "genesis"
        else:
            prev = log.events[i - 1]
            assert event.prev_event_hash == _hash_event(prev)

    # Verify tail hash hasn't changed (no append)
    assert log.tail_hash == tail_before
    assert len(log) == count_before

    # Verify events list content hasn't changed
    assert len(log.events) == len(events_before)


# ── Acceptance: All 6 stations individually exercised ────────────────


def test_station_1_classifier():
    """Station 1: IRL classifier produces valid distribution."""
    result = classify("fix the bug")
    assert sum(result.probabilities.values()) > 0.99
    assert result.raw_input == "fix the bug"


def test_station_2_resolver():
    """Station 2: IR resolver produces deterministic selection."""
    result = classify("fix the bug")
    sel = resolve(result)
    assert sel.archetype != "REJECT"
    assert sel.confidence >= 0.4


def test_station_3_compiler():
    """Station 3: Spec compiler produces nodes for REVISION."""
    result = classify("fix the bug")
    sel = resolve(result)
    wg = compile_selection(sel, "fix the bug")
    assert len(wg.nodes) >= 1
    for node in wg.nodes:
        assert node.archetype == sel.archetype


def test_station_4_lowering():
    """Station 4: Lowering produces frozen graph with resolved handlers."""
    result = classify("build a service")
    sel = resolve(result)
    wg = compile_selection(sel, "build a service")
    eg = lower(wg)
    assert eg._frozen
    assert all(n.handler.endswith("_handler") for n in eg.nodes)
    assert len(eg.topological_order) == len(eg.nodes)


def test_station_5_scheduler():
    """Station 5: Scheduler produces event log with hash chain."""
    result = classify("audit compliance")
    sel = resolve(result)
    wg = compile_selection(sel, "audit compliance")
    eg = lower(wg)
    log = schedule(eg)
    assert len(log) == len(eg.nodes) * 2  # START + COMPLETE per node
    for i, event in enumerate(log.events):
        if i == 0:
            assert event.prev_event_hash == "genesis"


def test_station_6_replay():
    """Station 6: Replay reconstructs correct ExecutionState."""
    log = run_pipeline("summarize the output")
    state = replay(log)
    assert state.event_count == len(log)
    # Every node should have been completed
    for node_id, node_state in state.node_states.items():
        assert node_state in ("COMPLETED",), f"Node {node_id} in state {node_state}"


# ── Helpers ──────────────────────────────────────────────────────────


def _hash_event(event) -> str:
    """Replicate CERLog hash computation."""
    import hashlib
    content = json.dumps({
        "event_id": event.event_id,
        "timestamp": event.timestamp,
        "execution_id": event.execution_id,
        "node_id": event.node_id,
        "event_type": event.event_type,
        "payload": event.payload,
        "prev_event_hash": event.prev_event_hash,
    }, sort_keys=True)
    return hashlib.sha256(content.encode("utf-8")).hexdigest()
