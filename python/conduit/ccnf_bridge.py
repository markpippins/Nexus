"""
CCNF Bridge: Connects Conduit's WorkRequest execution pipeline to the CCNF
reference implementation for deterministic canonicalization and execution receipts.

T21 re-point (D-T21-1): the bridge is now a **caller** of the nexus_core
compile entry point — ``nexus_core.wrp.compile.compile_ccnf_input`` (the
pure-Python, byte-identical mirror of Go ``ccnf.Run``) — instead of shelling
out to the Go ``ccnf-conformance`` binary. There is exactly one emitter in the
system (T21: conduit is a caller, never a second emitter).

When CONDUIT_USE_CCNF=true, the bridge:
  1. Translates a WorkRequestDCO into a CCNF input document (payload.meta namespace)
  2. Compiles it via ``nexus_core.wrp.compile`` → CER (fail-closed)
  3. Extracts the deterministic hash from the CER signature
  4. Builds an ExecutionReceipt from CER + runtime timing (no DCO field access)

The bridge is designed so that all failures are non-fatal — callers catch
CCNFBridgeError and fall back to the non-CCNF path.
"""

from __future__ import annotations

import hashlib
import time
from datetime import datetime
from typing import NamedTuple

from nexus_core.wrp.compile import CompileError, compile_ccnf_input


# ── Exceptions ──────────────────────────────────────────────────────


class CCNFBridgeError(RuntimeError):
    """Raised when the CCNF bridge cannot complete normally.

    Callers catch this and fall back to the non-CCNF path without
    affecting execution semantics.
    """


# ── Typed Result ────────────────────────────────────────────────────


class CCNFResult(NamedTuple):
    """Typed result from a single CCNF conformance call.

    Attributes:
        cer: Full CER dict with all 15 top-level CCNF fields.
        hash: The SHA256 hex digest from cer["signature"]["hash"].
              Guaranteed to match the canonical hash of the CER bytes.
    """

    cer: dict
    hash: str


# ── Compile delegation (T21) ───────────────────────────────────────
# CER emission is delegated to nexus_core.wrp.compile.compile_ccnf_input — the
# single compile entry point (fail-closed, deterministic). The legacy
# ccnf-conformance binary path / timeout config are gone: there is no
# subprocess and no alternate emitter.


# ── Adapter: DCO → CCNF Input ───────────────────────────────────────


class CCNFAdapter:
    """Translate a WorkRequestDCO dict into the CCNF input document format.

    The full DCO is embedded under ``payload.meta.work_request`` as opaque
    provenance metadata. This namespace is separate from ``payload.data``
    (which requires valid ``type:id`` artifact IDs with a colon separator)
    and is preserved intact by the CCNF canonicalization pipeline.
    """

    @staticmethod
    def from_work_request(dco_dict: dict) -> dict:
        """Translate a WorkRequestDCO dict into a CCNF input document.

        Preconditions:
            - *dco_dict* is a non-None dict
            - *dco_dict["id"]* exists and is a non-empty string

        Postconditions:
            - Returns a dict containing all five required top-level keys:
              ``event_id``, ``actor``, ``intent``, ``domain``, ``timestamp``
            - ``result["intent"]["action"] == "execute"`` (controlled vocabulary)
            - ``result["domain"] == "execution"``
            - ``result["timestamp"] > 0``
            - ``dco_dict`` is **not** mutated
        """
        wr_id = dco_dict.get("id", "")
        if not isinstance(wr_id, str) or not wr_id:
            raise CCNFBridgeError("DCO 'id' must be a non-empty string")

        meta = dco_dict.get("metadata") or {}
        agent_id = meta.get("agent_id") or "conduit"
        lineage = dco_dict.get("lineage") or {}
        derived = lineage.get("derived_from") or []

        # Parse created_at ISO-8601 to epoch seconds; fall back to now
        created_at_str = meta.get("created_at")
        ts = _parse_timestamp(created_at_str)

        result: dict = {
            "event_id": wr_id,
            "actor": {"type": "system", "id": agent_id},
            "intent": {
                "action": "execute",
                "target_type": "workrequest",
                "target_id": f"workrequest:{wr_id}",
            },
            "domain": "execution",
            "timestamp": ts,
            "payload": {
                "data": {},
                "meta": {
                    "work_request": dco_dict,
                },
            },
        }

        if derived:
            result["causality"] = {"parent_event_ids": derived}

        return result


# ── Subprocess Invocation ────────────────────────────────────────────


def call_ccnf_conformance(
    input_dict: dict,
    binary_path: str | None = None,
) -> CCNFResult:
    """Compile a CCNF input document through nexus_core.wrp.compile and return
    the CER with its deterministic hash.

    T21 re-point (D-T21-1): emission is delegated to
    ``nexus_core.wrp.compile.compile_ccnf_input`` — the single compile entry
    point (fail-closed). There is no subprocess and no Go binary dependency.

    *binary_path* is retained for backward compatibility with existing callers
    (``executor_cloud.py``) but is **ignored** — the pure-Python compiler is
    authoritative; no divergent emission remains.

    Preconditions:
        - *input_dict* is a dict with the four required CCNF top-level fields
          (actor, intent, domain, event_id)

    Postconditions:
        - Returns a :class:`CCNFResult` with the parsed CER dict and hash.
        - Raises :class:`CCNFBridgeError` if the input cannot be compiled
          (missing fields, invalid intent, version mismatch, non-finite
          numbers, ...) — the fail-closed :class:`CompileError` is wrapped so
          callers keep the same fall-back contract.
        - No filesystem side effects.
    """
    try:
        cer = compile_ccnf_input(input_dict)
    except CompileError as e:
        raise CCNFBridgeError(f"ccnf compile failed: {e}") from e

    sig = cer.get("signature") or {}
    h = sig.get("hash")
    if not isinstance(h, str) or not h:
        raise CCNFBridgeError("CER missing or empty signature.hash")

    return CCNFResult(cer=cer, hash=h)


