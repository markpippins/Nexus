"""Determinism property tests for the Phase 1 pipeline.

Verifies that every station is deterministic:
  - Same input → same output, every time
  - Freeze boundary is stable
  - Hash chain is continuous
  - Replay is idempotent
"""

import json

from meep.pipeline import run_pipeline, run_and_replay
from meep.models import ExecutionGraph, ExecNode
from meep.lowering_pass import lower_with_timestamp
from meep.irl_classifier import classify
from meep.ir_resolver import resolve
from meep.spec_compiler import compile_selection

SAMPLE_TIMESTAMP = "2026-06-20T12:00:00Z"

# A diverse set of prompts for property testing
PROMPTS = [
    "fix the bug in ServiceBroker",
    "build a new microservice",
    "why did the deployment fail",
    "audit security compliance",
    "merge the feature branch",
    "compress the log file",
    "what if we used a different algorithm",
    "sanitize user input",
    "run the test suite",
    "hello world",
]


# ── End-to-end determinism ──────────────────────────────────────────


def test_e2e_determinism_five_runs():
    """Same prompt → same CER log → same replay state across 5 runs."""
    for prompt in PROMPTS:
        logs = [run_pipeline(prompt) for _ in range(5)]

        for i in range(1, 5):
            assert len(logs[0]) == len(logs[i]), (
                f"Prompt {prompt!r}: run 0 has {len(logs[0])} events, "
                f"run {i} has {len(logs[i])}"
            )

            for j in range(len(logs[0])):
                e0 = logs[0].events[j]
                ei = logs[i].events[j]
                assert e0.event_id == ei.event_id, (
                    f"Prompt {prompt!r}, event {j}: different event_id"
                )
                assert e0.event_type == ei.event_type
                assert e0.node_id == ei.node_id
                assert e0.payload == ei.payload

        # Replay determinism
        states = [replay(log) for log in logs]
        for i in range(1, 5):
            assert states[0] == states[i], (
                f"Prompt {prompt!r}: replay state differs between runs"
            )


from meep.replay_engine import replay  # noqa: E402


# ── Freeze boundary stability ───────────────────────────────────────


def test_freeze_boundary_deterministic():
    """Same spec → same frozen graph hash (with same timestamp)."""
    for prompt in PROMPTS:
        result = classify(prompt)
        sel = resolve(result)
        wg = compile_selection(sel, prompt)

        # Lower twice with same timestamp
        g1 = lower_with_timestamp(wg, SAMPLE_TIMESTAMP)
        g2 = lower_with_timestamp(wg, SAMPLE_TIMESTAMP)

        assert g1.content_hash() == g2.content_hash(), (
            f"Prompt {prompt!r}: freeze boundary not deterministic"
        )


# ── Hash chain continuity ───────────────────────────────────────────


def test_hash_chain_continuous_all_prompts():
    """Every CER log has a valid hash chain from genesis to tail."""
    for prompt in PROMPTS:
        log = run_pipeline(prompt)
        for i, event in enumerate(log.events):
            if i == 0:
                assert event.prev_event_hash == "genesis", (
                    f"Prompt {prompt!r}: first event doesn't link to genesis"
                )
            else:
                prev = log.events[i - 1]
                expected = _hash_event(prev)
                assert event.prev_event_hash == expected, (
                    f"Prompt {prompt!r}, event {i}: hash chain broken"
                )


# ── Replay idempotence ──────────────────────────────────────────────


def test_replay_idempotent():
    """replay(log) produces same result when called repeatedly."""
    for prompt in PROMPTS:
        log = run_pipeline(prompt)
        s1 = replay(log)
        for _ in range(10):
            assert replay(log) == s1, (
                f"Prompt {prompt!r}: replay not idempotent"
            )


# ── Helpers ──────────────────────────────────────────────────────────


def _hash_event(event) -> str:
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
