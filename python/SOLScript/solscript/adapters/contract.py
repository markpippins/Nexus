"""Standalone SOLScript storage contract (cutover 05).

Defines the normalized, schema-agnostic contract dataclasses and the
`SolStoragePort` protocol that every adapter satisfies. The interpreter loads
ONLY from this contract — it never sees the source schema. This is what makes
SOLScript a standalone ontological tool with no mandatory Nexus or
`resolution.*` dependency.

Contract surfaces (per cutover 05): subjects/entities, concepts, attributes,
relationships, evidence, revisions, identity, temporal context, and shrapnel
facts.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Protocol, runtime_checkable


# ── Contract dataclasses ────────────────────────────────────────────────────
# These are the ONLY shape the interpreter consumes. Adapters convert their
# source rows into these; source schema/table names never leak past an adapter.

@dataclass
class ContractConcept:
    id: str
    name: str
    description: Optional[str] = None


@dataclass
class ContractAttribute:
    id: str
    concept_id: str
    name: str
    value_type: str  # 'text'|'integer'|'numeric'|'boolean'|'timestamptz'|'jsonb'|'uuid'
    allowed_values: List[str] = field(default_factory=list)
    is_state_attribute: bool = False


@dataclass
class ContractRelationship:
    id: str
    from_concept_id: str
    to_concept_id: str
    relationship_type: str
    binding_from_column: Optional[str] = None
    binding_to_column: Optional[str] = None


@dataclass
class ContractSubject:
    """An instance of a concept with its attribute values + identity."""
    id: str
    concept_id: str
    external_id: Optional[str] = None
    canonical_asset_id: Optional[str] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None


@dataclass
class ContractShrapnelFact:
    """A dense per-object attribute set (EAV-sourced)."""
    object_id: str
    attributes: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContractRevision:
    subject_id: str
    parent_revision_id: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    recorded_until_dt: Optional[datetime] = None


@dataclass
class ContractEvidence:
    id: str
    subject_id: Optional[str] = None
    source: str = ""
    content: Optional[str] = None
    captured_at: Optional[datetime] = None


# ── The port ────────────────────────────────────────────────────────────────

@runtime_checkable
class SolStoragePort(Protocol):
    """Storage port SOLScript requires. No Nexus/resolution-table dependency.

    Every method returns contract dataclasses. The interpreter loads from a
    `SolStoragePort` implementation; the underlying store (sol.semantics,
    a nexus datasource, an in-memory fixture, ...) is invisible to it.
    """

    async def list_concepts(self) -> List[ContractConcept]: ...

    async def list_attributes(self) -> List[ContractAttribute]: ...

    async def list_relationships(self) -> List[ContractRelationship]: ...

    async def list_subjects(self, concept_id: str) -> List[ContractSubject]: ...

    async def list_shrapnel_facts(self) -> List[ContractShrapnelFact]: ...

    async def list_revisions(self, subject_id: str) -> List[ContractRevision]: ...

    async def list_evidence(self) -> List[ContractEvidence]: ...