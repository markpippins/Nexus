"""PEB adapter for the governed Keychains trigger boundary."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional, Protocol


class OutboxConnection(Protocol):
    def cursor(self) -> Any: ...


class PebKeychainsAdapter:
    """Write one source-scoped PEB decision event into Resolution outbox.

    The caller must invoke this while the PEB store transaction is open. No
    commit is performed here, so the Keychains event cannot survive a rolled
    back PEB transaction.
    """

    source_namespace = "peb"
    schema_version = 1

    def emit_transaction(self, connection: OutboxConnection, transaction: Any) -> None:
        outcome = self._outcome(transaction)
        source_event_id = f"transaction:{transaction.id}"
        event_kind = {
            "committed": "peb.admission.committed",
            "rejected": "peb.admission.rejected",
            "unknown": "peb.admission.unknown",
        }[outcome]
        now = datetime.now(timezone.utc).isoformat()
        read_set = {
            "transaction_id": str(transaction.id),
            "entity_id": transaction.entity_id,
            "tool_name": transaction.tool_name,
            "admission_result": transaction.admission_result.value
            if transaction.admission_result
            else None,
            "before_hash": transaction.before_hash,
            "after_hash": transaction.after_hash,
        }
        payload = {
            "transaction_id": str(transaction.id),
            "idempotency_key": transaction.idempotency_key,
            "kernel_event_id": str(transaction.kernel_event_id)
            if transaction.kernel_event_id
            else None,
            "kernel_event_type": transaction.kernel_event_type,
        }
        connection.cursor().execute(
            """
            INSERT INTO resolution.keychain_event_outbox (
                source_namespace, source_event_id, event_kind, outcome,
                schema_version, aggregate_id, causation_id, correlation_id,
                actor, contract_id, effective_at, recorded_at, read_set,
                payload, checkpoint_status
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s
            )
            ON CONFLICT (source_namespace, source_event_id) DO NOTHING
            """,
            (
                self.source_namespace,
                source_event_id,
                event_kind,
                outcome,
                self.schema_version,
                str(transaction.entity_id),
                str(transaction.id),
                transaction.idempotency_key,
                "peb-kernel",
                "governed-trigger.v1",
                transaction.created_at,
                now,
                json.dumps(read_set, sort_keys=True, default=str),
                json.dumps(payload, sort_keys=True, default=str),
                "pending" if outcome == "committed" else "not_applicable",
            ),
        )

    @staticmethod
    def _outcome(transaction: Any) -> str:
        value = getattr(getattr(transaction, "admission_result", None), "value", None)
        if value == "ALLOWED":
            return "committed"
        if value == "REJECTED":
            return "rejected"
        return "unknown"


__all__ = ["PebKeychainsAdapter"]
