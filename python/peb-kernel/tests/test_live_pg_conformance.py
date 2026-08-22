"""Live PostgreSQL conformance tests for the PEB kernel.

These tests verify the Python ``PostgresPebStore`` against the real ``peb``
schema in PostgreSQL, exercising the same transaction boundary that the
production service uses. They cover three conformance areas required by the
cutover handoff:

1. **Idempotent replay** — the same idempotency key, replayed after a
   successful commit, must not produce a second transaction row. The UNIQUE
   constraint on ``peb.transactions.idempotency_key`` enforces this (matching
   the JVM's ``findByIdempotencyKey`` + UNIQUE column).

2. **Conflicting replay** — a *different* payload submitted under the *same*
   idempotency key must be rejected. The original transaction row must remain
   intact — no silent overwrite.

3. **Semantic disposition rejection** — when the resolution port rejects an
   execution claim (e.g. ``EVIDENCE_NOT_INDEPENDENTLY_VERIFIED``,
   ``CLAIM_DISPOSITION_REJECTED``), the transaction must be REJECTED, a
   hard ``AUTHORITY_LEAKAGE`` violation must be persisted, and the violation
   context must carry the rejection reason.

Tests are skipped when PostgreSQL is unreachable so the suite remains green
in environments without a database.
"""

from __future__ import annotations

import os
from typing import Any
from uuid import UUID, uuid4

import pytest

from peb_kernel.domain import (
    AdmissionPath,
    AdmissionResult,
    ExecutionClaimAdmission,
    PebTransaction,
    PebViolation,
)
from peb_kernel.engine import PebGovernanceEngine, PebViolationEngine
from peb_kernel.store import PostgresPebStore

try:
    import psycopg2  # noqa: F401

    _PSYCOPG_AVAILABLE = True
except ImportError:
    _PSYCOPG_AVAILABLE = False

_DSN = os.getenv(
    "PEB_DATABASE_URL",
    "postgresql://pguser:pgpass@localhost:5432/nexus",
)

# Prefix for all test-created rows so cleanup is deterministic.
_TEST_KEY_PREFIX = "conformance-test-"


def _pg_available() -> bool:
    """Return True iff the PEB PostgreSQL schema is reachable."""
    if not _PSYCOPG_AVAILABLE:
        return False
    try:
        store = PostgresPebStore(_DSN)
        health = store.health()
        return health.get("status") == "UP"
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _pg_available(), reason="PostgreSQL peb schema not reachable"
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_store() -> PostgresPebStore:
    return PostgresPebStore(_DSN)


def _unique_key(label: str = "") -> str:
    return f"{_TEST_KEY_PREFIX}{label}-{uuid4()!s}"


def _make_transaction(
    tool: str = "peb_validate_transition",
    idempotency_key: str | None = None,
    input_payload: Any | None = None,
    entity_id: str = "conformance-test-entity",
) -> PebTransaction:
    return PebTransaction(
        idempotency_key=idempotency_key or _unique_key(tool),
        entity_id=entity_id,
        tool_name=tool,
        input={} if input_payload is None else input_payload,
    )


def _count_transactions_by_key(key: str) -> int:
    """Count peb.transactions rows matching an idempotency key."""
    store = _make_store()
    conn = store._connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT count(*) FROM peb.transactions WHERE idempotency_key = %s",
            (key,),
        )
        result = cur.fetchone()
        return result[0] if result else 0
    finally:
        conn.close()


def _get_transaction_by_key(key: str) -> dict[str, Any] | None:
    """Fetch the full peb.transactions row for an idempotency key."""
    store = _make_store()
    conn = store._connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, idempotency_key, entity_id, admission_result,
                      tool_name, input, committed_at
               FROM peb.transactions WHERE idempotency_key = %s""",
            (key,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        row = tuple(row)
        return {
            "id": row[0],
            "idempotency_key": row[1],
            "entity_id": row[2],
            "admission_result": row[3],
            "tool_name": row[4],
            "input": row[5],
            "committed_at": row[6],
        }
    finally:
        conn.close()


def _count_violations_for_transaction(tx_id: str) -> int:
    store = _make_store()
    conn = store._connect()
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT count(*) FROM peb.violations WHERE transaction_id = %s",
            (str(tx_id),),
        )
        result = cur.fetchone()
        return result[0] if result else 0
    finally:
        conn.close()


def _get_violations_for_transaction(tx_id: str) -> list[dict[str, Any]]:
    store = _make_store()
    conn = store._connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT id, violation_type, severity, capability_attempted,
                      context, resolution
               FROM peb.violations WHERE transaction_id = %s""",
            (str(tx_id),),
        )
        rows = cur.fetchall()
        return [
            {
                "id": r[0],
                "violation_type": r[1],
                "severity": r[2],
                "capability_attempted": r[3],
                "context": r[4],
                "resolution": r[5],
            }
            for r in rows
        ]
    finally:
        conn.close()


