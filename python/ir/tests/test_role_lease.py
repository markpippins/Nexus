"""Tests for RL-IR RoleLease, RoleDefinition, CapabilitySet."""

import pytest
from dataclasses import FrozenInstanceError

from ir.role_lease import (
    RoleLease, RoleDefinition, CapabilitySet, LeaseStatus,
    ExecutionContext, LifecycleModel, TerminationSpec, ObservabilitySpec,
    LeaseResult, NoopHarness,
)


class TestCapabilitySet:
    def test_create(self):
        cs = CapabilitySet.of("read", "write")
        assert "read" in cs
        assert "write" in cs
        assert "delete" not in cs

    def test_union(self):
        a = CapabilitySet.of("read")
        b = CapabilitySet.of("write")
        c = a.union(b)
        assert "read" in c and "write" in c

    def test_intersection(self):
        a = CapabilitySet.of("read", "write")
        b = CapabilitySet.of("read", "delete")
        c = a.intersection(b)
        assert "read" in c
        assert "write" not in c

    def test_difference(self):
        a = CapabilitySet.of("read", "write", "delete")
        b = CapabilitySet.of("delete")
        c = a.difference(b)
        assert "read" in c and "write" in c
        assert "delete" not in c

    def test_has(self):
        cs = CapabilitySet.of("execute")
        assert cs.has("execute")
        assert not cs.has("audit")

    def test_iter(self):
        cs = CapabilitySet.of("a", "b", "c")
        assert set(cs) == {"a", "b", "c"}


class TestRoleLease:
    def test_default_lease(self):
        rl = RoleLease()
        assert rl.status == LeaseStatus.PENDING
        assert rl.role.role_name == "unknown"

    def test_with_role(self):
        role = RoleDefinition(role_name="builder", default_capabilities={"read", "write"})
        rl = RoleLease(role=role, capabilities=CapabilitySet.of("read", "write"))
        assert rl.role.role_name == "builder"

    def test_frozen_no_mutation(self):
        rl = RoleLease()
        with pytest.raises(FrozenInstanceError):
            rl.status = LeaseStatus.ACTIVE  # type: ignore[misc]

    def test_serialization_roundtrip(self):
        role = RoleDefinition(role_name="architect")
        rl = RoleLease(
            role=role,
            capabilities=CapabilitySet.of("audit"),
            execution=ExecutionContext(harness="noop"),
        )
        d = rl.to_dict()
        rl2 = RoleLease.from_dict(d)
        assert rl2.role.role_name == "architect"
        assert rl2.execution.harness == "noop"

    def test_noop_harness(self):
        harness = NoopHarness()
        lease = RoleLease()
        result = harness.execute(lease, None)
        assert result.status == LeaseStatus.COMPLETED
        assert result.output == {"placeholder": True}
