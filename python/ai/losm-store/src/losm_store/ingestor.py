from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

from sqlalchemy.orm import Session

from losm_store.models import GovernanceEvent, PlanningTask, ReceiptIngestRecord, WorkStatus
from losm_ir.execution_receipt import ExecutionReceipt


class ExecutionReceiptIngestor:
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
            db.add(
                GovernanceEvent(
                    event_type="RECEIPT_ORPHANED",
                    work_request_id=receipt.work_request_id,
                    lineage_parent=receipt.lineage_parent,
                    payload={"reason": "planning_task_not_found", "executor_id": receipt.executor_id},
                )
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

        if receipt.result == "SUCCESS":
            planning_task.status = WorkStatus.COMPLETION
        elif receipt.result == "FAILED":
            planning_task.status = WorkStatus.FAILED
        else:
            planning_task.status = WorkStatus.BLOCKED

        db.add(
            GovernanceEvent(
                event_type="RECEIPT_INGESTED",
                work_request_id=receipt.work_request_id,
                lineage_parent=receipt.lineage_parent,
                payload={
                    "executor_id": receipt.executor_id,
                    "result": receipt.result,
                    "receipt_hash": receipt_hash,
                },
            )
        )

        db.commit()
        db.refresh(ingest_row)
        return {
            "status": "ingested",
            "receipt_id": ingest_row.receipt_id,
            "work_request_id": receipt.work_request_id,
            "event_type": "RECEIPT_INGESTED",
        }


__all__ = ["ExecutionReceiptIngestor"]