def _cleanup_key(key: str) -> None:
    """Remove test-created transactions and their cascade-dependents."""
    store = _make_store()
    conn = store._connect()
    try:
        cur = conn.cursor()
        # Delete violations referencing the transaction(s) with this key.
        cur.execute(
            """DELETE FROM peb.violations
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions WHERE idempotency_key = %s
               )""",
            (key,),
        )
        # Delete decisions referencing the transaction(s).
        cur.execute(
            """DELETE FROM peb.decisions
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions WHERE idempotency_key = %s
               )""",
            (key,),
        )
        # Delete traces referencing the transaction(s).
        cur.execute(
            """DELETE FROM peb.traces
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions WHERE idempotency_key = %s
               )""",
            (key,),
        )
        # Finally delete the transaction row(s).
        cur.execute(
            "DELETE FROM peb.transactions WHERE idempotency_key = %s",
            (key,),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


@pytest.fixture(autouse=True)
def _cleanup_all_test_rows():
    """Remove any leftover conformance-test rows before and after each test."""
    # Pre-test: sweep any orphaned rows from a prior crashed run.
    store = _make_store()
    conn = store._connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """DELETE FROM peb.violations
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions
                   WHERE idempotency_key LIKE %s
               )""",
            (_TEST_KEY_PREFIX + "%",),
        )
        cur.execute(
            """DELETE FROM peb.decisions
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions
                   WHERE idempotency_key LIKE %s
               )""",
            (_TEST_KEY_PREFIX + "%",),
        )
        cur.execute(
            """DELETE FROM peb.traces
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions
                   WHERE idempotency_key LIKE %s
               )""",
            (_TEST_KEY_PREFIX + "%",),
        )
        cur.execute(
            "DELETE FROM peb.transactions WHERE idempotency_key LIKE %s",
            (_TEST_KEY_PREFIX + "%",),
        )
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()

    yield

    # Post-test: same sweep to catch rows created by this test.
    conn = store._connect()
    try:
        cur = conn.cursor()
        cur.execute(
            """DELETE FROM peb.violations
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions
                   WHERE idempotency_key LIKE %s
               )""",
            (_TEST_KEY_PREFIX + "%",),
        )
        cur.execute(
            """DELETE FROM peb.decisions
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions
                   WHERE idempotency_key LIKE %s
               )""",
            (_TEST_KEY_PREFIX + "%",),
        )
        cur.execute(
            """DELETE FROM peb.traces
               WHERE transaction_id IN (
                   SELECT id FROM peb.transactions
                   WHERE idempotency_key LIKE %s
               )""",
            (_TEST_KEY_PREFIX + "%",),
        )
        cur.execute(
            "DELETE FROM peb.transactions WHERE idempotency_key LIKE %s",
            (_TEST_KEY_PREFIX + "%",),
        )
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# 1. Idempotent replay
# ---------------------------------------------------------------------------


class TestIdempotentReplay:
    """A retried submission with the same idempotency key must not create a
    duplicate row. The UNIQUE constraint on
    ``peb.transactions.idempotency_key`` enforces this, matching the JVM's
    ``findByIdempotencyKey`` + UNIQUE column."""

    def test_first_submission_persists_one_row(self):
        """A single valid submission produces exactly one transaction row."""
        key = _unique_key("replay-first")
        store = _make_store()
        engine = PebGovernanceEngine(store)

        txn = _make_transaction(idempotency_key=key)
        response = engine.process_for_path(txn)

        assert response.admitted is True
        assert _count_transactions_by_key(key) == 1

    def test_replay_same_idempotency_key_is_rejected(self):
        """Replaying the exact same idempotency key after a successful commit
        must be rejected by the UNIQUE constraint — not silently upserted."""
        key = _unique_key("replay-dup")
        store = _make_store()
        engine = PebGovernanceEngine(store)

        first = _make_transaction(idempotency_key=key)
        engine.process_for_path(first)
        assert _count_transactions_by_key(key) == 1

        # Replay with the same key — the store must reject the duplicate.
        replay = _make_transaction(idempotency_key=key)
        with pytest.raises(Exception):
            engine.process_for_path(replay)

        # Still exactly one row — no duplicate was created.
        assert _count_transactions_by_key(key) == 1

    def test_replay_preserves_original_row(self):
        """The original transaction row must survive the rejected replay
        unchanged — no fields overwritten."""
        key = _unique_key("replay-preserve")
        store = _make_store()
        engine = PebGovernanceEngine(store)

        first = _make_transaction(idempotency_key=key)
        engine.process_for_path(first)

        original = _get_transaction_by_key(key)
        assert original is not None
        original_id = original["id"]
        original_committed_at = original["committed_at"]

        # Replay — must fail.
        replay = _make_transaction(idempotency_key=key)
        with pytest.raises(Exception):
            engine.process_for_path(replay)

        # The surviving row is still the original.
        surviving = _get_transaction_by_key(key)
        assert surviving is not None
        assert surviving["id"] == original_id
        assert surviving["committed_at"] == original_committed_at


