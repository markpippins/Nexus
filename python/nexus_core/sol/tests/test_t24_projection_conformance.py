"""T24 → SOL ExecutionClaim projection conformance tests.

Implements conditions C2 and C3 of decision D-2026-08-23-A (ratification of
analyst proposal e9136c4f), plus the C4 controlled-predicate rule:

- C2: each of the 8 golden ``target_not_found`` edges yields preserved
  Evidence + IdentityResolution=unresolved + Pending claim; zero silent
  drops; no Rejected/Asserted/Accepted shortcuts.
- C3: an edge with absent ``source_migration_id`` yields an explicit
  PROVENANCE_UNRESOLVED finding and is never authoritatively accepted.
- C4: predicates map through the controlled registry only; arbitrary
  relation text never enters hard SOL expressions.

These tests run against ``nexus_core.sol.t24_projection.project_edge``,
the projection entry point. The implementation lands after DBA condition
C1 (statement_evidence resolution_proposition type) is applied; until then
every test reports the missing module as an explicit skip so the suite
stays visible and green-by-skip rather than silently forgotten.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from unittest import mock

try:
    from nexus_core.sol.t24_projection import (
        project_edge,
        ControlledPredicateRegistry,
    )

    IMPLEMENTATION_AVAILABLE = True
except ImportError:  # pragma: no cover - until C1 lands and impl is written
    project_edge = None
    ControlledPredicateRegistry = None
    IMPLEMENTATION_AVAILABLE = False

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures"

# Controlled predicate registry per D-2026-08-23-A condition C4.
CONTROLLED_PREDICATES = {"implements", "derived_from", "depends_on"}


def _load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text())


@unittest.skipUnless(IMPLEMENTATION_AVAILABLE, "C1 pending: t24_projection not implemented yet")
class TestC2UnresolvedRoundTrip(unittest.TestCase):
    """Decision condition C2 — round-trip the 8 golden unresolved edges."""

    def setUp(self) -> None:
        self.fixture = _load("t24_unresolved_edges.json")

    def test_fixture_holds_exactly_the_golden_edges(self):
        self.assertEqual(len(self.fixture["edges"]), 8)
        for edge in self.fixture["edges"]:
            self.assertEqual(edge["resolution"], "unresolved")
            self.assertEqual(edge["unresolved_reason"], "target_not_found")

    def test_each_unresolved_edge_yields_pending_claim_with_preserved_identity(self):
        for edge in self.fixture["edges"]:
            with self.subTest(edge=edge["id"]):
                result = project_edge(edge)

                claim = result["execution_claim"]
                # Identity resolution maps ONLY to unresolved here.
                self.assertEqual(result["identity_resolution"], "unresolved")
                # Proposition stays Pending — never Rejected/Asserted/Accepted.
                self.assertEqual(claim["proposition"], "Pending")
                # Raw target identifier preserved verbatim.
                self.assertIsNone(claim["object_ref"]["section"])
                self.assertEqual(
                    claim["object_ref"]["natural_key"], edge["target_id"]
                )
                # Source natural key retained even without asset_id.
                self.assertEqual(
                    claim["subject_ref"]["natural_key"], edge["source_id"]
                )
                # Evidence preserved, never dropped.
                self.assertTrue(result["evidence"])
                evidence_ids = {e["source_record_id"] for e in result["evidence"]}
                self.assertIn(edge["id"], evidence_ids)
                # Provenance linked to the ingestion migration run.
                self.assertEqual(
                    result["provenance"]["ingestion_run_id"],
                    edge["source_migration_id"],
                )
                # Nothing may assert completion from graph data alone.
                self.assertNotIn(claim["proposition"], {"Rejected", "Asserted", "Accepted"})


@unittest.skipUnless(IMPLEMENTATION_AVAILABLE, "C1 pending: t24_projection not implemented yet")
class TestC3ProvenanceGap(unittest.TestCase):
    """Decision condition C3 — absent source_migration_id."""

    def setUp(self) -> None:
        self.fixture = _load("t24_provenance_gap.json")
        self.edge = self.fixture["edge"]

    def test_missing_migration_id_raises_explicit_finding(self):
        result = project_edge(self.edge)
        findings = result.get("findings", [])
        self.assertIn(
            "PROVENANCE_UNRESOLVED",
            [f if isinstance(f, str) else f.get("code") for f in findings],
        )

    def test_provenance_gap_never_authoritatively_accepts(self):
        result = project_edge(self.edge)
        claim = result["execution_claim"]
        self.assertEqual(claim["proposition"], "Pending")
        self.assertIsNotTrue(result.get("accepted", False))


class TestC4ControlledPredicates(unittest.TestCase):
    """Decision condition C4 — registry-only predicate mapping."""

    def test_registry_rejects_arbitrary_relation_text(self):
        if not IMPLEMENTATION_AVAILABLE:
            self.skipTest("C1 pending: t24_projection not implemented yet")
        registry = ControlledPredicateRegistry(CONTROLLED_PREDICATES)
        with self.assertRaises(KeyError):
            registry.map("some-random-relation-text")

    def test_registry_accepts_controlled_predicates(self):
        if not IMPLEMENTATION_AVAILABLE:
            self.skipTest("C1 pending: t24_projection not implemented yet")
        registry = ControlledPredicateRegistry(CONTROLLED_PREDICATES)
        for predicate in CONTROLLED_PREDICATES:
            self.assertEqual(registry.map(predicate), predicate)

    def test_all_golden_edges_use_controlled_predicates(self):
        fixture = _load("t24_unresolved_edges.json")
        for edge in fixture["edges"]:
            self.assertIn(
                edge["relation_type"],
                CONTROLLED_PREDICATES,
                f"golden edge {edge['id']} carries uncontrolled relation text",
            )


if __name__ == "__main__":
    unittest.main()
