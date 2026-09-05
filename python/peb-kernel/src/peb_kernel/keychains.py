"""PEB adapter for the governed Keychains trigger boundary."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol


class OutboxConnection(Protocol):
    def cursor(self) -> Any: ...


class PebKeychainsAdapter:
    """Write one source-scoped PEB decision event into Resolution outbox.

    The caller must invoke this while the PEB store transaction is open. No
    commit is performed here, so the Keychains event cannot survive a rolled
    back PEB transaction.

    Binding decisions are deliberately narrow: only the ratified
    ``deny_contract_promotion`` class is accepted. Other PEB admissions retain
    the legacy generic event shape and never become binding by omission.
    """

    source_namespace = "peb"
    schema_version = 1
    binding_decision_class = "deny_contract_promotion"
    negative_dispositions = frozenset({
        "refused", "unknown", "stale", "drift", "quarantined", "superseded", "rolled_back",
    })

    def emit_transaction(self, connection: OutboxConnection, transaction: Any) -> None:
        binding = self._binding_decision(transaction)
        outcome = self._outcome(transaction, binding)
        source_event_id = self._source_event_id(transaction, binding)
        event_kind = self._event_kind(outcome, binding)
        now = datetime.now(timezone.utc).isoformat()
        read_set = self._read_set(transaction, binding)
        payload = self._payload(transaction, binding, outcome)

        connection.cursor().execute(
            """
            INSERT INTO resolution.keychain_event_outbox (
                source_namespace, source_event_id, event_kind, outcome,
                schema_version, aggregate_id, causation_id, correlation_id,
                actor, contract_id, evaluator_id, law_id, effective_at, recorded_at,
                read_set, payload, checkpoint_status
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s
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
                self._contract_id(binding),
                self._evaluator_id(binding),
                self._law_id(binding),
                self._effective_at(binding, transaction),
                now,
                json.dumps(read_set, sort_keys=True, default=str),
                json.dumps(payload, sort_keys=True, default=str),
                "pending" if outcome == "committed" else "not_applicable",
            ),
        )

    @classmethod
    def _binding_decision(cls, transaction: Any) -> Mapping[str, Any] | None:
        input_payload = getattr(transaction, "input", None)
        if not isinstance(input_payload, Mapping):
            return None
        candidate = input_payload.get("binding_decision")
        if candidate is None:
            return None
        if not isinstance(candidate, Mapping):
            raise ValueError("binding_decision must be an object")
        decision_class = candidate.get("decision_class")
        if decision_class != cls.binding_decision_class:
            raise ValueError(f"unauthorized Keychains decision class: {decision_class!r}")
        required = (
            "decision_id", "disposition", "authority_level", "decision_class",
            "evaluation_fingerprint", "replay_context", "evidence_ids",
            "contract", "evaluator", "doctrine_ids",
        )
        missing = [field for field in required if candidate.get(field) in (None, "")]
        if missing:
            raise ValueError("binding decision missing provenance: " + ", ".join(missing))
        if not isinstance(candidate["contract"], Mapping) or not candidate["contract"].get("version"):
            raise ValueError("binding decision missing provenance: contract.version")
        if not isinstance(candidate["evaluator"], Mapping) or not candidate["evaluator"].get("version"):
            raise ValueError("binding decision missing provenance: evaluator.version")
        if not (
            candidate.get("authorization_ref")
            or candidate.get("authority_ref")
            or candidate.get("grant_id")
        ):
            raise ValueError("binding decision missing provenance: authorization_ref")
        return candidate

    @classmethod
    def _outcome(cls, transaction: Any, binding: Mapping[str, Any] | None = None) -> str:
        if binding is not None:
            disposition = binding.get("disposition")
            if disposition == "allow":
                return "committed"
            if disposition in cls.negative_dispositions:
                return str(disposition)
            raise ValueError(f"unsupported binding disposition: {disposition!r}")
        value = getattr(getattr(transaction, "admission_result", None), "value", None)
        if value == "ALLOWED":
            return "committed"
        if value == "REJECTED":
            return "rejected"
        return "unknown"

    @classmethod
    def _source_event_id(cls, transaction: Any, binding: Mapping[str, Any] | None) -> str:
        if binding is None:
            return f"transaction:{transaction.id}"
        decision_id = binding.get("decision_id")
        fingerprint = binding.get("evaluation_fingerprint")
        if not decision_id or not fingerprint:
            raise ValueError("binding decision requires decision_id and evaluation_fingerprint")
        return f"binding:{decision_id}:{fingerprint}"

    @classmethod
    def _event_kind(cls, outcome: str, binding: Mapping[str, Any] | None) -> str:
        prefix = "peb.deny_contract_promotion" if binding is not None else "peb.admission"
        return f"{prefix}.{outcome}"

    @staticmethod
    def _nested(binding: Mapping[str, Any] | None, key: str) -> Mapping[str, Any]:
        value = binding.get(key) if binding is not None else None
        return value if isinstance(value, Mapping) else {}

    @classmethod
    def _contract_id(cls, binding: Mapping[str, Any] | None) -> str:
        contract = cls._nested(binding, "contract")
        return str(contract.get("id") or "governed-trigger.v1")

    @classmethod
    def _evaluator_id(cls, binding: Mapping[str, Any] | None) -> str | None:
        evaluator = cls._nested(binding, "evaluator")
        return str(evaluator["id"]) if evaluator.get("id") is not None else None

    @classmethod
    def _law_id(cls, binding: Mapping[str, Any] | None) -> str | None:
        if binding is None:
            return None
        doctrine_ids = binding.get("doctrine_ids")
        if isinstance(doctrine_ids, list) and doctrine_ids:
            return ",".join(str(item) for item in doctrine_ids)
        return str(binding["law_id"]) if binding.get("law_id") is not None else None

    @classmethod
    def _effective_at(cls, binding: Mapping[str, Any] | None, transaction: Any) -> Any:
        return binding.get("as_of") if binding is not None and binding.get("as_of") else getattr(transaction, "created_at", None)

    @classmethod
    def _authorization_ref(cls, transaction: Any, binding: Mapping[str, Any] | None) -> Any:
        input_payload = getattr(transaction, "input", None)
        outer = input_payload if isinstance(input_payload, Mapping) else {}
        if binding is not None:
            return (
                binding.get("authorization_ref")
                or binding.get("authority_ref")
                or binding.get("grant_id")
                or outer.get("authorization_ref")
                or outer.get("authority_ref")
                or outer.get("grant_id")
            )
        return outer.get("authorization_ref") or outer.get("authority_ref") or outer.get("grant_id")

    @classmethod
    def _read_set(cls, transaction: Any, binding: Mapping[str, Any] | None) -> dict[str, Any]:
        read_set: dict[str, Any] = {
            "transaction_id": str(transaction.id),
            "entity_id": transaction.entity_id,
            "tool_name": transaction.tool_name,
            "admission_result": transaction.admission_result.value
            if transaction.admission_result
            else None,
            "before_hash": transaction.before_hash,
            "after_hash": transaction.after_hash,
        }
        if binding is None:
            return read_set

        contract = cls._nested(binding, "contract")
        evaluator = cls._nested(binding, "evaluator")
        input_payload = getattr(transaction, "input", None)
        outer = input_payload if isinstance(input_payload, Mapping) else {}
        read_set.update({
            "decision_class": binding["decision_class"],
            "binding_owner": (
                binding.get("binding_owner")
                or binding.get("owner")
                or outer.get("binding_owner")
                or "resolution"
            ),
            "authority_level": binding.get("authority_level"),
            "authorization_ref": cls._authorization_ref(transaction, binding),
            "binding_contract_version": binding.get("binding_contract_version"),
            "decision_id": binding.get("decision_id"),
            "proposition_id": binding.get("proposition_id"),
            "subject_id": binding.get("subject_id"),
            "work_item_id": binding.get("work_item_id"),
            "evidence_ids": binding.get("evidence_ids"),
            "replay_context": binding.get("replay_context"),
            "as_of": binding.get("as_of"),
            "disposition": binding.get("disposition"),
            "evidence_fresh": binding.get("evidence_fresh"),
            "evaluation_fingerprint": binding.get("evaluation_fingerprint"),
            "lineage_fingerprint": binding.get("lineage_fingerprint"),
            "contract_id": contract.get("id"),
            "contract_version": contract.get("version"),
            "evaluator_id": evaluator.get("id"),
            "evaluator_version": evaluator.get("version"),
            "law_id": cls._law_id(binding),
            "doctrine_ids": binding.get("doctrine_ids"),
            "law_version": binding.get("law_version"),
            "bridge_id": binding.get("bridge_id") or "peb-keychains-outbox",
            "bridge_version": binding.get("bridge_version") or "1",
            "read_set_manifest": binding.get("read_set_manifest") or outer.get("read_set_manifest"),
        })
        return read_set

    @classmethod
    def _payload(cls, transaction: Any, binding: Mapping[str, Any] | None, outcome: str) -> dict[str, Any]:
        payload = {
            "transaction_id": str(transaction.id),
            "idempotency_key": transaction.idempotency_key,
            "kernel_event_id": str(transaction.kernel_event_id)
            if transaction.kernel_event_id
            else None,
            "kernel_event_type": transaction.kernel_event_type,
        }
        if binding is not None:
            payload.update({
                "decision_class": binding["decision_class"],
                "decision_id": binding.get("decision_id"),
                "disposition": binding.get("disposition"),
                "authority_level": binding.get("authority_level"),
                "authorization_ref": cls._authorization_ref(transaction, binding),
                "evaluation_fingerprint": binding.get("evaluation_fingerprint"),
                "lineage_fingerprint": binding.get("lineage_fingerprint"),
                "outcome": outcome,
            })
        return payload


__all__ = ["PebKeychainsAdapter"]
