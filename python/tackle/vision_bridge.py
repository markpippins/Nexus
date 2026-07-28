#!/usr/bin/env python3
"""vision_bridge — Typed LOSM ↔ Vision bridge.

This is the **semantic firewall** between the LOSM type-safe execution
model and the Vision canonical state schema.  It is the only module that
translates between ``losm_ir`` pydantic models and the ``vision.*``
PostgreSQL tables (via conduit-mcp's HTTP API).

Invariants maintained here:
  - Every written record is validated through LOSM models first.
  - No direct SQL or psycopg2 — all writes go through conduit-mcp HTTP.
  - Cross-system identity (``work_request_uuid``) is ensured when
    ``identity_contract`` flag is enabled.

Usage::

    from tackle.vision_bridge import create_work_request, issue_receipt
    from losm_ir.execution_receipt import ExecutionReceipt

    receipt = ExecutionReceipt(
        work_request_id="0160",
        executor_id="planner",
        timestamp="2026-06-23T00:00:00Z",
        result="SUCCESS",
    )
    result = issue_receipt(receipt)
"""

from __future__ import annotations

import json
import logging
import os
import urllib.request
import uuid
from typing import Any, Dict, List, Optional

from losm_ir.execution_receipt import ExecutionReceipt
from losm_ir.work_request import WorkRequestDCO

_log = logging.getLogger("tackle.vision_bridge")

# ── Conduit server URLs ───────────────────────────────────────────────
# conduit-mcp (3100) retains MCP-native endpoints (POST /tools/call) and
# routes with runtime-kernel/validation dependencies (POST /vision/receipts).
# conduit-srv (3104) serves the pure-DB REST routes extracted per the
# "No SQL in MCP Servers" architectural directive.

CONDUIT_MCP_URL = os.environ.get(
    "CONDUIT_MCP_URL",
    "http://localhost:3100",
).rstrip("/")

CONDUIT_SRV_URL = os.environ.get(
    "CONDUIT_SRV_URL",
    "http://localhost:3104",
).rstrip("/")


# ── HTTP helpers (same pattern as tackle.db) ──────────────────────────


