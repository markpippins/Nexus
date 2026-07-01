"""Tests for RL-IR EventProjection."""

from datetime import datetime, timezone

from ir.event_projection import EventProjection
from ir.role_lease import RoleDefinition


class FakeCausalEvent:
    def __init__(self, event_id: str, event_type: str = "NODE_START", timestamp: str | None = None):
        self.event_id = event_id
        self.event_type = event_type
        self.timestamp = timestamp or datetime.now(timezone.utc).isoformat()
        self.payload = {}


class TestEventProjection:
    def test_select_all_events(self):
        events = [
            FakeCausalEvent("e1", "NODE_START"),
            FakeCausalEvent("e2", "NODE_COMPLETE"),
        ]
        role = RoleDefinition(role_name="builder")
        proj = EventProjection.select(events, role)
        assert proj.event_count == 2

    def test_select_with_time_range(self):
        t1 = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 1, 1, 0, 0, 5, tzinfo=timezone.utc)
        t3 = datetime(2026, 1, 1, 0, 0, 10, tzinfo=timezone.utc)

        events = [
            FakeCausalEvent("e1", timestamp=t1.isoformat()),
            FakeCausalEvent("e2", timestamp=t3.isoformat()),
        ]
        role = RoleDefinition(role_name="architect")
        proj = EventProjection.select(events, role, time_range=(t1, t2))
        assert proj.event_count == 1  # only e1 in range

    def test_role_name_preserved(self):
        events = [FakeCausalEvent("e1")]
        role = RoleDefinition(role_name="inspector")
        proj = EventProjection.select(events, role)
        assert proj.role_name == "inspector"

    def test_relevance_scores(self):
        events = [
            FakeCausalEvent("e1", "NODE_START"),
            FakeCausalEvent("e2", "NODE_COMPLETE"),
        ]
        role = RoleDefinition(role_name="builder", allowed_actions=["NODE_START"])
        proj = EventProjection.select(events, role)
        assert "e1" in proj.relevance_scores
        assert "e2" in proj.relevance_scores
        assert proj.relevance_scores["e1"] == 1.0  # allowed action
