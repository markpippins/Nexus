"""Tests for ArbitrationEngine — weighted scoring and argmax selection."""

import pytest

from ir.arbitration_engine import ArbitrationEngine


# ── helpers ──────────────────────────────────────────────────────────

def _make_lease(lease_id="lease-001", caps=None):
    class MockLease:
        pass
    l = MockLease()
    l.lease_id = lease_id
    l.status = "PENDING"
    l.capabilities = set(caps or [])
    return l


def _make_event(event_id="evt-001", priority=0.5, required_capabilities=None):
    class MockEvent:
        pass
    e = MockEvent()
    e.event_id = event_id
    e.priority = priority
    e.required_capabilities = required_capabilities or []
    return e


# ── capability_fit ─────────────────────────────────────────────────

class TestCapabilityFit:
    def test_full_match(self):
        engine = ArbitrationEngine()
        lease = _make_lease(caps={"execute", "read", "write"})
        event = _make_event(required_capabilities=["execute", "read"])
        assert engine.capability_fit(lease, event) == 1.0

    def test_partial_match(self):
        engine = ArbitrationEngine()
        lease = _make_lease(caps={"execute"})
        event = _make_event(required_capabilities=["execute", "read"])
        assert engine.capability_fit(lease, event) == 0.5

    def test_no_match(self):
        engine = ArbitrationEngine()
        lease = _make_lease(caps={"execute"})
        event = _make_event(required_capabilities=["read"])
        assert engine.capability_fit(lease, event) == 0.0

    def test_no_required_caps_any_lease_works(self):
        engine = ArbitrationEngine()
        lease = _make_lease(caps=set())
        event = _make_event(required_capabilities=[])
        assert engine.capability_fit(lease, event) == 1.0

    def test_required_but_no_lease_caps(self):
        engine = ArbitrationEngine()
        lease = _make_lease(caps=set())
        event = _make_event(required_capabilities=["execute"])
        assert engine.capability_fit(lease, event) == 0.0


# ── scoring ─────────────────────────────────────────────────────────

class TestScoring:
    def test_score_formula(self):
        engine = ArbitrationEngine(alpha=0.5, beta=0.3, gamma=0.2)
        lease = _make_lease(caps={"execute"})
        event = _make_event(priority=0.8, required_capabilities=["execute"])
        load = 0.0
        score = engine.score(lease, event, load)
        expected = 0.5 * 1.0 + 0.3 * 1.0 + 0.2 * 0.8
        assert score == pytest.approx(expected, 0.01)

    def test_score_with_load_penalty(self):
        engine = ArbitrationEngine(alpha=0.5, beta=0.3, gamma=0.2)
        lease = _make_lease(caps={"execute"})
        event = _make_event(priority=0.5, required_capabilities=["execute"])
        idle_score = engine.score(lease, event, load=0.0)
        loaded_score = engine.score(lease, event, load=1.0)
        assert idle_score > loaded_score


# ── selection ───────────────────────────────────────────────────────

class TestSelection:
    def test_select_returns_highest_scorer(self):
        engine = ArbitrationEngine(alpha=0.5, beta=0.3, gamma=0.2)
        good = _make_lease("good", caps={"execute", "read"})
        bad = _make_lease("bad", caps=set())
        event = _make_event(required_capabilities=["execute"])
        selected = engine.select([good, bad], event)
        assert selected.lease_id == "good"

    def test_select_returns_none_for_empty_list(self):
        engine = ArbitrationEngine()
        selected = engine.select([], _make_event())
        assert selected is None

    def test_select_argmax_first_wins_ties(self):
        engine = ArbitrationEngine(alpha=0.0, beta=0.0, gamma=0.0)
        a = _make_lease("a")
        b = _make_lease("b")
        selected = engine.select([a, b], _make_event())
        assert selected.lease_id == "a"  # first wins

    def test_select_with_load(self):
        engine = ArbitrationEngine(alpha=0.0, beta=1.0, gamma=0.0)
        a = _make_lease("a")
        b = _make_lease("b")
        class MockSlot:
            pass
        sa = MockSlot()
        sa.lease = a
        sa.load = 1.0
        sb = MockSlot()
        sb.lease = b
        sb.load = 0.0
        best, score = engine.select_with_load([sa, sb], _make_event())
        assert best.lease_id == "b"
