"""Tests for the declarative Shrapnel -> Resolution bridge."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any, List

from solscript import (
    BridgeFieldSlice,
    ShrapnelResolutionBridge,
    read_bridge,
)
from solscript.adapters import ContractShrapnelFact, ContractSubject


class FixturePort:
    """Minimal normalized port used to test the schema-agnostic bridge."""

    def __init__(self, subjects: List[ContractSubject], facts: List[ContractShrapnelFact]) -> None:
        self.subjects = subjects
        self.facts = facts

    async def list_concepts(self) -> list[Any]:
        return []

    async def list_attributes(self) -> list[Any]:
        return []

    async def list_relationships(self) -> list[Any]:
        return []

    async def list_subjects(self, concept_id: str) -> List[ContractSubject]:
        return [s for s in self.subjects if concept_id == "candidate"]

    async def list_shrapnel_facts(self) -> List[ContractShrapnelFact]:
        return self.facts

    async def list_revisions(self, subject_id: str) -> list[Any]:
        return []

    async def list_evidence(self) -> list[Any]:
        return []


def _run(coro: Any) -> Any:
    return asyncio.get_event_loop().run_until_complete(coro)


def _bridge() -> ShrapnelResolutionBridge:
    return ShrapnelResolutionBridge(
        bridge_id="candidate-state",
        version=1,
        resolution_concept_id="candidate",
        fields=(
            BridgeFieldSlice("asset_id", "text", "resolution"),
            BridgeFieldSlice("partial_implementation", "boolean", "shrapnel"),
        ),
    )


def _subject(**kwargs: Any) -> ContractSubject:
    return ContractSubject(
        id=kwargs.pop("id", "candidate-1"),
        concept_id="candidate",
        attributes=kwargs.pop("attributes", {"asset_id": "asset:1"}),
        **kwargs,
    )


def _fact(**kwargs: Any) -> ContractShrapnelFact:
    return ContractShrapnelFact(
        object_id=kwargs.pop("object_id", "state-1"),
        attributes=kwargs.pop("attributes", {"asset_id": "asset:1", "partial_implementation": True}),
    )


def test_bridge_resolves_typed_as_of_read() -> None:
    port = FixturePort([_subject()], [_fact()])
    result = _run(read_bridge(port, _bridge(), asset_id="asset:1", as_of="2026-09-05T00:00:00Z"))

    assert result.status == "resolved"
    assert result.resolved is True
    assert result.fields == {"asset_id": "asset:1", "partial_implementation": True}
    assert {ref["source"] for ref in result.source_refs} == {"resolution", "shrapnel"}


def test_bridge_preserves_explicit_negative_states() -> None:
    bridge = _bridge()

    unknown = _run(read_bridge(FixturePort([], []), bridge, asset_id="asset:missing", as_of="2026-09-05T00:00:00Z"))
    assert unknown.status == "unknown"
    assert unknown.reason == "resolution_subject_not_found"

    stale_subject = _subject(
        valid_from=datetime(2026, 9, 6, tzinfo=timezone.utc),
    )
    stale = _run(read_bridge(FixturePort([stale_subject], [_fact()]), bridge, asset_id="asset:1", as_of="2026-09-05T00:00:00Z"))
    assert stale.status == "stale"
    assert stale.reason == "resolution_subject_not_effective_at_as_of"

    missing_fact = _run(read_bridge(FixturePort([_subject()], []), bridge, asset_id="asset:1", as_of="2026-09-05T00:00:00Z"))
    assert missing_fact.status == "unknown"
    assert missing_fact.reason == "shrapnel_fact_not_found"

    stale_fact = _fact(
        attributes={"asset_id": "asset:1", "partial_implementation": True},
    )
    stale_fact.valid_from = datetime(2026, 9, 6, tzinfo=timezone.utc)
    stale = _run(read_bridge(FixturePort([_subject()], [stale_fact]), bridge, asset_id="asset:1", as_of="2026-09-05T00:00:00Z"))
    assert stale.status == "stale"
    assert stale.reason == "shrapnel_fact_not_effective_at_as_of"

    refusal = _run(read_bridge(FixturePort([_subject()], [_fact()]), bridge, asset_id="asset:1", as_of=None))
    assert refusal.status == "refusal"
    assert refusal.reason == "as_of is required"

    malformed = _run(read_bridge(FixturePort([_subject()], [_fact()]), bridge, asset_id="asset:1", as_of="not-a-timestamp"))
    assert malformed.status == "refusal"
    assert malformed.reason == "as_of must be an ISO-8601 timestamp"


def test_bridge_fails_closed_on_malformed_temporal_bounds() -> None:
    malformed_subject = _subject(valid_from="not-a-timestamp")
    result = _run(
        read_bridge(
            FixturePort([malformed_subject], [_fact()]),
            _bridge(),
            asset_id="asset:1",
            as_of="2026-09-05T00:00:00Z",
        )
    )
    assert result.status == "unavailable"
    assert result.reason == "malformed_resolution_temporal_bounds"

    malformed_fact = _fact()
    malformed_fact.valid_until = "not-a-timestamp"
    result = _run(
        read_bridge(
            FixturePort([_subject()], [malformed_fact]),
            _bridge(),
            asset_id="asset:1",
            as_of="2026-09-05T00:00:00Z",
        )
    )
    assert result.status == "unavailable"
    assert result.reason == "malformed_shrapnel_temporal_bounds"


def test_bridge_fails_closed_on_ambiguity_and_type_mismatch() -> None:
    bridge = _bridge()
    ambiguous = _run(
        read_bridge(
            FixturePort([_subject(), _subject(id="candidate-2")], [_fact()]),
            bridge,
            asset_id="asset:1",
            as_of="2026-09-05T00:00:00Z",
        )
    )
    assert ambiguous.status == "unavailable"
    assert ambiguous.reason == "ambiguous_resolution_membership"

    mismatch = _run(
        read_bridge(
            FixturePort([_subject()], [_fact(attributes={"asset_id": "asset:1", "partial_implementation": "yes"})]),
            bridge,
            asset_id="asset:1",
            as_of="2026-09-05T00:00:00Z",
        )
    )
    assert mismatch.status == "unavailable"
    assert mismatch.reason == "field_type_mismatch: shrapnel.partial_implementation"


def test_bridge_contract_is_deterministic_and_versioned() -> None:
    bridge = _bridge()
    assert bridge.schema_version == 1
    assert bridge.to_dict()["fields"][0] == {
        "name": "asset_id",
        "value_type": "text",
        "source": "resolution",
        "required": True,
    }
    assert bridge.to_dict() == _bridge().to_dict()
