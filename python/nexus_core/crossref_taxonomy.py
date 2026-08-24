"""
Cross-Reference Relation Type Taxonomy v0.1

Formal enumerated taxonomy of all valid rel_type values for
the nebula.cross_references table.

Spec: audit/SPECS/CROSSREF_TAXONOMY.md
Ontology: schemas/ontology/relationships/wrp-crossref-taxonomy.jsonld
Plan reference: #0175
"""

from typing import Dict, List, Tuple


class CrossReferenceType:
    WRP_DEPENDS_ON = "wrp:depends_on"
    WRP_IMPLEMENTS = "wrp:implements"
    WRP_TRACKED_BY = "wrp:tracked_by"
    WRP_IMPACTS_SYSTEM = "wrp:impacts_system"
    WRP_SUPERSEDES = "wrp:supersedes"

    AG_REFERENCES_PLAN = "ag:references_plan"
    AG_SAME_THREAD_AS = "ag:same_thread_as"
    AG_PROMPTED_BY = "ag:prompted_by"
    AG_SPAWNS_PLAN = "ag:spawns_plan"

    KV_SOURCED_FROM = "kv:sourced_from"
    KV_INFORMS = "kv:informs"
    KV_CROSS_SCHEMA = "kv:cross_schema"
    KV_NAME_OVERLAP = "kv:name_overlap"
    KV_DESCRIPTION_OVERLAP = "kv:description_overlap"


ALL_CROSSREF_TYPES: List[str] = [
    v for k, v in vars(CrossReferenceType).items()
    if k.isupper() and not k.startswith("_")
]

LEGACY_CROSSREF_TYPES = {"depends_on"}
LEGACY_REPLACEMENT: Dict[str, str] = {
    "depends_on": CrossReferenceType.WRP_DEPENDS_ON,
}

TYPE_CONSTRAINTS: Dict[str, Tuple[str, str]] = {
    CrossReferenceType.WRP_DEPENDS_ON: ("plan", "plan"),
    CrossReferenceType.WRP_IMPLEMENTS: ("plan", "work_request"),
    CrossReferenceType.WRP_TRACKED_BY: ("work_request", "plan"),
    CrossReferenceType.WRP_IMPACTS_SYSTEM: ("plan", "system"),
    CrossReferenceType.WRP_SUPERSEDES: ("plan", "plan"),
    CrossReferenceType.AG_REFERENCES_PLAN: ("agent_record", "plan"),
    CrossReferenceType.AG_SAME_THREAD_AS: ("agent_record", "agent_record"),
    CrossReferenceType.AG_PROMPTED_BY: ("agent_record", "prompt"),
    CrossReferenceType.AG_SPAWNS_PLAN: ("harvest_candidate", "plan"),
    CrossReferenceType.KV_SOURCED_FROM: ("knowledge_entity", "harvest"),
    CrossReferenceType.KV_INFORMS: ("harvest", "knowledge_entity"),
    CrossReferenceType.KV_CROSS_SCHEMA: ("embedding", "embedding"),
    CrossReferenceType.KV_NAME_OVERLAP: ("knowledge_entity", "knowledge_entity"),
    CrossReferenceType.KV_DESCRIPTION_OVERLAP: ("knowledge_entity", "knowledge_entity"),
}


def is_valid_crossref_type(value: str) -> bool:
    return value in ALL_CROSSREF_TYPES


def validate_crossref_constraint(
    rel_type: str,
    source_type: str,
    target_type: str,
) -> str:
    """
    Validate cross-reference type constraints.

    Returns empty string on success, or an error message on failure.
    """
    if not is_valid_crossref_type(rel_type):
        allowed = ", ".join(ALL_CROSSREF_TYPES)
        return f'Invalid rel_type "{rel_type}". Allowed values: {allowed}'

    constraint = TYPE_CONSTRAINTS.get(rel_type)
    if constraint is None:
        return ""

    expected_source, expected_target = constraint

    if source_type != expected_source:
        return (
            f'rel_type "{rel_type}" requires source_type="{expected_source}", '
            f'got "{source_type}"'
        )

    if target_type != expected_target:
        return (
            f'rel_type "{rel_type}" requires target_type="{expected_target}", '
            f'got "{target_type}"'
        )

    return ""
