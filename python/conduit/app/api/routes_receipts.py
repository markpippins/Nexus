"""
Receipts API — GET/POST/DELETE /api/receipts

Provides receipt lifecycle operations from conduit-mcp's db.ts:
  GET  /api/receipts/:planId           — getPlanReceipts (formatted)
  GET  /api/receipts/:planId/raw       — getReceiptsForPlan (raw rows)
  GET  /api/receipts/:planId/latest-type — getLatestReceiptType
  POST /api/receipts                   — insertReceipt
  DELETE /api/receipts/:planId         — deleteReceiptsByPlanAndType (query: types)

Design: Plan 1055 — conduit-mcp SQL consolidation into Python conduit
Validation (validateReceipt) stays in conduit-mcp's receipts.ts.
"""

import json
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

_log = logging.getLogger("kernel.api.receipts")
router = APIRouter()


# ── Pydantic models ────────────────────────────────────────────────

class ReceiptInsertRequest(BaseModel):
    id: str
    plan_id: str
    type: str
    agent_role: str
    session_id: str = ""
    ticket_id: Optional[str] = None
    artifact_path: Optional[str] = None
    summary: str = ""
    metadata_json: str = "{}"
    tokens_used: int = 0
    created_at: str


class DeleteReceiptsRequest(BaseModel):
    types: list[str]


# ── Routes ──────────────────────────────────────────────────────────

@router.get("/{plan_id}")
def get_plan_receipts(plan_id: str):
    """Get formatted receipts for a plan. Equivalent to db.ts getPlanReceipts()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    with db._get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM vision.receipts WHERE plan_id = %s ORDER BY created_at ASC",
            (plan_id,),
        )
        rows = cursor.dict_fetchall()

    formatted = []
    for r in rows:
        meta = {}
        try:
            meta = json.loads(r.get("metadata_json", "{}") or "{}")
        except (json.JSONDecodeError, TypeError):
            pass
        formatted.append({
            "id": r["id"],
            "type": r["type"],
            "agent_role": r.get("agent_role", ""),
            "session_id": r.get("session_id", ""),
            "artifact_path": r.get("artifact_path"),
            "summary": r.get("summary", ""),
            "metadata": meta,
            "created_at": r.get("created_at"),
        })

    return {"plan_id": plan_id, "count": len(formatted), "receipts": formatted}


@router.get("/{plan_id}/raw")
def get_receipts_raw(plan_id: str):
    """Get raw receipt rows for a plan. Equivalent to db.ts getReceiptsForPlan()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    with db._get_connection() as conn:
        cursor = conn.execute(
            "SELECT * FROM vision.receipts WHERE plan_id = %s ORDER BY created_at ASC",
            (plan_id,),
        )
        rows = cursor.dict_fetchall()

    return {"plan_id": plan_id, "count": len(rows), "receipts": rows}


@router.get("/{plan_id}/latest-type")
def get_latest_receipt_type(plan_id: str):
    """Get the latest receipt type for a plan. Equivalent to db.ts getLatestReceiptType()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    with db._get_connection() as conn:
        row = conn.execute(
            "SELECT type FROM vision.receipts WHERE plan_id = %s ORDER BY created_at DESC LIMIT 1",
            (plan_id,),
        ).dict_fetchone()

    return {
        "plan_id": plan_id,
        "latest_type": row["type"] if row else None,
    }


@router.post("/")
def insert_receipt(body: ReceiptInsertRequest):
    """Insert a receipt. D-T19-2(b): execution.receipts (request-scoped) when the
    plan resolves to an execution.requests row; vision.receipts fallback for
    test/synthetic plans.
    Validation (validateReceipt) is done client-side in conduit-mcp."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    request_id = db.resolve_request_for_receipt(body.plan_id)
    if request_id is not None:
        base_meta = json.loads(body.metadata_json) if body.metadata_json else {}
        exec_meta = {
            **base_meta,
            "session_id": body.session_id or "",
            "artifact_path": body.artifact_path,
            "ticket_id": body.ticket_id,
            "tokens_used": body.tokens_used or 0,
        }
        with db._get_connection() as conn:
            conn.execute(
                "INSERT INTO execution.receipts "
                "(request_id, attempt_id, type, agent_role, summary, metadata, "
                "lineage_source, lineage_original_id, issued_at) "
                "VALUES (%s, NULL, %s, %s, %s, %s, 'conduit', %s, %s) "
                "ON CONFLICT (lineage_original_id) WHERE lineage_source = 'conduit' DO NOTHING",
                (request_id, body.type, body.agent_role, body.summary or "",
                 json.dumps(exec_meta), body.id, body.created_at),
            )
            conn.commit()
    else:
        with db._get_connection() as conn:
            conn.execute(
                "INSERT INTO vision.receipts "
                "(id, plan_id, type, agent_role, session_id, ticket_id, "
                "artifact_path, summary, metadata_json, tokens_used, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
                "ON CONFLICT (id) DO NOTHING",
                (
                    body.id,
                    body.plan_id,
                    body.type,
                    body.agent_role,
                    body.session_id or "",
                    body.ticket_id,
                    body.artifact_path,
                    body.summary or "",
                    body.metadata_json or "{}",
                    body.tokens_used or 0,
                    body.created_at,
                ))
            conn.commit()

    _log.info("insert_receipt: plan=%s type=%s id=%s request=%s",
              body.plan_id, body.type, body.id, request_id)
    return {"ok": True, "id": body.id, "plan_id": body.plan_id}


@router.delete("/{plan_id}")
def delete_receipts_by_plan_and_type(
    plan_id: str,
    types: str = Query(..., description="Comma-separated receipt types to delete"),
):
    """Delete receipts by plan and type. Equivalent to db.ts deleteReceiptsByPlanAndType()."""
    from db_adapter import DBAdapter
    db = DBAdapter()

    type_list = [t.strip() for t in types.split(",") if t.strip()]
    if not type_list:
        raise HTTPException(status_code=400, detail="No receipt types provided")

    placeholders = ", ".join(["%s"] * len(type_list))
    with db._get_connection() as conn:
        cursor = conn.execute(
            f"DELETE FROM vision.receipts WHERE plan_id = %s AND type IN ({placeholders})",
            (plan_id, *type_list),
        )
        conn.commit()
        deleted = cursor.rowcount or 0

    _log.info("delete_receipts: plan=%s types=%s deleted=%d", plan_id, type_list, deleted)
    return {"deleted": deleted, "plan_id": plan_id, "types": type_list}
