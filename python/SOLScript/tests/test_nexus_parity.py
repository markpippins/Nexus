"""Tests for the NexusDatasourceAdapter + cross-database parity (cutover 07, 12).

- 07: NexusDatasourceAdapter produces normalized contract objects from nexus-
  shaped source rows (same locations as sol-native).
- 12: parity — identical fixtures through sol-native and nexus adapters yield
  identical normalized contract output (same shape, same values).

Uses fake asyncpg-style pools with scripted rows; no live DB required.
"""

from __future__ import annotations

from typing import Any, List

import pytest

from solscript.adapters import (
    ContractConcept,
    ContractShrapnelFact,
    ContractSubject,
    NexusDatasourceAdapter,
    SolNativeAdapter,
)

from .conftest import FakeConn, FakePool, _row, _run


# A scripted dataset in nexus shape.
_NEXUS_CONCEPT_SCRIPT = [
    [_row(id="c1", name="Bike", description="bicycle")],
]

_NEXUS_SUBJECT_SCRIPT = [
    [_row(schema_name="resolution", table_name="bike")],
    [
        _row(id="s1", asset_id="asset:bike:1", external_id="b1", frame_material="steel"),
        _row(id="s2", asset_id="asset:bike:2", external_id="b2", frame_material="carbon"),
    ],
]

_NEXUS_SHRAPNEL_SCRIPT = [
    [
        _row(object_id=1, created_at=None, field_name="tire_clearance", field_type_code=3,
             value_type_code=3, value_id=10),
    ],
    [_row(value=2.4)],
]


def test_nexus_adapter_normalizes_concepts() -> None:
    adapter = NexusDatasourceAdapter(
        dsn="", pool=FakePool(FakeConn([list(_NEXUS_CONCEPT_SCRIPT[0])]))
    )
    concepts = _run(adapter.list_concepts())
    assert len(concepts) == 1
    assert isinstance(concepts[0], ContractConcept)
    assert concepts[0].name == "Bike"


def test_nexus_adapter_implements_port() -> None:
    from solscript.adapters.contract import SolStoragePort

    adapter = NexusDatasourceAdapter(dsn="", pool=None)
    assert isinstance(adapter, SolStoragePort)  # runtime_checkable Protocol


def test_parity_concepts_sol_vs_nexus() -> None:
    """Identical fixture -> identical normalized contract (cutover 12)."""
    sol = SolNativeAdapter(dsn="", pool=FakePool(FakeConn([list(_NEXUS_CONCEPT_SCRIPT[0])])))
    nex = NexusDatasourceAdapter(dsn="", pool=FakePool(FakeConn([list(_NEXUS_CONCEPT_SCRIPT[0])])))
    sol_concepts = _run(sol.list_concepts())
    nex_concepts = _run(nex.list_concepts())
    assert sol_concepts == nex_concepts
    assert [c.__dict__ for c in sol_concepts] == [c.__dict__ for c in nex_concepts]


def test_parity_subjects_sol_vs_nexus() -> None:
    sol = SolNativeAdapter(dsn="", pool=FakePool(FakeConn([list(x) for x in _NEXUS_SUBJECT_SCRIPT])))
    nex = NexusDatasourceAdapter(dsn="", pool=FakePool(FakeConn([list(x) for x in _NEXUS_SUBJECT_SCRIPT])))
    sol_subjects = _run(sol.list_subjects("concept-bike"))
    nex_subjects = _run(nex.list_subjects("concept-bike"))
    assert [s.__dict__ for s in sol_subjects] == [s.__dict__ for s in nex_subjects]
    assert all(isinstance(s, ContractSubject) for s in sol_subjects)


def test_parity_shrapnel_sol_vs_nexus() -> None:
    sol = SolNativeAdapter(dsn="", pool=FakePool(FakeConn([list(x) for x in _NEXUS_SHRAPNEL_SCRIPT])))
    nex = NexusDatasourceAdapter(dsn="", pool=FakePool(FakeConn([list(x) for x in _NEXUS_SHRAPNEL_SCRIPT])))
    sol_facts = _run(sol.list_shrapnel_facts())
    nex_facts = _run(nex.list_shrapnel_facts())
    assert [f.__dict__ for f in sol_facts] == [f.__dict__ for f in nex_facts]
    assert all(isinstance(f, ContractShrapnelFact) for f in sol_facts)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])