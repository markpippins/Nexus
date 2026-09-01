"""Governance admission envelope canonical serialization and evaluation fingerprint.

Implements W1.04 (ratified 2026-08-27) — the deterministic canonicalization and
hashing rules for the governance admission envelope. The fingerprint is stable
across Python, JVM, SQL, replay, and transport projections, and changes when
any authority-relevant input changes.

The serialization rules mirror the ratified CCNF canonical serialization
contract (`nexus/go/wrp/ccnf-ref/SERIALIZATION_CONTRACT.md`).
"""

from .admission import AdmissionAssessment, AdmissionError, assess_candidate, envelope_from_candidate
from .binding import (
    BindingDecision,
    BindingValidationError,
    binding_idempotency_key,
    validate_binding_decision,
)
from .canonical import (
    canonical_json,
    canonicalize,
    evaluate_fingerprint,
    FingerprintError,
    ALLOWED_TOP_KEYS,
    EXCLUDED_TOP_KEYS,
)

__all__ = [
    "canonical_json",
    "canonicalize",
    "evaluate_fingerprint",
    "FingerprintError",
    "ALLOWED_TOP_KEYS",
    "EXCLUDED_TOP_KEYS",
    "AdmissionAssessment",
    "AdmissionError",
    "assess_candidate",
    "envelope_from_candidate",
    "BindingDecision",
    "BindingValidationError",
    "binding_idempotency_key",
    "validate_binding_decision",
    "__version__",
]

__version__ = "0.1.0"