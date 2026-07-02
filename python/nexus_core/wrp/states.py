"""
WRP state machine primitives — canonical adjacency matrix and receipt mapping.

# CANONICAL SOURCE
These tables are the canonical Python definition of the WRP state machine.
They are kept in sync with the TypeScript canonical:
    typescript/conduit-mcp/src/receipts.ts           (receipt transitions)
    typescript/nebula-mcp/src/conduit-wrp-contract.ts (WRP states)

Do not edit these tables independently — reconcile against the TypeScript
canonical if changes are needed.

# SEMANTICS
WRP_ADJACENCY_MATRIX: The 12-state WRP state machine defining which state
transitions are valid. Every transition must be registered here.

RECEIPT_TO_WRP_STATE: Maps Conduit receipt types to their corresponding
WRP states. A receipt type indicates "what happened"; the WRP state is
"what state the plan is now in" after the transition.
"""

from typing import Dict, Set


# ── The WRP adjacency matrix ──────────────────────────────────────────
# 12 states: CREATED → INTAKE → PLANNING → CRITIQUE → SPECIFICATION →
# APPROVED → QUEUED → EXECUTING → COMPLETED → ARCHIVED + FAILED

WRP_ADJACENCY_MATRIX: Dict[str, Set[str]] = {
    "CREATED":       {"INTAKE", "FAILED"},
    "INTAKE":        {"PLANNING", "FAILED"},
    "PLANNING":      {"CRITIQUE", "FAILED"},
    "CRITIQUE":      {"PLANNING", "SPECIFICATION", "FAILED"},
    "SPECIFICATION": {"CRITIQUE", "APPROVED", "FAILED"},
    "APPROVED":      {"SPECIFICATION", "QUEUED", "FAILED"},
    "QUEUED":        {"EXECUTING", "FAILED"},
    "EXECUTING":     {"COMPLETED", "FAILED"},
    "COMPLETED":     {"ARCHIVED"},   # NB: FAILED not valid from COMPLETED — terminal success
    "ARCHIVED":      set(),
    "FAILED":        set(),
}


# ── Transition validation ─────────────────────────────────────────────


def is_valid_transition(from_state: str, to_state: str) -> bool:
    """Check if a WRP state transition is valid per the adjacency matrix."""
    allowed = WRP_ADJACENCY_MATRIX.get(from_state, set())
    return to_state in allowed


# ── Receipt type to WRP state mapping ─────────────────────────────────
# Maps each Conduit receipt type to the WRP state it represents.

RECEIPT_TO_WRP_STATE: Dict[str, str] = {
    "PROPOSED":       "CREATED",
    "PLANNING":       "INTAKE",
    "PLAN_CREATE":    "PLANNING",
    "CRITIQUE":       "CRITIQUE",
    "CRITIQUE_PASS":  "SPECIFICATION",
    "CRITIQUE_REJECT": "PLANNING",
    "IMPLEMENTATION": "EXECUTING",
    "CCNF_EXECUTION": "EXECUTING",
    "REVIEW":         "APPROVED",
    "REVIEW_PASS":    "COMPLETED",
    "REVIEW_REJECT":  "EXECUTING",
    "BLOCK":          "FAILED",
    "PLAN_BLOCK":     "FAILED",
    "API_LIMIT":      "FAILED",
    "HOLD":           "QUEUED",
    "REQUEUED":       "QUEUED",
    "CANCELLED":      "ARCHIVED",
    "ABANDONED":      "FAILED",
}