# ---------------------------------------------------------------------------
# 2. Conflicting replay
# ---------------------------------------------------------------------------


class TestConflictingReplay:
    """A *different* payload submitted under the *same* idempotency key must
    be rejected. The original transaction row must remain intact — no silent
    overwrite of input, tool_name, or admission_result."""

    def test_different_payload_same_key_is_rejected(self):
        """Submitting a different tool_name under the same idempotency key
        must be rejected by the UNIQUE constraint."""
        key = _unique_key("conflict-tool")
        store = _make_store()
        engine = PebGovernanceEngine(store)

        first = _make_transaction(
            tool="peb_validate_transition",
            idempotency_key=key,
        )
        engine.process_for_path(first)

        # Same key, different tool — must fail.
        conflict = _make_transaction(
            tool="peb_record_decision",
            idempotency_key=key,
        )
        with pytest.raises(Exception):
            engine.process_for_path(conflict)

        # Only one row exists.
        assert _count_transactions_by_key(key) == 1

    def test_different_input_same_key_is_rejected(self):
        """Submitting a different input payload under the same idempotency key
        must be rejected. The original input JSONB must be preserved."""
        key = _unique_key("conflict-input")
        store = _make_store()
        engine = PebGovernanceEngine(store)

        first = _make_transaction(
            tool="peb_record_decision",
            idempotency_key=key,
            input_payload={"decision": "approve", "version": 1},
        )
        engine.process_for_path(first)

        original = _get_transaction_by_key(key)
        assert original is not None

        # Same key, different input — must fail.
        conflict = _make_transaction(
            tool="peb_record_decision",
            idempotency_key=key,
            input_payload={"decision": "reject", "version": 2},
        )
        with pytest.raises(Exception):
            engine.process_for_path(conflict)

        # The surviving row still has the original input.
        surviving = _get_transaction_by_key(key)
        assert surviving is not None
        assert surviving["input"] == original["input"]

    def test_conflicting_replay_preserves_admission_result(self):
        """The admission_result of the original row must not be overwritten
        by the rejected conflicting replay."""
        key = _unique_key("conflict-result")
        store = _make_store()
        engine = PebGovernanceEngine(store)

        first = _make_transaction(
            tool="peb_validate_transition",
            idempotency_key=key,
        )
        engine.process_for_path(first)

        original = _get_transaction_by_key(key)
        assert original is not None
        assert original["admission_result"] == "ALLOWED"

        # Conflicting replay — must fail.
        conflict = _make_transaction(
            tool="peb_record_decision",
            idempotency_key=key,
        )
        with pytest.raises(Exception):
            engine.process_for_path(conflict)

        # The surviving row still has ALLOWED, not overwritten.
        surviving = _get_transaction_by_key(key)
        assert surviving is not None
        assert surviving["admission_result"] == "ALLOWED"


# ---------------------------------------------------------------------------
# 3. Semantic disposition rejection
# ---------------------------------------------------------------------------


class _FakeResolutionPort:
    """In-process stand-in for the resolution admission port."""

    def __init__(self, result: ExecutionClaimAdmission) -> None:
        self.result = result
        self.transaction_id: UUID | None = None

    def admit_verified_execution_claim(
        self, peb_transaction_id: UUID | None, input: Any | None
    ) -> ExecutionClaimAdmission:
        self.transaction_id = peb_transaction_id
        return self.result


def _execution_transaction(key: str, reason: str) -> PebTransaction:
    """Build a MUTATE transaction carrying an execution-claim envelope."""
    return PebTransaction(
        idempotency_key=key,
        entity_id="conformance-claim-test",
        tool_name="peb_record_decision",
        input={
            "execution_claim": {"resolution_claim_id": str(uuid4())},
            "execution_evidence": {
                "resolution_evidence_id": str(uuid4()),
                "policy_version_hash": "sha256:abc",
                "lease_id": "lease-1",
                "grant_id": "grant-1",
                "attempt_id": "attempt-1",
            },
            # Semantic disposition is carried in the claim itself.
            "decision": reason,
        },
    )


