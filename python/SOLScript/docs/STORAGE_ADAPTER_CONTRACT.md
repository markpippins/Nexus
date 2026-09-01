# SOLScript Standalone Storage Adapter Contract

**Cutover item:** 05 — Define standalone SOLScript storage adapter contract
**Owner:** Engineer-II
**Status:** DRAFT (pending architect/engineer review)
**Date:** 2026-09-01

## Purpose

Define the minimal storage adapter and normalized instance-data contract that
SOLScript requires to be a **standalone ontological tool**. The contract has
**no mandatory Nexus or `resolution.*` table dependency**. An adapter is a
small implementation that reads a source of semantic instance data and produces
the normalized contract objects SOLScript consumes.

This decouples SOLScript from any specific database. The same interpreter and
expression engine work identically whether the source is `sol.semantics`, a
`nexus.semantics`/`resolution` datasource, an in-memory fixture, or a future
store — because the adapter normalizes everything into one contract shape.

## Why a contract

Today `solscript.database_loader.DatabaseLoader` is hard-coupled to specific
schema/table names (`resolution.concept`, `resolution.concept_attribute`,
`shrapnel.field`, etc.). That coupling is exactly what the cutover removes:
SOLScript should reason over **normalized semantic instance data**, not over
Nexus's `resolution` duplicate tables.

An adapter sits between the source and the interpreter. It implements the
`SolStoragePort` (below) and returns contract dataclasses. The interpreter
loads from the port; it never sees the source schema.

## Contract scope

The contract must cover, per cutover item 05's completion gate (no mandatory
Nexus or resolution-table dependency):

| Surface | What it carries |
|---------|-----------------|
| **Subjects / entities** | instances of a concept with their attribute values |
| **Concepts** | the type vocabulary, each with typed attributes |
| **Attributes** | per-concept attributes (name, value type, allowed values) |
| **Relationships** | typed edges between concepts/entities |
| **Evidence** | provenance / grounding for facts |
| **Revisions** | supersession/amendment history of an instance |
| **Identity** | stable external identity (canonical asset id) per subject |
| **Temporal context** | valid-time and record-time semantics |
| **Shrapnel facts** | dense per-entity attribute values (EAV-sourced) |

## The port: `SolStoragePort`

A Python `Protocol` (structural typing) that any adapter must satisfy. The
interpreter calls these; each returns contract dataclasses. **No adapter method
may require Nexus or resolution table names.**

```python
from typing import Protocol, List, Optional
from datetime import datetime

class SolStoragePort(Protocol):
    """Standalone storage port SOLScript requires. No Nexus dependency."""

    async def list_concepts(self) -> List[ContractConcept]: ...
    async def list_attributes(self) -> List[ContractAttribute]: ...
    async def list_relationships(self) -> List[ContractRelationship]: ...
    async def list_subjects(self, concept_id: str) -> List[ContractSubject]: ...
    async def list_shrapnel_facts(self) -> List[ContractShrapnelFact]: ...
    async def list_revisions(self, subject_id: str) -> List[ContractRevision]: ...
    async def list_evidence(self) -> List[ContractEvidence]: ...
```

## Contract dataclasses (normalized, schema-agnostic)

These are the single normalized shape every adapter must produce. They are the
**only** surface the interpreter sees.

```python
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from datetime import datetime

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
    value_type: str            # 'text' | 'integer' | 'numeric' | 'boolean' | 'timestamptz' | 'jsonb' | 'uuid'
    allowed_values: List[str] = field(default_factory=list)
    is_state_attribute: bool = False

@dataclass
class ContractRelationship:
    id: str
    from_concept_id: str
    to_concept_id: str
    relationship_type: str
    binding_from_column: Optional[str] = None   # attribute name on the from side
    binding_to_column: Optional[str] = None     # attribute name on the to side

@dataclass
class ContractSubject:
    """An instance of a concept, carrying its attribute values + identity."""
    id: str
    concept_id: str
    external_id: Optional[str] = None
    canonical_asset_id: Optional[str] = None    # stable identity (if source has one)
    attributes: Dict[str, Any] = field(default_factory=dict)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None

@dataclass
class ContractShrapnelFact:
    """A dense per-object attribute set (EAV-sourced)."""
    object_id: str
    attributes: Dict[str, Any] = field(default_factory=dict)
    # identity tie to a subject, if present (e.g. asset_id)

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
    source: str
    content: Optional[str] = None
    captured_at: Optional[datetime] = None
```

## Adapter types

Two concrete adapters must be implementable against this single contract
(cutover items 06 and 07):

1. **SolNativeAdapter** — reads `sol.semantics` (+ `sol.shrapnel`) directly.
   Fully standalone; works with Nexus absent. (item 06)
2. **NexusDatasourceAdapter** — reads a Nexus datasource (e.g. `resolution.*`
   / `nexus.semantics` / `shrapnel`) and produces the **same** normalized
   contract. (item 07)

Because both return identical contract objects, the interpreter is agnostic to
which is plugged in — which is exactly the parity guarantee item 12 tests.

## Mapping table (source → contract)

| Contract object | sol-native source | nexus datasource source |
|-----------------|-------------------|--------------------------|
| ContractConcept | `sol.resolution.concept` | `resolution.concept` |
| ContractAttribute | `sol.resolution.concept_attribute` | `resolution.concept_attribute` |
| ContractRelationship | `sol.resolution.concept_relationship` | `resolution.concept_relationship` |
| ContractSubject | `sol.resolution.<entity table>` | `resolution.<entity table>` |
| ContractShrapnelFact | `sol.shrapnel.object_instance`+`oav` | `shrapnel.object_instance`+`oav` |
| ContractRevision | `sol.resolution.asset_revision` | `resolution.asset_revision` |
| ContractEvidence | `sol.semantics.evidence_item` | `semantics.evidence_item` |

> Note: the column names above are the *current* locations, listed for
> orientation. The contract itself does not name them; adapters resolve them.
> The exact target location for each is subject to the engineer's overlap
> reconciliation report (deliverable 3 of handoff `5e2884db`).

## Completeness gate (cutover 05)

- [ ] Contract contains **no mandatory Nexus or resolution-table dependency** (satisfied: port + dataclasses are schema-agnostic).
- [ ] Every surface in the scope table (subjects, concepts, attributes, relationships, evidence, revisions, identity, temporal, shrapnel) is represented.
- [ ] Two adapter types (sol-native, nexus) are expressible against the same contract.
- [ ] Contract approved by architect/engineer before adapter implementation (06/07).

## Non-goals

- No DDL, no schema changes, no data migration.
- No change to `DatabaseLoader`'s existing Nexus coupling in this item (that is the sol-native vs nexus split handled by 06/07).
- No resolution/SOLScript coupling.