"""test_conformance_failure_visibility.py — T19 item 5 conformance.

Proves the canonical failure-event contract: each of the five failure
classes (admission / bridge_delivery / receipt / watchdog / queue) maps to
its canonical subject (``<class>.failed`` / dead-letter), and the envelope
carries the failure_class, error, and aggregate identity so the failure is
observable on the same NATS namespace as the success path.

Usage::

    cd /home/codex/dev/nexus/python/cascade
    python3 -m pytest test_conformance_failure_visibility.py -v
"""

import os
import sys

_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

from nats_publisher import (  # noqa: E402
    FAILURE_EVENTS,
    build_failure_envelope,
    publish_failure_event,
)

EXPECTED_SUBJECTS = {
    "admission": "nexus.kernel.v1.transition.admission.failed",
    "bridge_delivery": "nexus.kernel.v1.transition.bridge_delivery.failed",
    "receipt": "nexus.kernel.v1.transition.receipt.failed",
    "watchdog": "nexus.kernel.v1.transition.watchdog.refused",
    "queue": "nexus.kernel.v1.failure.dead_letter",
}


def test_failure_subject_map_is_complete():
    for cls in EXPECTED_SUBJECTS:
        assert cls in FAILURE_EVENTS, f"missing failure class {cls}"


def test_every_failure_class_maps_to_canonical_subject():
    for cls, subject in EXPECTED_SUBJECTS.items():
        subj, env = build_failure_envelope(cls, "boom", aggregate_id="wr-1")
        assert subj == subject, f"{cls} subject mismatch: {subj} != {subject}"
        assert env.event_type, f"{cls} envelope missing event_type"


def test_envelope_carries_failure_identity():
    subj, env = build_failure_envelope(
        "admission",
        "kaboom",
        aggregate_id="wr-abc",
        correlation_id="wr-abc",
        causation_id="evt-1",
    )
    assert env.correlation_id == "wr-abc"
    assert env.causation_id == "evt-1"
    assert env.payload["failure_class"] == "admission"
    assert env.payload["error"] == "kaboom"
    assert env.payload["aggregate_id"] == "wr-abc"
    assert env.classification.value == "internal"


def test_error_is_truncated_to_bounded_length():
    subj, env = build_failure_envelope("queue", "x" * 5000, aggregate_id="wr-1")
    assert len(env.payload["error"]) <= 2000


def test_publish_failure_event_is_best_effort():
    # Without a running sidecar/NATS, publish_failure_event must not raise —
    # enqueue is best-effort and the sidecar falls back to logging.
    publish_failure_event("queue", "dropped", aggregate_id="wr-1")
    publish_failure_event("watchdog", "refused", aggregate_id="wr-1")