def _api_post(path: str, body: dict, base_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Fire a JSON POST and return parsed response.

    Defaults to conduit-mcp (3100) for MCP-native and validation-dependent
    routes. Pass base_url=CONDUIT_SRV_URL for pure-DB REST routes.
    """
    base = base_url or CONDUIT_MCP_URL
    url = f"{base}{path}"
    data = json.dumps(body).encode("utf-8")
    try:
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body_text = e.read().decode("utf-8", errors="replace")[:300]
        _log.warning("HTTP %d from %s: %s", e.code, url, body_text)
        return {"ok": False, "error": f"HTTP {e.code}: {body_text}"}
    except Exception as e:
        _log.warning("POST %s failed: %s", url, e)
        return {"ok": False, "error": str(e)}


def _api_get(path: str, base_url: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Fire a GET and return parsed JSON.

    Defaults to conduit-mcp (3100) for MCP-native and validation-dependent
    routes. Pass base_url=CONDUIT_SRV_URL for pure-DB REST routes.
    """
    base = base_url or CONDUIT_MCP_URL
    url = f"{base}{path}"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        _log.warning("HTTP %d from %s", e.code, url)
        return None
    except Exception as e:
        _log.warning("GET %s failed: %s", url, e)
        return None


# ── Timestamp helpers ──────────────────────────────────────────────────

def _now_iso() -> str:
    """Return current UTC timestamp as ISO 8601 string."""
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

def _timestamp_ms() -> float:
    """Return current time in milliseconds since epoch."""
    import time
    return time.time() * 1000


# ── Receipt Type Mapping ──────────────────────────────────────────────
# LOSM ExecutionReceipt.result → conduit receipt type

_RESULT_TO_RECEIPT_TYPE = {
    "SUCCESS": "REVIEW_PASS",
    "FAILED": "REVIEW_REJECT",
    "PARTIAL": "CRITIQUE",
}

_RECEIPT_TYPE_TO_RESULT = {v: k for k, v in _RESULT_TO_RECEIPT_TYPE.items()}


# ── Work Request CRUD ─────────────────────────────────────────────────


def create_work_request(
    dco: WorkRequestDCO,
    plan_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Write a LOSM ``WorkRequestDCO`` into ``vision.work_requests`` via conduit-mcp.

    Args:
        dco: The fully-typed work request decomposition object.
        plan_id: Optional conduit plan ID to associate (defaults to dco.id).

    Returns:
        Dict with ``{"ok": True, "work_request_id": "..."}`` or
        ``{"ok": False, "error": "..."}``.
    """
    wr_id = plan_id or dco.id
    wr_uuid = generate_work_request_uuid()

    payload = {
        "id": wr_id,
        "work_request_uuid": wr_uuid,
        "dco_json": dco.model_dump_json(),
        "status": dco.execution_state.status if dco.execution_state else "pending",
        "context": {
            "plan_id": wr_id,
            "work_request_uuid": wr_uuid,
            "intent": dco.intent.model_dump() if dco.intent else {},
            "constraints": dco.constraints.model_dump() if dco.constraints else {},
            "success_criteria": dco.success_criteria.model_dump() if dco.success_criteria else {},
            "artifacts": dco.artifacts.model_dump() if dco.artifacts else {},
        },
    }

    result = _api_post("/vision/work-requests", payload, base_url=CONDUIT_SRV_URL)
    if result and result.get("ok"):
        _log.info("Created work_request %s (uuid=%s)", wr_id, wr_uuid)
    else:
        _log.warning("Failed to create work_request %s: %s", wr_id, result)
    return result or {"ok": False, "error": "no response"}


def get_work_request(work_request_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a work request from vision by ID."""
    return _api_get(f"/vision/work-requests/{work_request_id}", base_url=CONDUIT_SRV_URL)


def list_work_requests(
    plan_id: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """List work requests, optionally filtered."""
    from urllib.parse import urlencode
    query = {"limit": str(limit)}
    if plan_id:
        query["planId"] = plan_id
    if status:
        query["status"] = status
    result = _api_get(f"/vision/work-requests?{urlencode(query)}", base_url=CONDUIT_SRV_URL)
    if result and result.get("ok"):
        return result.get("work_requests", [])
    return []


# ── Receipt CRUD ──────────────────────────────────────────────────────


def issue_receipt(
    receipt: ExecutionReceipt,
    plan_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Issue a typed LOSM ``ExecutionReceipt`` into ``vision.receipts`` via conduit-mcp.

    Translates LOSM result (SUCCESS/FAILED/PARTIAL) to conduit receipt type
    (REVIEW_PASS/REVIEW_REJECT/CRITIQUE).

    Uses the direct ``POST /vision/receipts`` endpoint (no state machine
    validation) so standalone LOSM work requests work without dummy plans.
    For conduit plan state machine validation, use ``issue_receipt_raw()``.

    Args:
        receipt: The LOSM execution receipt.
        plan_id: Optional plan ID (defaults to receipt.work_request_id).
        session_id: Optional session ID to associate.

    Returns:
        Dict with receipt issue result.
    """
    conduit_type = _RESULT_TO_RECEIPT_TYPE.get(receipt.result, "CRITIQUE")
    wr_id = plan_id or receipt.work_request_id

    # Map LOSM executor_id to conduit agent_role
    agent_role = receipt.executor_id if receipt.executor_id in (
        "planner", "builder", "reviewer", "critic", "analyst",
        "architect", "inspector", "engineer", "watchdog",
    ) else "builder"

    now = receipt.timestamp or _now_iso()

    # Build receipt payload for direct insert
    receipt_payload = {
        "id": f"rec-{wr_id}-{conduit_type}-{int(_timestamp_ms())}",
        "plan_id": wr_id,
        "type": conduit_type,
        "agent_role": agent_role,
        "session_id": session_id or "",
        "summary": receipt.lineage_parent or f"LOSM receipt: {receipt.result}",
        "created_at": now,
        "metadata_json": json.dumps({
            "losm_work_request_id": receipt.work_request_id,
            "losm_executor_id": receipt.executor_id,
            "losm_timestamp": receipt.timestamp,
            "losm_inputs": receipt.inputs,
            "losm_mutations": [m.model_dump() for m in receipt.mutations],
        }),
        "tokens_used": 0,
    }

    result = _api_post("/vision/receipts", receipt_payload)
    if result and result.get("ok"):
        _log.info("Issued direct receipt %s for %s", conduit_type, wr_id)
    else:
        # Fallback: try the MCP tool API (state machine path)
        _log.info("Direct insert failed, falling back to MCP tool: %s", result)
        tool_call = {
            "name": "issue_receipt",
            "arguments": {
                "plan_id": wr_id,
                "type": conduit_type,
                "agent_role": agent_role,
                "session_id": session_id or "",
                "summary": receipt.lineage_parent or f"LOSM receipt: {receipt.result}",
                "metadata": {
                    "losm_work_request_id": receipt.work_request_id,
                    "losm_executor_id": receipt.executor_id,
                    "losm_timestamp": receipt.timestamp,
                    "losm_inputs": receipt.inputs,
                    "losm_mutations": [m.model_dump() for m in receipt.mutations],
                },
            },
        }
        result = _api_post("/tools/call", tool_call)
        if result and result.get("result", {}).get("issued"):
            _log.info("Issued receipt %s for plan %s via MCP tool", conduit_type, wr_id)
        else:
            _log.warning("Failed to issue receipt: %s", result)

    return result or {"ok": False, "error": "no response"}


def issue_receipt_raw(
    plan_id: str,
    receipt_type: str,
    agent_role: str,
    summary: str = "",
    session_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Issue a receipt directly without LOSM model (for non-LOSM callers).

    This is a thin wrapper for code that hasn't adopted LOSM types yet.
    """
    tool_call = {
        "name": "issue_receipt",
        "arguments": {
            "plan_id": plan_id,
            "type": receipt_type,
            "agent_role": agent_role,
            "session_id": session_id or "",
            "summary": summary,
            "metadata": metadata or {},
        },
    }
    result = _api_post("/tools/call", tool_call)
    return result or {"ok": False, "error": "no response"}


def get_receipts(plan_id: str, as_of: Optional[str] = None) -> List[Dict[str, Any]]:
    """Get all receipts for a plan via conduit-mcp.

    Args:
        plan_id: The plan or work request ID.
        as_of: Optional ISO 8601 timestamp for point-in-time reconstruction.
               Only receipts created at or before this timestamp are returned.
    """
    from urllib.parse import urlencode
    query = {"planId": plan_id}
    if as_of:
        query["asOf"] = as_of
    result = _api_get(f"/vision/receipts?{urlencode(query)}", base_url=CONDUIT_SRV_URL)
    if result and result.get("ok"):
        return result.get("receipts", [])
    return []


# ── Governance Events ─────────────────────────────────────────────────


def replay_governance_events() -> Dict[str, Any]:
    """Trigger replay of missed governance events."""
    return _api_post("/governance/replay", {}, base_url=CONDUIT_SRV_URL) or {}


def list_governance_events(
    plan_id: Optional[str] = None,
    event_type: Optional[str] = None,
    as_of: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    """List governance events from peb.governance_events.

    Args:
        plan_id: Optional filter by plan ID.
        event_type: Optional filter by event type (e.g. "receipt:REVIEW_PASS").
        as_of: Optional ISO 8601 timestamp for point-in-time reconstruction.
        limit: Maximum number of events to return (default 50).
    """
    from urllib.parse import urlencode
    query = {"limit": str(limit)}
    if plan_id:
        query["planId"] = plan_id
    if event_type:
        query["eventType"] = event_type
    if as_of:
        query["asOf"] = as_of
    result = _api_get(f"/governance/events?{urlencode(query)}", base_url=CONDUIT_SRV_URL)
    if result and result.get("ok"):
        return result.get("events", [])
    return []


# ── Identity Contract (Phase B2) ─────────────────────────────────────


def generate_work_request_uuid() -> str:
    """Generate a cross-system immutable identifier.

    This UUID is used across Vision, LOSM, and PEB to correlate records
    without relying on nullable plan_id or work_request_id fields.

    Returns a UUID4 string.
    """
    return str(uuid.uuid4())


__all__ = [
    "create_work_request",
    "get_work_request",
    "list_work_requests",
    "issue_receipt",
    "issue_receipt_raw",
    "get_receipts",
    "replay_governance_events",
    "list_governance_events",
    "generate_work_request_uuid",
    "ExecutionReceipt",
    "WorkRequestDCO",
]