class TestSemanticDispositionRejection:
    """When the resolution port rejects an execution claim (e.g. evidence not
    independently verified, claim disposition rejected), the PEB kernel must:

    - mark the transaction as REJECTED
    - persist a hard AUTHORITY_LEAKAGE violation
    - carry the rejection reason in the violation context
    - not lose the violation on rollback (the violation is within the same
      transaction boundary as the audit row)
    """

    def test_rejected_evidence_disposition_rejects_transaction(self):
        """EVIDENCE_NOT_INDEPENDENTLY_VERIFIED must reject the transaction and
        record an AUTHORITY_LEAKAGE violation in the live DB."""
        key = _unique_key("disp-evidence")
        store = _make_store()
        resolution = _FakeResolutionPort(
            ExecutionClaimAdmission.rejected("EVIDENCE_NOT_INDEPENDENTLY_VERIFIED")
        )
        engine = PebGovernanceEngine(
            store=store,
            resolution_claim_adapter=resolution,
        )

        txn = _execution_transaction(key, "EVIDENCE_NOT_INDEPENDENTLY_VERIFIED")
        response = engine.process_for_path(txn, AdmissionPath.MUTATE)

        assert response.admitted is False
        assert "EVIDENCE_NOT_INDEPENDENTLY_VERIFIED" in response.message

        # Transaction row exists in the DB with REJECTED.
        row = _get_transaction_by_key(key)
        assert row is not None
        assert row["admission_result"] == "REJECTED"

        # A violation was persisted for this transaction.
        violations = _get_violations_for_transaction(str(txn.id))
        assert len(violations) == 1
        v = violations[0]
        assert v["violation_type"] == "AUTHORITY_LEAKAGE"
        assert v["severity"] == "HARD"
        assert v["capability_attempted"] == "execution_claim_admission"
        assert v["resolution"] == "REJECTED"
        # The rejection reason is carried in the context JSONB.
        assert v["context"]["reason"] == "EVIDENCE_NOT_INDEPENDENTLY_VERIFIED"

    def test_claim_disposition_rejected_rejects_transaction(self):
        """CLAIM_DISPOSITION_REJECTED must reject the transaction and record
        a violation with that reason in the context."""
        key = _unique_key("disp-claim")
        store = _make_store()
        resolution = _FakeResolutionPort(
            ExecutionClaimAdmission.rejected("CLAIM_DISPOSITION_REJECTED")
        )
        engine = PebGovernanceEngine(
            store=store,
            resolution_claim_adapter=resolution,
        )

        txn = _execution_transaction(key, "CLAIM_DISPOSITION_REJECTED")
        response = engine.process_for_path(txn, AdmissionPath.MUTATE)

        assert response.admitted is False
        assert "CLAIM_DISPOSITION_REJECTED" in response.message

        row = _get_transaction_by_key(key)
        assert row is not None
        assert row["admission_result"] == "REJECTED"

        violations = _get_violations_for_transaction(str(txn.id))
        assert len(violations) == 1
        assert violations[0]["context"]["reason"] == "CLAIM_DISPOSITION_REJECTED"

    def test_missing_resolution_adapter_fails_closed_in_db(self):
        """When no resolution adapter is wired, a claim-bearing transaction
        must be rejected with RESOLUTION_ADMISSION_UNAVAILABLE, and the
        violation must be persisted in the live DB."""
        key = _unique_key("disp-missing")
        store = _make_store()
        engine = PebGovernanceEngine(
            store=store,
            resolution_claim_adapter=None,
        )

        txn = _execution_transaction(key, "RESOLUTION_ADMISSION_UNAVAILABLE")
        response = engine.process_for_path(txn, AdmissionPath.MUTATE)

        assert response.admitted is False
        assert "RESOLUTION_ADMISSION_UNAVAILABLE" in response.message

        row = _get_transaction_by_key(key)
        assert row is not None
        assert row["admission_result"] == "REJECTED"

        violations = _get_violations_for_transaction(str(txn.id))
        assert len(violations) == 1
        assert violations[0]["context"]["reason"] == "RESOLUTION_ADMISSION_UNAVAILABLE"

    def test_approved_evidence_admits_transaction_in_db(self):
        """An approved execution claim must admit the transaction and produce
        no violation rows — the positive-path control."""
        key = _unique_key("disp-approved")
        store = _make_store()
        resolution = _FakeResolutionPort(
            ExecutionClaimAdmission.admitted_claim(
                "verified Git evidence is eligible for PEB admission",
                uuid4(),
            )
        )
        engine = PebGovernanceEngine(
            store=store,
            resolution_claim_adapter=resolution,
        )

        txn = _execution_transaction(key, "approved")
        response = engine.process_for_path(txn, AdmissionPath.MUTATE)

        assert response.admitted is True

        row = _get_transaction_by_key(key)
        assert row is not None
        assert row["admission_result"] == "ALLOWED"

        # No violations on the positive path.
        violations = _get_violations_for_transaction(str(txn.id))
        assert len(violations) == 0
