"""Tests for the PEB to Keychains governed-trigger adapter."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

from peb_kernel.domain import AdmissionResult, PebTransaction
from peb_kernel.keychains import PebKeychainsAdapter


@dataclass
class _Transaction:
    id: object
    idempotency_key: str
    entity_id: str
    tool_name: str
    admission_result: AdmissionResult | None
    before_hash: str | None = None
    after_hash: str | None = None
    kernel_event_id: object | None = None
    kernel_event_type: str | None = None
    created_at: str = "2026-09-03T00:00:00+00:00"


class _Cursor:
    def __init__(self):
        self.calls = []

    def execute(self, statement, params):
        self.calls.append((statement, params))


class _Connection:
    def __init__(self):
        self._cursor = _Cursor()

    def cursor(self):
        return self._cursor


def _transaction(result: AdmissionResult | None) -> _Transaction:
    return _Transaction(
        id=uuid4(),
        idempotency_key="peb-test-key",
        entity_id="entity-1",
        tool_name="peb_record_decision",
        admission_result=result,
    )


def test_allowed_transaction_is_checkpoint_eligible():
    conn = _Connection()
    PebKeychainsAdapter().emit_transaction(conn, _transaction(AdmissionResult.ALLOWED))

    _, params = conn._cursor.calls[0]
    assert params[0] == "peb"
    assert params[2] == "peb.admission.committed"
    assert params[3] == "committed"
    assert params[-1] == "pending"
    assert "ON CONFLICT (source_namespace, source_event_id) DO NOTHING" in conn._cursor.calls[0][0]


def test_rejected_transaction_is_archived_without_checkpoint():
    conn = _Connection()
    PebKeychainsAdapter().emit_transaction(conn, _transaction(AdmissionResult.REJECTED))

    _, params = conn._cursor.calls[0]
    assert params[2] == "peb.admission.rejected"
    assert params[3] == "rejected"
    assert params[-1] == "not_applicable"


def test_routed_or_missing_outcome_is_explicitly_unknown():
    adapter = PebKeychainsAdapter()
    assert adapter._outcome(_transaction(AdmissionResult.ROUTED)) == "unknown"
    assert adapter._outcome(_transaction(None)) == "unknown"


def test_event_identity_is_stable_for_one_peb_transaction():
    tx = _transaction(AdmissionResult.ALLOWED)
    conn = _Connection()
    adapter = PebKeychainsAdapter()
    adapter.emit_transaction(conn, tx)
    adapter.emit_transaction(conn, tx)

    first = conn._cursor.calls[0][1]
    second = conn._cursor.calls[1][1]
    assert first[1] == second[1] == f"transaction:{tx.id}"
    assert first[5] == second[5] == str(tx.entity_id)


def test_postgres_style_adapter_failure_is_not_silently_swallowed():
    """The production engine must let the store transaction roll back."""
    class FailingAdapter(PebKeychainsAdapter):
        def emit_transaction(self, connection, transaction):
            raise RuntimeError("resolution outbox unavailable")

    class StoreWithConnection:
        def __init__(self):
            self.transactions = []
            self.connection = _Connection()

        def transaction(self):
            from contextlib import contextmanager

            @contextmanager
            def boundary():
                before = list(self.transactions)
                try:
                    yield
                except Exception:
                    self.transactions[:] = before
                    raise
            return boundary()

        def list_states(self):
            return []

        def latest_decision(self):
            return None

        def save_transaction(self, transaction):
            self.transactions.append(transaction)
            return transaction

        def _connection(self):
            return self.connection

    from peb_kernel.engine import PebGovernanceEngine

    store = StoreWithConnection()
    engine = PebGovernanceEngine(store, keychains_adapter=FailingAdapter())
    transaction = PebTransaction(
        idempotency_key="atomic-failure",
        entity_id="entity-1",
        tool_name="peb_record_decision",
        input={},
    )

    import pytest
    with pytest.raises(RuntimeError, match="outbox unavailable"):
        engine.process_for_path(transaction)
    assert store.transactions == []
