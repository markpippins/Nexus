"""T24 graph-edge → SOL ExecutionClaim/Evidence projection.

Implements the ratified field mapping from decision D-2026-08-23-A
(analyst proposal e9136c4f, section 3), gated by DBA condition C1
(V120__statement_evidence_resolution_proposition.sql — statement_evidence
now admits the guarded resolution_proposition type).

Pure/domain-level: project_edge() returns the SOL envelope for a single
knowledge.graph_edges row. Persistence into semantics.statement_evidence /
evidence_item (with resolution.proposition references) is a separate writer
step and intentionally out of scope here.

Lossless rules enforced (per mapping table):
- (section, entity_id) natural keys always retained, even when asset_id
  is absent.
- Unresolved edges preserve target_id verbatim with null target_section.
- IdentityResolution maps ONLY identity: resolved/unresolved never implies
  semantic disposition — proposition stays Pending without independent
  execution evidence.
- source_migration_id links to knowledge.graph_migrations; absent/unknown
  migration identity yields an explicit PROVENANCE_UNRESOLVED finding,
  never authoritative acceptance.
- Predicates map through the controlled registry only (C4).
"""

from __future__ import annotations

from typing import Any, Mapping


class ControlledPredicateRegistry:
    """C4: predicates enter hard SOL expressions only through this registry."""

    def __init__(self, allowed: set[str] | frozenset[str]) -> None:
        self._allowed = frozenset(allowed)

    def map(self, relation_type: str | None) -> str:
        if relation_type is None or relation_type not in self._allowed:
            raise KeyError(
                f"uncontrolled predicate {relation_type!r} — "
                "arbitrary relation text never enters hard SOL expressions"
            )
        return relation_type


DEFAULT_PREDICATE_REGISTRY = ControlledPredicateRegistry({
    "implements",
    "derived_from",
    "depends_on",
})


def _entity_ref(section: Any, entity_id: Any) -> dict[str, Any]:
    """Natural-key EntityRef: (section, entity_id) always retained."""
    return {
        "section": section,
        "natural_key": entity_id,
        # Nullable bridge to resolution.canonical_asset; null means
        # unresolved cross-system identity, not missing graph identity.
        "canonical_asset_id": None,
    }


def project_edge(edge: Mapping[str, Any]) -> dict[str, Any]:
    """Project one knowledge.graph_edges row into the SOL envelope.

    Raises KeyError on uncontrolled predicates (C4).
    """
    predicate = DEFAULT_PREDICATE_REGISTRY.map(edge.get("relation_type"))

    findings: list[dict[str, Any]] = []
    migration_id = edge.get("source_migration_id")
    if not migration_id:
        findings.append({"code": "PROVENANCE_UNRESOLVED", "field": "source_migration_id"})

    unresolved = edge.get("resolution") == "unresolved"

    claim: dict[str, Any] = {
        "predicate": predicate,
        "proposition": "Pending",
        "subject_ref": _entity_ref(edge.get("source_section"), edge.get("source_id")),
        "object_ref": _entity_ref(edge.get("target_section"), edge.get("target_id")),
        "qualifiers": {
            "graph_edge_properties": edge.get("properties"),
        },
    }

    evidence = [
        {
            "source_record_id": edge.get("id"),
            "kind": "graph_edge",
            "ingestion_run_id": migration_id,
            "unresolved_reason": edge.get("unresolved_reason"),
        }
    ]

    return {
        "execution_claim": claim,
        # IdentityResolution maps ONLY identity — never semantic disposition.
        "identity_resolution": "unresolved" if unresolved else "resolved",
        "evidence": evidence,
        "provenance": {"ingestion_run_id": migration_id},
        "findings": findings,
        # Graph data alone can never authoritatively accept a claim.
        "accepted": False,
    }
