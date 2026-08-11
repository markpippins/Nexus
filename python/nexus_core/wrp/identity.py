"""
Pure-Python CCNF entity-key derivation — zero-dep mirror of the Go reference.

Mirrors `go/wrp/ccnf-ref/ccnf/serializer.go` (CanonicalJSON),
`go/wrp/ccnf-ref/ccnf/intents.go` (NormalizeIntent) and
`go/wrp/ccnf-ref/ccnf/identity.go` (DeriveIdentity / hashEntitySignature /
domainToScope) so that a WorkRequest's content identity can be derived at
WRP compile time in a pure, cross-kernel-safe module — no Go binary, no DB,
no network. The Go binary (`ccnf-conformance process`) and the Rust verifier
remain the conformance-verification authority; this module produces the same
bytes so `entity_key` is available to non-conduit kernels from birth.

The Go binary's `process` pipeline normalizes the intent (controlled
vocabulary) BEFORE deriving identity, so the compile-time emission path must
mirror that too — use ``emit_identity()`` (normalize + derive) to match the
binary byte-for-byte.

Cross-language parity is guarded by wr-conf-010
(test_conformance_ccnf_identity.py), which derives the same input through
this module, the Go binary, and the Rust verifier and asserts all three
agree.

Usage::

    from nexus_core.wrp.identity import emit_identity

    doc = {
        "event_id": "wr-0001",
        "actor": {"type": "system", "id": "conduit"},
        "intent": {"action": "execute", "target_type": "workrequest",
                   "target_id": "workrequest:wr-0001"},
        "domain": "execution",
        "timestamp": 1720000000,
    }
    entity_key, event_type, scope = emit_identity(doc)
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional, Tuple

__all__ = [
    "canonical_json",
    "domain_to_scope",
    "derive_entity_key",
    "derive_identity",
    "emit_identity",
    "ccnf_input_from_intent_string",
    "ccnf_input_from_dco_json",
    "normalize_intent",
]

_HEX_CHARS = "0123456789abcdef"


def canonical_json(value: Any) -> str:
    """CanonicalJSON — byte-identical to Go ``ccnf.CanonicalJSON``.

    Rules mirrored from serializer.go::

      nil     -> "null"
      bool    -> "true" / "false"
      int     -> decimal
      float64 -> strconv.FormatFloat(f, 'f', -1, 64), then
                 "null" if the result contains e/E, else as-is
      string  -> quoted, with \\", \\\\, \\n, \\r, \\t and \\u00XX for < 0x20
      []any   -> [a,b,c]
      map     -> sorted keys, {"k":v,...}
      default -> "null"
    """
    return _encode(value)


def _encode(value: Any) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    # NB: bool is a subclass of int in Python — must check bool BEFORE int,
    # matching Go's switch order (nil, bool, int...).
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return _encode_float(value)
    if isinstance(value, str):
        return _encode_string(value)
    if isinstance(value, list):
        return _encode_array(value)
    if isinstance(value, dict):
        return _encode_map(value)
    # Go's default case for unknown types (no tuple equivalent).
    return "null"


def _encode_float(f: float) -> str:
    # Go: strconv.FormatFloat(f, 'f', -1, 64) — shortest FIXED-point form, so
    # it never contains an exponent (the e/E branch in Go's encodeFloat is
    # dead code for 'f' format). Python's repr() is shortest-general and may
    # use exponents, so expand those to fixed notation.
    s = repr(f)
    if "e" in s or "E" in s:
        # Caveat: :.17f is not Go's exact shortest-fixed for extreme values
        # (e.g. subnormals collapse to "0") — realistic CCNF docs (timestamps,
        # priorities, confidence) never hit this.
        s = f"{f:.17f}"
    # Integral floats render as integers (Go returns as-is when no '.').
    if "." in s:
        s = s.rstrip("0").rstrip(".")
        if s in ("", "-"):
            s = "0"
    return s


def _encode_string(s: str) -> str:
    out: List[str] = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\r":
            out.append("\\r")
        elif ch == "\t":
            out.append("\\t")
        elif o < 0x20:
            out.append("\\u00")
            out.append(_HEX_CHARS[o >> 4])
            out.append(_HEX_CHARS[o & 0x0F])
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def _encode_array(arr: List[Any]) -> str:
    if arr is None:
        return "null"
    return "[" + ",".join(_encode(v) for v in arr) + "]"


def _encode_map(m: Dict[str, Any]) -> str:
    parts: List[str] = []
    for key in sorted(m.keys()):
        parts.append(_encode_string(key) + ":" + _encode(m[key]))
    return "{" + ",".join(parts) + "}"


_CONTROLLED_VOCAB = frozenset({
    "create", "update", "delete", "execute", "validate", "emit",
})


def normalize_intent(intent: Any) -> Dict[str, Any]:
    """Mirror of Go ``NormalizeIntent`` (intents.go).

    Validates the intent action against the controlled vocabulary and returns
    the normalized form ``{type: normalized_verb, action, target_type,
    target_id}``. Raises ``ValueError`` for free-text intents, empty actions,
    or actions outside the controlled vocabulary (same failures as the Go
    binary's INTENT_NORMALIZATION_FAILURE).
    """
    if not isinstance(intent, dict):
        if isinstance(intent, str):
            raise ValueError(
                f"cannot normalize intent: free-text intent {intent!r} cannot be mapped")
        raise ValueError(
            f"cannot normalize intent: unexpected intent type {type(intent).__name__}")
    action = intent.get("action", "")
    if not isinstance(action, str) or action == "":
        raise ValueError("cannot normalize intent: empty action in intent")
    if action not in _CONTROLLED_VOCAB:
        raise ValueError(f"cannot normalize intent: unknown action {action!r}")
    return {
        "type": "normalized_verb",
        "action": action,
        "target_type": intent.get("target_type", ""),
        "target_id": intent.get("target_id", ""),
    }


def domain_to_scope(domain: str) -> str:
    """Mirror of Go ``domainToScope``."""
    if domain == "execution":
        return "executiongraph.v2"
    if domain == "specification":
        return "specification.v1"
    if domain == "system":
        return "system.v1"
    return domain + ".v1"


def _hash_entity_signature(fields: Dict[str, Any]) -> str:
    h = hashlib.sha256()
    for key in sorted(fields.keys()):
        h.update(key.encode("utf-8"))
        h.update(b"\x00")
        h.update(canonical_json(fields[key]).encode("utf-8"))
        h.update(b"\x00")
    return h.hexdigest()


def derive_identity(doc: Dict[str, Any]) -> Tuple[str, str, str]:
    """Mirror of Go ``DeriveIdentity``.

    Returns ``(entity_key, event_type, scope)``. Raises ``ValueError`` when
    the document carries no ``intent.action`` (same error as the Go source).

    Note: ``scope`` in the identity signature is the DERIVED scope
    (``domain_to_scope(domain)``), NOT the raw input ``scope`` — this matches
    the Go reference exactly and is asserted by wr-conf-010.
    """
    # Coerce like Go's getString/getMap before hashing: non-string domain
    # becomes "", non-dict actor becomes nil ("null" in CanonicalJSON).
    raw_domain = doc.get("domain", "")
    domain = raw_domain if isinstance(raw_domain, str) else ""
    scope = domain_to_scope(domain)
    raw_intent = doc.get("intent")
    intent = raw_intent if isinstance(raw_intent, dict) else {}
    if not intent.get("action"):
        raise ValueError("cannot derive identity: no action in intent")
    raw_actor = doc.get("actor")
    actor = raw_actor if isinstance(raw_actor, dict) else None

    fields: Dict[str, Any] = {
        "domain": domain,
        "intent": intent,
        "actor": actor,
        "scope": scope,
    }
    entity_key = _hash_entity_signature(fields)
    return entity_key, "event", scope


def derive_entity_key(doc: Dict[str, Any]) -> str:
    """Return just the entity_key for a CCNF input document.

    Delegates to ``emit_identity`` (normalize + derive) so the convenience
    API always matches the canonical emission path and the Go binary — never
    the raw ``derive_identity`` (which is only a low-level mirror and must
    not be used for emitted keys).
    """
    entity_key, _, _ = emit_identity(doc)
    return entity_key


def emit_identity(doc: Dict[str, Any]) -> Tuple[str, str, str]:
    """Compile-time emission: normalize intent, then derive identity.

    Matches the Go binary's ``process`` pipeline byte-for-byte — the binary
    runs ``NormalizeIntent`` and writes the normalized intent back into the
    document before ``DeriveIdentity``. Use this (not ``derive_identity``
    alone) when the goal is cross-language parity.
    """
    normalized = normalize_intent(doc.get("intent"))
    doc = dict(doc)
    doc["intent"] = normalized
    return derive_identity(doc)


def _wr_ccnf_input(wr_id: str, agent_id: str = "conduit") -> Dict[str, Any]:
    """Canonical CCNF input shape for a WorkRequest identity.

    A WR is a system ``execute`` action on its ``workrequest`` target. The
    identity hashes only ``{domain, intent, actor, scope}`` (Go
    ``DeriveIdentity``), so this document is deterministic and stable across
    re-derivation — no timestamp or payload is required. Mirrors
    ``tackle.vision_bridge._dco_ccnf_input`` (and the ``ccnf_bridge``
    adapter) so a backfilled key equals the key the WR would have received
    at birth.
    """
    return {
        "event_id": wr_id,
        "actor": {"type": "system", "id": agent_id},
        "intent": {
            "action": "execute",
            "target_type": "workrequest",
            "target_id": f"workrequest:{wr_id}",
        },
        "domain": "execution",
    }


def ccnf_input_from_intent_string(intent: str, wr_id: str = "") -> Dict[str, Any]:
    """Build the CCNF input document for a WR born from an intent string.

    LOSM-style WRs carry ``intent`` as free text (never a controlled verb), so
    the document wraps it as a system ``execute`` action on the WR's own
    ``workrequest`` target — the same canonical shape the bridge emits at
    creation. ``wr_id`` becomes event_id + target_id so the key is per-WR;
    ``intent`` is recorded as the document ``payload`` for provenance only
    (the identity never hashes it). ``emit_identity`` on the result never
    raises (the action is the controlled verb ``execute``).

    Args:
        intent: The caller-supplied intent string (free text).
        wr_id: The WR's stable id (its ``vision.work_requests.wr_id``).
    """
    doc = _wr_ccnf_input(wr_id)
    if intent:
        doc["payload"] = {"intent_source": intent}
    return doc


def ccnf_input_from_dco_json(dco_json: str, wr_id: str = "") -> Dict[str, Any]:
    """Build the CCNF input document for a stored WorkRequest DCO.

    Used to re-derive (backfill) the entity_key of a pre-existing
    ``vision.work_requests`` row. The document mirrors the canonical WR shape,
    so the backfilled key equals the key the WR would have received at birth.
    ``wr_id`` (the row's ``vision.work_requests.wr_id``) wins; when omitted,
    an ``id``/``wrId`` embedded in the DCO JSON is used instead.

    Args:
        dco_json: The stored ``dco_json`` (JSON string or dict).
        wr_id: The WR's stable id, if known.
    """
    if not wr_id:
        try:
            parsed = json.loads(dco_json) if isinstance(dco_json, str) else dco_json
        except (TypeError, ValueError):
            parsed = {}
        if isinstance(parsed, dict):
            wr_id = parsed.get("id") or parsed.get("wrId") or ""
    return _wr_ccnf_input(wr_id)