# ── Hash Extraction ──────────────────────────────────────────────────


def deterministic_hash(cer_json: dict) -> str:
    """Extract the canonical hash from a CER JSON dict.

    This is a pure projection of ``cer_json["signature"]["hash"]``.
    New code should prefer the :class:`CCNFResult` returned by
    :func:`call_ccnf_conformance`.

    Preconditions:
        - ``cer_json["signature"]["hash"]`` is a non-empty hex string

    Postconditions:
        - Returns ``cer_json["signature"]["hash"]`` unchanged
        - Same *cer_json* always yields the same return value
        - Raises :class:`CCNFBridgeError` if the hash is absent or empty
    """
    sig = cer_json.get("signature") or {}
    h = sig.get("hash") or ""
    if not h:
        raise CCNFBridgeError("CER signature.hash is empty or missing")
    return h


# ── Receipt Builder ──────────────────────────────────────────────────


class CERBinder:
    """Build an ``ExecutionReceipt`` dict from CER output and execution context.

    The receipt is a **CER projection** — it consumes only CER fields
    (``signature.hash``, ``identity.entity_key``) plus runtime timing
    and status. It never accesses DCO internals.
    """

    @staticmethod
    def attach_execution(
        cer_json: dict,
        session_id: str,
        plan_id: str,
        wr_id: str,
        status: str,
        started_at: int,
        completed_at: int,
        failure_code: str | None = None,
        failure_message: str | None = None,
    ) -> dict:
        """Build an ExecutionReceipt dict from CER output and execution timing.

        Preconditions:
            - ``cer_json`` contains ``signature.hash`` (non-empty)
            - *wr_id* is a non-empty string
            - *started_at* > 0
            - *completed_at* >= *started_at*
            - *status* is one of ``"SUCCESS"``, ``"FAILURE"``, ``"PARTIAL"``

        Postconditions:
            - ``receipt["ccnf_hash"] == cer_json["signature"]["hash"]``
            - ``receipt["request_id"] == wr_id``
            - ``receipt["timing"]["duration_ms"] == (completed_at - started_at) * 1000``
            - For ``SUCCESS`` / ``PARTIAL``: ``failure`` is *None*,
              ``replay_binding_hash`` is a non-empty hex string.
            - For ``FAILURE``: ``failure`` is a non-None dict,
              ``trace_event_count`` is 0.
        """
        sig = cer_json.get("signature") or {}
        ccnf_hash = sig.get("hash", "")
        if not ccnf_hash:
            raise CCNFBridgeError("CER signature.hash is empty")

        if not wr_id:
            raise CCNFBridgeError("wr_id must be non-empty")

        if started_at <= 0:
            raise CCNFBridgeError("started_at must be > 0")

        if completed_at < started_at:
            raise CCNFBridgeError("completed_at must be >= started_at")

        if status not in ("SUCCESS", "FAILURE", "PARTIAL"):
            raise CCNFBridgeError(f"Invalid status: {status}")

        entity_key = cer_json.get("identity", {}).get("entity_key", "")
        duration_ms = (completed_at - started_at) * 1000

        if status in ("SUCCESS", "PARTIAL"):
            replay_binding = _compute_replay_binding(entity_key, entity_key, 1, 1)
            trace_count = 1
            failure_node = None
        else:
            replay_binding = ""
            trace_count = 0
            failure_node = {
                "code": failure_code or "HARNESS_FAILURE",
                "message": failure_message or "Harness exited with failure",
            }

        receipt: dict = {
            "request_id": wr_id,
            "ccnf_hash": ccnf_hash,
            "cer_root_hash": entity_key,
            "trace_root_hash": entity_key,
            "trace_event_count": trace_count,
            "replay_binding_hash": replay_binding,
            "status": status,
            "failure": failure_node,
            "timing": {
                "started_at": started_at,
                "completed_at": completed_at,
                "duration_ms": duration_ms,
            },
            "ccnf_version": 1,
        }

        return receipt


# ── Internal Helpers ─────────────────────────────────────────────────


def _parse_timestamp(iso_str: str | None) -> int:
    """Parse an ISO-8601 string to epoch seconds; fall back to ``time.time()``.

    Handles:
    - Strings ending with ``Z`` (UTC marker)
    - Full ISO-8601 with offset (e.g., ``2025-01-15T10:30:00+00:00``)
    - *None* or unparseable input → current time
    """
    if iso_str:
        try:
            cleaned = iso_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(cleaned)
            ts = int(dt.timestamp())
            if ts > 0:
                return ts
        except (ValueError, TypeError):
            pass
    return int(time.time())


def _compute_replay_binding(
    cer_root: str,
    trace_root: str,
    trace_count: int,
    binding_version: int,
) -> str:
    """Domain-separated SHA256 hash identifying this execution trace.

    For the single-event bridge (v1), *cer_root* and *trace_root* are
    the same value (the CER's ``entity_key``). The domain separator
    ``b"nexus.ccnf.replay_binding.v1"`` ensures the hash is distinct
    from any other hash in the system.
    """
    h = hashlib.sha256()
    h.update(b"nexus.ccnf.replay_binding.v1")
    h.update(cer_root.encode("utf-8"))
    h.update(trace_root.encode("utf-8"))
    h.update(str(trace_count).encode("utf-8"))
    h.update(str(binding_version).encode("utf-8"))
    return h.hexdigest()


__all__ = [
    "CCNFAdapter",
    "CCNFBridgeError",
    "CCNFResult",
    "CERBinder",
    "call_ccnf_conformance",
    "deterministic_hash",
]
