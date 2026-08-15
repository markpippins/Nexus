"""test_conformance_kg_migration.py — T24 KG edge-integrity conformance.

Proves the migration contract (architect breakdown b6a7d551):
  * extract_relations understands the v2.4.1 work_requests/plans structure
    (WR→plan implements / derived_from; plan→plan depends_on) and still parses
    the legacy types→actors shape for .bak recovery.
  * resolve_edges is lossless: duplicates collapse, missing endpoints are
    PRESERVED as unresolved (target_section NULL → FK-skip) rather than
    deleted, and resolved edges keep their endpoint section.
  * Replayed ingestion is idempotent — resolving the same raw edges twice
    yields the identical resolved set.
  * The recovered fixture (tests/fixtures/kg_types_actors_edges.json) holds
    exactly the 31 clean types→actors edges from the .bak.

Usage::

    cd /home/codex/dev/nexus/python/steward
    python3 -m pytest test_conformance_kg_migration.py -v
"""

import json
import os

from migrate_graph import (
    _extract_plan_numbers,
    extract_relations,
    resolve_edges,
)

FIXTURE = os.path.join(
    os.path.dirname(__file__), "..", "..", "tests", "fixtures",
    "kg_types_actors_edges.json",
)


def _wr(**over):
    item = {
        "id": "wr-0130-1781781240",
        "plan": "0130",
        "derived_from": ["0128"],
        "problem_statement": "verify the conduit pipeline can dispatch a work request",
    }
    item.update(over)
    return item


def _plan(**over):
    item = {
        "plan_number": "0130",
        "dependencies": [],
    }
    item.update(over)
    return item


class TestExtractRelations:
    def test_wr_implements_its_plan(self):
        rels = extract_relations("work_requests", _wr())
        assert ("implements", "plans", "0130") in rels

    def test_wr_derived_from_plan(self):
        rels = extract_relations("work_requests", _wr())
        assert ("derived_from", "plans", "0128") in rels

    def test_wr_without_plan_yields_no_implements(self):
        rels = extract_relations("work_requests", _wr(plan=None))
        assert not any(r[0] == "implements" for r in rels)

    def test_plan_dependencies_extract_plan_numbers(self):
        rels = extract_relations("plans", _plan(dependencies=["[\"0164\"]"]))
        assert ("depends_on", "plans", "0164") in rels

    def test_plan_empty_and_sentinel_deps_yield_nothing(self):
        rels = extract_relations("plans", _plan(dependencies=["[]"]))
        assert rels == []
        rels = extract_relations("plans", _plan(dependencies=[]))
        assert rels == []

    def test_plan_free_text_deps_extract_embedded_numbers(self):
        rels = extract_relations(
            "plans", _plan(dependencies=["Phase 1 (plans 0136–0142)"])
        )
        assert ("depends_on", "plans", "0136") in rels
        assert ("depends_on", "plans", "0142") in rels


class TestPlanNumberParsing:
    def test_json_encoded_list(self):
        assert _extract_plan_numbers('["0164"]') == ["0164"]

    def test_sentinel_is_empty(self):
        assert _extract_plan_numbers("[]") == []

    def test_free_text_numbers(self):
        assert _extract_plan_numbers("Phase 1 (plans 0136–0142)") == ["0136", "0142"]

    def test_dedupe_preserves_order(self):
        assert _extract_plan_numbers("0164 and 0164 and 1023") == ["0164", "1023"]


class TestResolveEdges:
    def _raw(self, target_section, target_id):
        return [{
            "source_section": "work_requests",
            "source_id": "wr-1",
            "relation_type": "implements",
            "target_section": target_section,
            "target_id": target_id,
        }]

    def test_resolved_edge_keeps_section(self):
        keys = {("plans", "0130")}
        edges = resolve_edges(self._raw("plans", "0130"), keys)
        assert edges[0]["resolution"] == "resolved"
        assert edges[0]["target_section"] == "plans"
        assert "unresolved_reason" not in edges[0]

    def test_missing_endpoint_is_preserved_unresolved(self):
        keys = {("plans", "0130")}
        edges = resolve_edges(self._raw("plans", "0999"), keys)
        assert edges[0]["resolution"] == "unresolved"
        assert edges[0]["unresolved_reason"] == "target_not_found"
        assert edges[0]["target_section"] is None  # FK-skip
        assert edges[0]["target_id"] == "0999"     # dangling ref retained (lossless)

    def test_duplicate_edges_collapse(self):
        keys = {("plans", "0130")}
        raw = self._raw("plans", "0130") + self._raw("plans", "0130")
        edges = resolve_edges(raw, keys)
        assert len(edges) == 1

    def test_replayed_ingestion_is_idempotent(self):
        keys = {("plans", "0130")}
        raw = self._raw("plans", "0130") + self._raw("plans", "0999")
        first = resolve_edges(raw, keys)
        second = resolve_edges(raw, keys)
        assert first == second
        assert [e["resolution"] for e in first] == ["resolved", "unresolved"]


class TestRecoveredFixture:
    def test_fixture_has_31_clean_edges(self):
        with open(FIXTURE) as f:
            data = json.load(f)
        assert data["edge_count"] == 31
        assert len(data["edges"]) == 31
        for e in data["edges"]:
            assert e["source_section"] == "types"
            assert e["target_section"] == "actors"
            assert e["relation_type"] == "actors"

    def test_fixture_edges_all_resolve(self):
        with open(FIXTURE) as f:
            edges = json.load(f)["edges"]
        keys = {(e["target_section"], e["target_id"]) for e in edges}
        raw = [{
            "source_section": e["source_section"],
            "source_id": e["source_id"],
            "relation_type": e["relation_type"],
            "target_section": e["target_section"],
            "target_id": e["target_id"],
        } for e in edges]
        resolved = resolve_edges(raw, keys)
        assert all(e["resolution"] == "resolved" for e in resolved)
        assert len(resolved) == 31
