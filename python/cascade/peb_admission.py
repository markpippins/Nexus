"""peb_admission.py — advisory record-then-act bridge (PEB-forward Phase 1).

Every gate outcome (sol_gate.evaluate_lease_dispatch, promotion gate
checks) is recorded into ``peb.transactions`` *before* the caller acts on
the result.  Ordering is the point: recording makes PEB causally upstream
instead of downstream and gives halt criterion 2 (witnessed-run
attribution) a real evidence trail.

Phase 1 is **advisory only** — a recording failure must never flip a gate
outcome.  All errors are swallowed (logged) and the DB call is bounded by
a hard timeout, so the gate degrades to its exact prior behavior when
PostgreSQL (or docker) is unreachable.

Two write paths, in order:

1. ``resolution.admit_and_record`` (the canonical bridge; live 6-arg
   signature).  Its live implementation is coupled to the resolution
   entity model — it requires an existing ``concept_state_transition``
   and a canonical_asset-backed entity row.  Gate entities (leases /
   harvest candidates) are in-memory SOL evaluations, not canonical
   assets, so this path raises for them.

2. Direct advisory ``INSERT INTO peb.transactions`` (ON CONFLICT
   idempotency_key DO NOTHING) — the exact row shape the bridge function
   itself writes.  This guarantees the evidence trail lands even when
   the entity isn't materialized in resolution, while leaving every
   resolution/PEB surface frozen.
"""

from __future__ import annotations

import json
import subprocess
import sys
import time
import uuid
from typing import Any, List, Optional

# Same host-side psql pathway the promotion gate uses to reach the nexus
# DB (docker exec into the pgvector_db container).  Module-level so tests
# can swap it, mirroring promotion_gate._PSQL.
_PSQL: List[str] = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus", "-t", "-A", "-q",
]

_RECORD_TIMEOUT_S = 4.0


def _esc(v: str) -> str:
    """Single-quote escape for embedding into a psql -c command string."""
    return v.replace("\\", "\\\\").replace("'", "''")


def _admit_via_function(
    cmd: List[str],
    *,
    tid: str,
    idem_key: str,
    entity_id: str,
    gate: str,
    input_json: str,
) -> bool:
    """Path 1 — canonical resolution.admit_and_record (best-effort)."""
    sql = (
        "SELECT resolution.admit_and_record("
        f"'{tid}', '{_esc(idem_key)}', '{_esc(str(entity_id))}', "
        f"'{_esc(gate)}', '{_esc(input_json)}'::jsonb, NULL::uuid);"
    )
    proc = subprocess.run(
        cmd + ["-c", sql],
        capture_output=True,
        text=True,
        timeout=_RECORD_TIMEOUT_S,
    )
    if proc.returncode == 0:
        return True
    # Log the reason for the fallback only at debug level: entities that
    # aren't canonical assets raise here by design (no state transition /
    # no asset), which is the normal case for Python gate entities.
    return False


def _addition_direct(
    cmd: List[str],
    *,
    tid: str,
    idem_key: str,
    entity_id: str,
    gate: str,
    admitted: bool,
    reason: str,
    input_json: str,
) -> bool:
    """Path 2 — direct advisory insert with the bridge's row shape."""
    result = "ADMITTED" if admitted else "REJECTED"
    sql = (
        "INSERT INTO peb.transactions "
        "(id, idempotency_key, entity_id, admission_result, tool_name, input, created_at) "
        "VALUES "
        f"('{tid}', '{_esc(idem_key)}', '{_esc(str(entity_id))}', "
        f"'{result}', '{_esc(gate)}', '{_esc(input_json)}'::jsonb, now()) "
        "ON CONFLICT (idempotency_key) DO NOTHING;"
    )
    proc = subprocess.run(
        cmd + ["-c", sql],
        capture_output=True,
        text=True,
        timeout=_RECORD_TIMEOUT_S,
    )
    return proc.returncode == 0


def record_gate_outcome(
    *,
    gate: str,
    entity_id: str,
    admitted: bool,
    reason: str,
    payload: dict,
    psql: Optional[List[str]] = None,
) -> bool:
    """Best-effort record of one gate outcome.

    Tries ``resolution.admit_and_record`` first (canonical path) and
    falls back to a direct advisory ``peb.transactions`` row carrying the
    same shape (idempotency_key dedupes repeats; the table has a UNIQUE
    constraint on it).  Never raises; returns True when a row landed or
    already existed, False on any failure.
    """
    cmd = psql if psql is not None else _PSQL
    try:
        tid = str(uuid.uuid4())
        idem_key = f"{gate}:{entity_id}:{int(time.time())}"
        input_json = json.dumps(payload, default=str)

        if _admit_via_function(
            cmd, tid=tid, idem_key=idem_key, entity_id=entity_id,
            gate=gate, input_json=input_json,
        ):
            return True
        return _addition_direct(
            cmd, tid=tid, idem_key=idem_key, entity_id=entity_id,
            gate=gate, admitted=admitted, reason=reason, input_json=input_json,
        )
    except Exception as exc:  # noqa: BLE001 — advisory path must never raise
        print(f"[peb_admission] record skipped ({gate}): {exc}", file=sys.stderr)
        return False