"""PEB persistence adapters.

The in-memory store is deterministic and is used by unit tests. The PostgreSQL
store targets the schema created by the Java kernel migrations and keeps the
engine's audit and violation writes in one database transaction.
"""

from __future__ import annotations

from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime
import os
from threading import RLock, local
from typing import Any, Iterator
from uuid import UUID, uuid4

from .domain import (
    DecisionStatus,
    EntropyClass,
    PebCapability,
    PebDecision,
    PebState,
    PebTrace,
    PebTransaction,
    PebViolation,
    ViolationResolution,
    ViolationSeverity,
    ViolationType,
    utc_now,
)


class InMemoryPebStore:
    """Thread-safe store with rollback semantics matching the engine boundary."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._transactions: dict[UUID, PebTransaction] = {}
        self._violations: dict[UUID, PebViolation] = {}
        self._states: dict[str, PebState] = {}
        self._decisions: dict[UUID, PebDecision] = {}
        self._traces: dict[UUID, PebTrace] = {}
        self._capabilities: dict[UUID, PebCapability] = {}

    @contextmanager
    def transaction(self) -> Iterator[None]:
        with self._lock:
            snapshot = (
                deepcopy(self._transactions), deepcopy(self._violations), deepcopy(self._states),
                deepcopy(self._decisions), deepcopy(self._traces), deepcopy(self._capabilities),
            )
            try:
                yield
            except Exception:
                (
                    self._transactions, self._violations, self._states,
                    self._decisions, self._traces, self._capabilities,
                ) = snapshot
                raise

    def save_transaction(self, transaction: PebTransaction) -> PebTransaction:
        transaction.on_create()
        existing = next(
            (item for item in self._transactions.values() if item.idempotency_key == transaction.idempotency_key),
            None,
        )
        if existing is not None and existing.id != transaction.id:
            raise ValueError(f"duplicate idempotency key: {transaction.idempotency_key}")
        self._transactions[transaction.id] = transaction
        return transaction

    def save_violation(self, violation: PebViolation) -> PebViolation:
        if violation.id is None:
            violation.id = uuid4()
        if violation.created_at is None:
            violation.created_at = utc_now()
        if violation.transaction_id is not None:
            duplicate = next(
                (item for item in self._violations.values() if item.transaction_id == violation.transaction_id),
                None,
            )
            if duplicate is not None and duplicate.id != violation.id:
                raise ValueError(f"duplicate violation for transaction: {violation.transaction_id}")
        self._violations[violation.id] = violation
        return violation

    def save_state(self, state: PebState) -> PebState:
        if state.id is None:
            state.id = uuid4()
        now = utc_now()
        state.created_at = state.created_at or now
        state.updated_at = now
        self._states[state.key] = state
        return state

    def save_decision(self, decision: PebDecision) -> PebDecision:
        if decision.id is None:
            decision.id = uuid4()
        decision.created_at = decision.created_at or utc_now()
        self._decisions[decision.id] = decision
        return decision

    def save_trace(self, trace: PebTrace) -> PebTrace:
        if trace.id is None:
            trace.id = uuid4()
        trace.created_at = trace.created_at or utc_now()
        self._traces[trace.id] = trace
        return trace

    def save_capability(self, capability: PebCapability) -> PebCapability:
        if capability.id is None:
            capability.id = uuid4()
        capability.created_at = capability.created_at or utc_now()
        self._capabilities[capability.id] = capability
        return capability

    def list_states(self) -> list[PebState]:
        return list(self._states.values())

    def latest_decision(self) -> PebDecision | None:
        return max(self._decisions.values(), key=lambda item: item.created_at or datetime.min, default=None)

    def health(self) -> dict[str, Any]:
        return {"status": "UP", "database": "reachable", "backend": "memory", "schema": "peb"}

    @property
    def transactions(self) -> list[PebTransaction]:
        return list(self._transactions.values())

    @property
    def violations(self) -> list[PebViolation]:
        return list(self._violations.values())


class PostgresPebStore:
    """DB-API adapter for the Java kernel's `peb` schema.

    ``psycopg2`` is imported lazily so the pure domain and in-memory tests do
    not require a live database or the PostgreSQL driver at import time.
    """

    def __init__(self, dsn: str | None = None) -> None:
        self.dsn = dsn or os.getenv("PEB_DATABASE_URL", "postgresql://pguser:pgpass@localhost:5432/nexus")
        self._local = local()

    def _connect(self):
        try:
            import psycopg2
        except ImportError as exc:  # pragma: no cover - environment dependent
            raise RuntimeError("PostgresPebStore requires psycopg2-binary") from exc
        return psycopg2.connect(self.dsn)

    def _connection(self):
        connection = getattr(self._local, "connection", None)
        if connection is None:
            raise RuntimeError("PEB store operation must run inside store.transaction()")
        return connection

    @contextmanager
    def transaction(self) -> Iterator[None]:
        if getattr(self._local, "connection", None) is not None:
            yield
            return
        connection = self._connect()
        self._local.connection = connection
        try:
            yield
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            self._local.connection = None
            connection.close()

    @staticmethod
    def _json(value: Any) -> Any:
        from psycopg2.extras import Json
        return Json(value) if value is not None else None

    def save_transaction(self, transaction: PebTransaction) -> PebTransaction:
        transaction.on_create()
        self._connection().cursor().execute(
            """INSERT INTO peb.transactions
               (id, idempotency_key, entity_id, admission_result, tool_name, input,
                output, before_hash, after_hash, state_delta, created_at, committed_at,
                kernel_event_id, kernel_event_type)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (idempotency_key) DO UPDATE SET
                 admission_result = EXCLUDED.admission_result,
                 output = EXCLUDED.output, before_hash = EXCLUDED.before_hash,
                 after_hash = EXCLUDED.after_hash, state_delta = EXCLUDED.state_delta,
                 committed_at = EXCLUDED.committed_at,
                 kernel_event_id = EXCLUDED.kernel_event_id,
                 kernel_event_type = EXCLUDED.kernel_event_type""",
            (
                str(transaction.id), transaction.idempotency_key, transaction.entity_id,
                transaction.admission_result.value if transaction.admission_result else None,
                transaction.tool_name, self._json(transaction.input), self._json(transaction.output),
                transaction.before_hash, transaction.after_hash, self._json(transaction.state_delta),
                transaction.created_at, transaction.committed_at,
                str(transaction.kernel_event_id) if transaction.kernel_event_id else None,
                transaction.kernel_event_type,
            ),
        )
        return transaction

    def save_violation(self, violation: PebViolation) -> PebViolation:
        if violation.id is None:
            violation.id = uuid4()
        violation.created_at = violation.created_at or utc_now()
        self._connection().cursor().execute(
            """INSERT INTO peb.violations
               (id, transaction_id, violation_type, severity, entity_id,
                capability_attempted, context, resolution, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                str(violation.id), str(violation.transaction_id) if violation.transaction_id else None,
                violation.violation_type.value, violation.severity.value, violation.entity_id,
                violation.capability_attempted, self._json(violation.context),
                violation.resolution.value if violation.resolution else None, violation.created_at,
            ),
        )
        return violation

    def save_state(self, state: PebState) -> PebState:
        if state.id is None:
            state.id = uuid4()
        now = utc_now()
        state.created_at = state.created_at or now
        state.updated_at = now
        self._connection().cursor().execute(
            """INSERT INTO peb.state
               (id, key, content, metadata, checksum, version, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (key) DO UPDATE SET content = EXCLUDED.content,
                 metadata = EXCLUDED.metadata, checksum = EXCLUDED.checksum,
                 version = peb.state.version + 1, updated_at = EXCLUDED.updated_at""",
            (str(state.id), state.key, self._json(state.content), self._json(state.metadata),
             state.checksum, state.version, state.created_at, state.updated_at),
        )
        return state

    def save_decision(self, decision: PebDecision) -> PebDecision:
        if decision.id is None:
            decision.id = uuid4()
        decision.created_at = decision.created_at or utc_now()
        self._connection().cursor().execute(
            """INSERT INTO peb.decisions
               (id, transaction_id, adr_number, title, status, summary, affected_keys,
                entropy_class, before_hash, after_hash, author_id, parent_decision_id,
                rollback_of, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                str(decision.id), str(decision.transaction_id), decision.adr_number, decision.title,
                decision.status.value, self._json(decision.summary), decision.affected_keys,
                decision.entropy_class.value if decision.entropy_class else None,
                decision.before_hash, decision.after_hash, decision.author_id,
                str(decision.parent_decision_id) if decision.parent_decision_id else None,
                str(decision.rollback_of) if decision.rollback_of else None, decision.created_at,
            ),
        )
        return decision

    def save_trace(self, trace: PebTrace) -> PebTrace:
        if trace.id is None:
            trace.id = uuid4()
        trace.created_at = trace.created_at or utc_now()
        self._connection().cursor().execute(
            """INSERT INTO peb.traces
               (id, transaction_id, work_request_id, parent_trace_id, stage, inputs,
                causal_entries, rejected_alternatives, confidence, status, created_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
            (
                str(trace.id), str(trace.transaction_id), trace.work_request_id,
                str(trace.parent_trace_id) if trace.parent_trace_id else None, trace.stage,
                self._json(trace.inputs), self._json(trace.causal_entries),
                self._json(trace.rejected_alternatives), trace.confidence, trace.status, trace.created_at,
            ),
        )
        return trace

    def save_capability(self, capability: PebCapability) -> PebCapability:
        if capability.id is None:
            capability.id = uuid4()
        capability.created_at = capability.created_at or utc_now()
        self._connection().cursor().execute(
            """INSERT INTO peb.capabilities
               (id, entity_id, capability, granted_by, expires_at, created_at, active)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (str(capability.id), capability.entity_id, capability.capability, capability.granted_by,
             capability.expires_at, capability.created_at, capability.active),
        )
        return capability

    def list_states(self) -> list[PebState]:
        cursor = self._connection().cursor()
        cursor.execute("SELECT id, key, content, metadata, checksum, version, created_at, updated_at FROM peb.state")
        return [PebState(id=row[0], key=row[1], content=row[2], metadata=row[3], checksum=row[4], version=row[5], created_at=row[6], updated_at=row[7]) for row in cursor.fetchall()]

    def latest_decision(self) -> PebDecision | None:
        cursor = self._connection().cursor()
        cursor.execute("""SELECT id, transaction_id, adr_number, title, status, summary,
            affected_keys, entropy_class, before_hash, after_hash, author_id,
            parent_decision_id, rollback_of, created_at
            FROM peb.decisions ORDER BY created_at DESC LIMIT 1""")
        row = cursor.fetchone()
        if row is None:
            return None
        return PebDecision(
            id=row[0], transaction_id=row[1], adr_number=row[2], title=row[3],
            status=DecisionStatus(row[4]), summary=row[5], affected_keys=row[6] or [],
            entropy_class=EntropyClass(row[7]) if row[7] else None, before_hash=row[8],
            after_hash=row[9], author_id=row[10], parent_decision_id=row[11],
            rollback_of=row[12], created_at=row[13],
        )

    def health(self) -> dict[str, Any]:
        connection = self._connect()
        try:
            cursor = connection.cursor()
            cursor.execute("SELECT current_database()")
            catalog = cursor.fetchone()[0]
            return {"status": "UP", "database": "reachable", "backend": "postgres", "schema": "peb", "catalog": catalog}
        finally:
            connection.close()


def store_from_environment() -> InMemoryPebStore | PostgresPebStore:
    if os.getenv("PEB_STORE", "postgres").lower() == "memory":
        return InMemoryPebStore()
    return PostgresPebStore()
