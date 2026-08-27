"""Canonical serialization and evaluation fingerprint for the governance envelope.

Spec: `nexus/docs/governance-envelope-serialization.md` (W1.04, ratified
2026-08-27). This is the shared reference implementation (W1.11).

Rules (from the spec):
- compact JSON, keys lexicographically sorted at every level, no trailing newline
- UUIDs -> lowercase canonical 8-4-4-4-12
- timestamps -> RFC3339 UTC with Z and exactly 6 fractional digits
- numbers -> int if integral, else shortest round-trip fixed notation
- decimal strings -> canonical decimal string (no leading zeros, no exponent)
- IRIs -> RFC 3986 6.2.2 syntax-based normalization
- set-ordered arrays sorted by canonical element serialization; ordered arrays preserved
- excluded + unknown top-level keys are stripped (architect ruling 2026-08-27)
- fail closed on NaN/Infinity, relative IRIs, naive timestamps, duplicate keys
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlsplit, urlunsplit


class FingerprintError(ValueError):
    """Raised when an envelope cannot be canonicalized (fail closed)."""


# ---------------------------------------------------------------------------
# field tables (from W1.01 field contract + W1.04 spec)
# ---------------------------------------------------------------------------

UUID_FIELDS = {
    "envelope_id", "subject_id", "workflow_id", "node_id", "work_request_id",
    "lease_id", "grant_id", "attempt_id", "input_snapshot_id",
    "proposition_ids", "doctrine_ids", "posture_ids", "evidence_ids",
    "peb_transaction_id", "admission_receipt_id", "sanctioned_transition_id",
}

TS_FIELDS = {
    "created_at", "effective_at", "input_captured_at", "evaluated_at",
}

IRI_FIELDS = {"@context", "subject_ref"}

# set-ordered array fields (sorted by canonical element serialization)
SET_ARRAY_FIELDS = {
    "proposition_ids", "doctrine_ids", "posture_ids", "frame_values",
    "evidence_ids", "unknowns",
}

# ordered array fields (producer order preserved — evaluation order is
# authority-relevant, architect ruling 2026-08-27)
ORDERED_ARRAY_FIELDS = {"assertion_results", "diagnostics"}

# top-level keys that ARE part of the authority-relevant envelope (W1.01)
ALLOWED_TOP_KEYS = {
    "envelope_version", "envelope_id", "created_at",
    "contract", "semantic", "workflow", "law", "execution",
    "inputs", "evaluation", "evidence", "fingerprint", "authority",
}

# non-authoritative transport metadata + any unknown extension keys —
# deliberately excluded (W1.01 + architect ruling 2026-08-27): their presence
# or absence never changes the fingerprint.
EXCLUDED_TOP_KEYS = {"transport", "metadata", "broker", "headers"}

UUID_RE = re.compile(
    r"^[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}$"
)

DECIMAL_RE = re.compile(r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$")


def norm_uuid(value: str) -> str:
    match = UUID_RE.match(value.strip())
    if not match:
        return value.strip()  # opaque non-UUID identifier (subj-*, wf-*, ...)
    s = value.strip()
    if "-" not in s:
        s = f"{s[0:8]}-{s[8:12]}-{s[12:16]}-{s[16:20]}-{s[20:32]}"
    return s.lower()


def norm_timestamp(value: Any) -> str:
    """RFC3339 UTC with Z and exactly 6 fractional digits."""
    if isinstance(value, (int, float)):
        if value > 1e12:  # epoch microseconds
            value = value / 1e6
        dt = datetime.fromtimestamp(value, tz=timezone.utc)
    elif isinstance(value, str):
        s = value.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except ValueError as exc:
            raise FingerprintError(f"unparseable timestamp: {value!r}") from exc
        if dt.tzinfo is None:
            raise FingerprintError(f"naive timestamp (must carry zone): {value!r}")
        dt = dt.astimezone(timezone.utc)
    else:
        raise FingerprintError(f"unsupported timestamp value: {value!r}")
    return dt.strftime("%Y-%m-%dT%H:%M:%S.%f") + "Z"


def norm_iri(value: str) -> str:
    if not isinstance(value, str):
        raise FingerprintError(f"IRI must be a string: {value!r}")
    s = value.strip()
    parts = urlsplit(s)
    if not parts.scheme or not parts.netloc:
        raise FingerprintError(f"relative IRI in canonical envelope: {s!r}")
    scheme = parts.scheme.lower()
    netloc = parts.netloc.lower()
    if scheme == "http" and netloc.endswith(":80"):
        netloc = netloc[:-3]
    if scheme == "https" and netloc.endswith(":443"):
        netloc = netloc[:-4]
    path = _remove_dot_segments(parts.path)
    return urlunsplit((scheme, netloc, path, parts.query, parts.fragment))


def _remove_dot_segments(path: str) -> str:
    out: list[str] = []
    for seg in path.split("/"):
        if seg in ("", ".", ".."):
            if seg == ".." and out:
                out.pop()
            continue
        out.append(seg)
    return "/".join(out)


def norm_decimal_string(value: str) -> str:
    if not isinstance(value, str):
        raise FingerprintError(f"decimal must be a string: {value!r}")
    s = value.strip()
    if not DECIMAL_RE.match(s):
        raise FingerprintError(f"non-canonical decimal: {value!r}")
    neg = s.startswith("-")
    s = s.lstrip("-")
    if "." in s:
        ip, fp = s.split(".", 1)
        ip = ip.lstrip("0") or "0"
        fp = fp.rstrip("0")
        s = fp and f"{ip}.{fp}" or ip
    else:
        s = s.lstrip("0") or "0"
    if neg and s != "0":
        s = "-" + s
    return s


def norm_number(value: Any) -> Any:
    if isinstance(value, bool):
        raise FingerprintError("booleans are not numbers")
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            raise FingerprintError(f"NaN/Infinity not allowed: {value!r}")
        if value.is_integer():
            return int(value)
        return value
    raise FingerprintError(f"unsupported number: {value!r}")


def norm_string(value: str) -> str:
    s = unicodedata.normalize("NFC", value)
    s = s.lstrip("\ufeff")
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Cf")
    return s


def _canonical_element_sort_key(element: Any) -> str:
    return json.dumps(element, separators=(",", ":"), sort_keys=True,
                      ensure_ascii=False)


def canonicalize(value: Any, key: str | None = None) -> Any:
    """Recursively normalize a value for canonical serialization."""
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        s = norm_string(value)
        if key in UUID_FIELDS:
            return norm_uuid(s)
        if key in TS_FIELDS:
            return norm_timestamp(s)
        if key in IRI_FIELDS:
            return norm_iri(s)
        return s
    if isinstance(value, (int, float)):
        return norm_number(value)
    if isinstance(value, dict):
        return {norm_string(k): canonicalize(v, k) for k, v in value.items()}
    if isinstance(value, list):
        out = [canonicalize(v, key) for v in value]
        if key in SET_ARRAY_FIELDS:
            out.sort(key=_canonical_element_sort_key)
        return out
    raise FingerprintError(
        f"unsupported value type for {key!r}: {type(value).__name__}"
    )


def canonical_json(value: Any) -> str:
    """Compact, key-sorted JSON with no trailing newline."""
    return json.dumps(value, separators=(",", ":"), sort_keys=True,
                      ensure_ascii=False)


def evaluate_fingerprint(envelope: dict[str, Any]) -> str:
    """Return the `evaluation_fingerprint` for an envelope.

    Unknown/extension top-level keys are stripped (architect ruling); the
    remaining authority-relevant envelope is canonicalized and hashed with
    SHA-256. Returns `sha256:` + 64 lowercase hex chars.
    """
    if not isinstance(envelope, dict):
        raise FingerprintError(f"envelope must be an object, got {type(envelope).__name__}")
    stripped = {
        k: v for k, v in envelope.items()
        if k not in EXCLUDED_TOP_KEYS and k in ALLOWED_TOP_KEYS
    }
    canonical = canonicalize(stripped, "envelope")
    payload = canonical_json(canonical)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"sha256:{digest}"