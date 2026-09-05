"""Compatibility imports for the pre-W9 candidate-state module name.

The implementation is now domain-generic and lives in ``state_bridge``.
This module remains intentionally small so existing integrations can migrate
without a flag day.
"""

from .state_bridge import (
    ASSET_ID_ATTR,
    STATE_BRIDGE_IDENTITY_ATTR,
    STATE_BRIDGE_NAMESPACE,
    CANDIDATE_CONCEPT_NAME,
    CANDIDATE_RELATIONSHIP_NAME,
    CANDIDATE_RELATIONSHIP_TYPE,
    CANDIDATE_STATE_MEMBERS,
    CANDIDATE_STATE_NAMESPACE,
    STATE_CONCEPT_NAME,
    build_member_exists_expression,
    deterministic_seed_members,
    deterministic_state_members,
    ensure_candidate_state_model,
    ensure_state_bridge_model,
    evaluate_candidate_state_members,
    evaluate_state_members,
)

__all__ = [
    "ASSET_ID_ATTR",
    "STATE_BRIDGE_IDENTITY_ATTR",
    "STATE_BRIDGE_NAMESPACE",
    "CANDIDATE_CONCEPT_NAME",
    "CANDIDATE_RELATIONSHIP_NAME",
    "CANDIDATE_RELATIONSHIP_TYPE",
    "CANDIDATE_STATE_MEMBERS",
    "CANDIDATE_STATE_NAMESPACE",
    "STATE_CONCEPT_NAME",
    "build_member_exists_expression",
    "deterministic_seed_members",
    "deterministic_state_members",
    "ensure_candidate_state_model",
    "ensure_state_bridge_model",
    "evaluate_candidate_state_members",
    "evaluate_state_members",
]
