"""Tests for the PEB admission authority-drift remediation (to-do de9585fa).

Covers:
- capability registry gate: declared-but-ungranted → REJECTED + violation,
  granted → ALLOWED, empty registry → behaviour unchanged;
- kernel event linkage: the engine calls record_kernel_event once per
  admission inside the store transaction.
"""

from __future__ import annotations

import unittest
from typing import Any
from uuid import uuid4

from peb_kernel.domain import (
    AdmissionPath,
    PebCapability,
    PebTransaction,
)
from peb_kernel.engine import PebGovernanceEngine
from peb_kernel.store import InMemoryPebStore


def _admission_payload(capability: str | None = None) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "idempotencyKey": f"test-{uuid4()}",
        "entityId": "test-entity",
        "toolName": "peb_validate_transition",
        "input": {"foo": "bar"},
    }
    if capability is not None:
        payload["input"]["capability_attempted"] = capability
    return payload


class KernelLinkSpyStore(InMemoryPebStore):
    """InMemory store that records record_kernel_event calls."""

    def __init__(self) -> None:
        super().__init__()
        self.kernel_event_calls = 0

    def record_kernel_event(self, transaction: PebTransaction) -> PebTransaction | None:
        self.kernel_event_calls += 1
        return transaction


class TestCapabilityGate(unittest.TestCase):
    def setUp(self) -> None:
        self.store = InMemoryPebStore()
        self.engine = PebGovernanceEngine(self.store)

    def _submit(self, capability: str | None):
        request = PebTransaction.from_payload(_admission_payload(capability))
        response = self.engine.process_for_path(request, AdmissionPath.from_tool_name(request.tool_name))
        return request, response

    def test_empty_registry_does_not_gate(self):
        _, response = self._submit("unregistered-capability")
        self.assertTrue(response.admitted, response.to_dict())

    def test_declared_ungranted_capability_denied_with_violation(self):
        with self.store.transaction():
            self.store.save_capability(PebCapability(
                entity_id="other-entity", capability="deploy.production", active=True,
            ))
        _, response = self._submit("filesystem.write")
        self.assertFalse(response.admitted)
        self.assertEqual(len(self.store._violations), 1)
        violation = next(iter(self.store._violations.values()))
        self.assertIn("CAPABILITY_NOT_GRANTED", str(violation.context.get("reason")))

    def test_declared_granted_capability_allowed(self):
        with self.store.transaction():
            self.store.save_capability(PebCapability(
                entity_id="test-entity", capability="filesystem.write", active=True,
            ))
        _, response = self._submit("filesystem.write")
        self.assertTrue(response.admitted, response.to_dict())

    def test_inactive_capability_does_not_grant(self):
        with self.store.transaction():
            self.store.save_capability(PebCapability(
                entity_id="test-entity", capability="filesystem.write", active=False,
            ))
        _, response = self._submit("filesystem.write")
        self.assertFalse(response.admitted)


class TestKernelEventLinkage(unittest.TestCase):
    def test_engine_records_kernel_event_per_admission(self):
        store = KernelLinkSpyStore()
        engine = PebGovernanceEngine(store)
        request = PebTransaction.from_payload(_admission_payload())
        engine.process_for_path(request, AdmissionPath.from_tool_name(request.tool_name))
        self.assertEqual(store.kernel_event_calls, 1)
        # The persisted transaction should carry linkage when the store sets it.


if __name__ == "__main__":
    unittest.main()
