"""Tests for TEM-IR TimeModel."""

import pytest
from datetime import datetime, timezone

from ir.time_model import TimeModel


class TestTimeModel:
    """TimeModel creation, immutability, with_lease_time."""

    def test_default_model(self):
        tm = TimeModel()
        assert tm.event_time is not None
        assert tm.lease_time is None
        assert tm.causal_epoch == 0

    def test_explicit_fields(self):
        t = datetime(2026, 1, 1, tzinfo=timezone.utc)
        tm = TimeModel(event_time=t, causal_epoch=5)
        assert tm.event_time == t
        assert tm.causal_epoch == 5

    def test_with_lease_time(self):
        t1 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        t2 = datetime(2026, 1, 1, 1, 0, 0, tzinfo=timezone.utc)
        tm = TimeModel(event_time=t1, causal_epoch=3)
        tm2 = tm.with_lease_time(t2)

        assert tm.lease_time is None  # original unchanged
        assert tm2.lease_time == t2   # new has lease_time
        assert tm2.event_time == t1   # preserved
        assert tm2.causal_epoch == 3  # preserved

    def test_frozen_no_mutation(self):
        from dataclasses import FrozenInstanceError
        tm = TimeModel()
        with pytest.raises(FrozenInstanceError):
            tm.causal_epoch = 10  # type: ignore[misc]

    def test_serialization_roundtrip(self):
        t = datetime(2026, 6, 28, 12, 0, 0, tzinfo=timezone.utc)
        tm = TimeModel(event_time=t, causal_epoch=7)
        d = tm.to_dict()
        tm2 = TimeModel.from_dict(d)
        assert tm2.event_time == t
        assert tm2.lease_time is None
        assert tm2.causal_epoch == 7

    def test_serialization_with_lease_time(self):
        t1 = datetime(2026, 1, 1, tzinfo=timezone.utc)
        t2 = datetime(2026, 1, 2, tzinfo=timezone.utc)
        tm = TimeModel(event_time=t1, lease_time=t2, causal_epoch=3)
        d = tm.to_dict()
        tm2 = TimeModel.from_dict(d)
        assert tm2.lease_time == t2
