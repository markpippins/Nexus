from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

from sqlalchemy.orm import Session

from losm_store.models import GovernanceEvent, PlanningTask, ReceiptIngestRecord, WorkStatus
from losm_store.governed_triggers import GovernedTriggerAdapter
from losm_ir.execution_receipt import ExecutionReceipt
from losm_ir.transition import validate_transition

# Map receipt results to target lifecycle states.
_RESULT_TO_STATE = {
    "SUCCESS": "COMPLETION",
    "FAILED": "FAILED",
    "PARTIAL": "BLOCKED",
}


class ExecutionReceiptIngestor:
    def __init__(self, trigger_adapter: GovernedTriggerAdapter | None = None):
        self.trigger_adapter = trigger_adapter or GovernedTriggerAdapter()

    def ingest(self, db: Session, receipt_payload: Dict[str, Any]) -> Dict[str, Any]:
        receipt = ExecutionReceipt.model_validate(receipt_payload)
        canonical = receipt.model_dump(mode="json", by_alias=True)
        receipt_hash = hashlib.sha256(
            json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()

        existing = db.query(ReceiptIngestRecord).filter_by(receipt_hash=receipt_hash).first()
        if existing is not None:
            return {
                "status": "duplicate",
                "receipt_id": existing.receipt_id,
                "work_request_id": existing.work_request_id,
                "event_type": "RECEIPT_DUPLICATE",
            }

        ingest_row = ReceiptIngestRecord(
            work_request_id=receipt.work_request_id,
            executor_id=receipt.executor_id,
            receipt_hash=receipt_hash,
            result=receipt.result,
            lineage_parent=receipt.lineage_parent,
            payload=canonical,
        )
        db.add(ingest_row)

        planning_task = db.query(PlanningTask).filter_by(wr_id=receipt.work_request_id).first()
        if planning_task is None:
            governance = GovernanceEvent(
                event_type="RECEIPT_ORPHANED",
                work_request_id=receipt.work_request_id,
                lineage_parent=receipt.lineage_parent,
                payload={"reason": "planning_task_not_found", "executor_id": receipt.executor_id},
            )
            db.add(governance)
            db.flush()
            self.trigger_adapter.emit(
                db,
                self.trigger_adapter.receipt_outcome(
                    event_id=str(governance.event_id),
                    wr_id=receipt.work_request_id,
                    event_type="RECEIPT_ORPHANED",
                    outcome="rejected",
                    payload=governance.payload,
                ),
            )
            db.commit()
            db.refresh(ingest_row)
            return {
                "status": "orphaned",
                "receipt_id": ingest_row.receipt_id,
                "work_request_id": receipt.work_request_id,
                "event_type": "RECEIPT_ORPHANED",
            }

        context = planning_task.context_data or {}
        context["last_receipt_id"] = ingest_row.receipt_id
        context["last_receipt_hash"] = receipt_hash
        context["last_lineage_parent"] = receipt.lineage_parent
        context["receipt_results"] = (context.get("receipt_results") or []) + [receipt.result]
        planning_task.context_data = context

        # Resolve target state from receipt result, then validate the transition.
        target_state = _RESULT_TO_STATE.get(receipt.result)
        if target_state is None:
            return self._reject(db, ingest_row, receipt, planning_task,
                                f"Unknown receipt result: '{receipt.result}'")

        current_state = planning_task.status.value
        validation = validate_transition(current_state, target_state)
        if not validation.allowed:
            return self._reject(db, ingest_row, receipt, planning_task,
                                f"Receipt result '{receipt.result}' invalid: "
                                f"{current_state} → {target_state}. {validation.reason}")

        planning_task.status = WorkStatus(target_state)

        governance = GovernanceEvent(
            event_type="RECEIPT_INGESTED",
            work_request_id=receipt.work_request_id,
            lineage_parent=receipt.lineage_parent,
            payload={
                "executor_id": receipt.executor_id,
                "result": receipt.result,
                "receipt_hash": receipt_hash,
            },
        )
        db.add(governance)
        db.flush()
        self.trigger_adapter.emit(
            db,
            self.trigger_adapter.receipt_outcome(
                event_id=str(governance.event_id),
                wr_id=receipt.work_request_id,
                event_type="RECEIPT_INGESTED",
                outcome="committed",
                payload=governance.payload,
            ),
        )

        db.commit()
        db.refresh(ingest_row)
        return {
            "status": "ingested",
            "receipt_id": ingest_row.receipt_id,
            "work_request_id": receipt.work_request_id,
            "event_type": "RECEIPT_INGESTED",
        }

    def _reject(self, db, ingest_row, receipt, planning_task, reason: str) -> dict:
        """Record a rejection governance event. Does NOT mutate task status."""
        governance = GovernanceEvent(
            event_type="RECEIPT_REJECTED",
            work_request_id=receipt.work_request_id,
            lineage_parent=receipt.lineage_parent,
            payload={
                "reason": reason,
                "executor_id": receipt.executor_id,
                "receipt_result": receipt.result,
                "current_status": planning_task.status.value if planning_task else None,
            },
        )
        db.add(governance)
        db.flush()
        self.trigger_adapter.emit(
            db,
            self.trigger_adapter.receipt_outcome(
                event_id=str(governance.event_id),
                wr_id=receipt.work_request_id,
                event_type="RECEIPT_REJECTED",
                outcome="rejected",
                payload=governance.payload,
            ),
        )
        db.commit()
        db.refresh(ingest_row)
        return {
            "status": "rejected",
            "receipt_id": ingest_row.receipt_id,
            "work_request_id": receipt.work_request_id,
            "event_type": "RECEIPT_REJECTED",
            "reason": reason,
        }


__all__ = ["ExecutionReceiptIngestor"]
