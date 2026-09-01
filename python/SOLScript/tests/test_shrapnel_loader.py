"""Tests for DatabaseLoader.load_shrapnel_facts — the EAV fact-store adapter.

Shrapnel is the standalone "facts" datastore (fields/objects/values in an
EAV layout).  resolution reasons *about* those facts; this loader hydrates
each shrapnel object into an interpreter Entity under the ShrapnelFact
concept.  These tests exercise the loader against a fake asyncpg pool with
hand-built EAV rows (no live database required).
"""

from __future__ import annotations

from typing import Any, List

import pytest

from solscript import Concept, ResolutionInterpreter
from solscript.database_loader import DatabaseLoader

from .conftest import BoomConn, FakeConn, FakePool, _row, _run


def test_shrapnel_facts_hydrate_entities() -> None:
    """EAV rows become interpreter entities with property_name attributes."""
    interp = ResolutionInterpreter()
    conn = FakeConn(
        [
            # shrapnel.field
            [
                _row(id=1, name="Decision", property_name="decision", field_type_code=2),
                _row(id=2, name="Score", property_name="score", field_type_code=3),
            ],
            # object_instance JOIN oav JOIN value
            [
                _row(object_id=101, field_id=1, value_id=11, value_type_code=2),
                _row(object_id=101, field_id=2, value_id=12, value_type_code=3),
                _row(object_id=102, field_id=1, value_id=13, value_type_code=2),
            ],
            # Typed extension fetches happen in _SHRAPNEL_TYPE_COLUMNS
            # insertion order: value_long (empty), value_string, value_double,
            # then value_boolean/timestamp/jsonb/uuid (empty).
            [],
            [_row(id=11, value="approve"), _row(id=13, value="reject")],
            [_row(id=12, value=0.75)],
        ]
    )

    loader = DatabaseLoader(interp, FakePool(conn))
    _run(loader.load_shrapnel_facts())

    concept = interp.get_concept_by_name("ShrapnelFact")
    assert concept is not None

    e101 = interp.entities["shrapnel:101"]
    assert e101.attributes == {"decision": "approve", "score": 0.75}
    assert e101.external_id == "101"

    e102 = interp.entities["shrapnel:102"]
    assert e102.attributes == {"decision": "reject"}
    assert "score" not in e102.attributes


def test_shrap_facts_missing_schema_is_best_effort() -> None:
    """Absent shrapnel schema (fetch raises) does not fail the load."""
    interp = ResolutionInterpreter()
    loader = DatabaseLoader(interp, FakePool(BoomConn()))
    _run(loader.load_shrapnel_facts())

    assert interp.get_concept_by_name("ShrapnelFact") is None
    assert interp.entities == {}


def test_shrap_facts_reuses_existing_concept() -> None:
    """If a ShrapnelFact concept already exists, it is reused."""
    interp = ResolutionInterpreter()
    pre = Concept(id="pre-existing-id", name="ShrapnelFact", description="pre-existing")
    interp.add_concept(pre)

    conn = FakeConn(
        [
            [_row(id=1, name="x", property_name="x", field_type_code=2)],
            [_row(object_id=1, field_id=1, value_id=9, value_type_code=2)],
            [],  # value_long
            [_row(id=9, value="val")],  # value_string
        ]
    )
    loader = DatabaseLoader(interp, FakePool(conn))
    _run(loader.load_shrapnel_facts())

    assert interp.get_concept_by_name("ShrapnelFact") is pre
    assert interp.entities["shrapnel:1"].concept_id == "pre-existing-id"