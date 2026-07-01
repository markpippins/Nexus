"""Tests for StateView projection."""

import pytest
from datetime import datetime, timezone, timedelta

from ir.state_dag import StateDAG
from ir.state_view import StateView


class TestStateView:
    """StateView projection, filtering, and boundary semantics."""

    def test_empty_dag_returns_empty_view(self):
        dag = StateDAG()
        view = StateView.project(dag, {"role": "builder", "capabilities": set()})
        assert view.visible_state == {}
        assert view.version_ids == []

    def test_basic_projection(self):
        dag = StateDAG()
        v1 = dag.mutate({"status": "started"}, source_event_id="evt-001")
        v2 = dag.mutate({"status": "completed"}, source_event_id="evt-002")

        view = StateView.project(dag, {"role": "builder", "capabilities": {"read"}})
        assert view.visible_state["status"] == "completed"
        assert len(view.version_ids) == 2
        assert v1.version_id in view.version_ids
        assert v2.version_id in view.version_ids

    def test_time_range_filter(self):
        t0 = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        t1 = datetime(2026, 1, 1, 0, 0, 1, tzinfo=timezone.utc)
        t2 = datetime(2026, 1, 1, 0, 0, 2, tzinfo=timezone.utc)
        t3 = datetime(2026, 1, 1, 0, 0, 3, tzinfo=timezone.utc)
        t4 = datetime(2026, 1, 1, 0, 0, 4, tzinfo=timezone.utc)

        dag = StateDAG()
        # Manually create versions with known timestamps
        v1 = dag.mutate({"step": 1}, source_event_id="evt-001")
        object.__setattr__(v1, "timestamp", t1)

        v2 = dag.mutate({"step": 2}, source_event_id="evt-002")
        object.__setattr__(v2, "timestamp", t2)

        v3 = dag.mutate({"step": 3}, source_event_id="evt-003")
        object.__setattr__(v3, "timestamp", t3)

        # Only versions t2 and later
        view = StateView.project(dag, {"role": "architect"}, time_range=(t2, t4))
        assert "step" in view.visible_state

        # Versions before t2 should be in boundary or excluded
        for vid in view.version_ids:
            v = dag.get_version(vid)
            assert v is not None
            assert v.timestamp >= t2

    def test_causal_depth_limit(self):
        dag = StateDAG()
        dag.mutate({"layer": 1}, source_event_id="e1")
        dag.mutate({"layer": 2}, source_event_id="e2")
        dag.mutate({"layer": 3}, source_event_id="e3")
        dag.mutate({"layer": 4}, source_event_id="e4")

        view = StateView.project(dag, {"role": "builder"}, causal_depth=1)
        # With depth=1, only the head version(s) should be included
        assert len(view.version_ids) == 1
        assert dag.get_version(view.version_ids[0]).data.get("layer") == 4

    def test_lease_spec_preserved(self):
        dag = StateDAG()
        dag.mutate({"x": 1})
        lease_spec = {"role": "inspector", "capabilities": {"audit"}}
        view = StateView.project(dag, lease_spec)
        assert view.lease_spec == lease_spec

    def test_branching_projection(self):
        """Projecting a branched DAG should include both branches."""
        dag = StateDAG()
        v1 = dag.mutate({"base": True}, source_event_id="e1")

        # Branch A
        v2a = dag.mutate({"branch": "a"}, heads=[v1.version_id])
        # Branch B
        v2b = dag.mutate({"branch": "b"}, heads=[v1.version_id])

        view = StateView.project(dag, {"role": "builder"})
        assert "base" in view.visible_state
        assert "branch" in view.visible_state
        # Both heads should be included
        assert v2a.version_id in view.version_ids
        assert v2b.version_id in view.version_ids

    def test_to_dict(self):
        dag = StateDAG()
        dag.mutate({"key": "value"})
        view = StateView.project(dag, {"role": "builder"})
        d = view.to_dict()
        assert "visible_state" in d
        assert "version_ids" in d
        assert "causal_boundary" in d
        assert "temporal_slice" in d
        assert "lease_spec" in d
        assert d["visible_state"]["key"] == "value"
