"""wr-conf-020: SOL execution-claim/evidence integration conformance.

The suite applies the unapplied resolution v28/v29 migrations inside each
PostgreSQL test transaction, exercises the real tables/constraints/triggers,
and rolls the transaction back. The live database is never left with the
proposed schema changes.

Covered authority boundaries:

  AC1 — valid execution claim → execution evidence → claim-evidence link;
  AC2 — dangling claim/evidence links are rejected by real foreign keys;
  AC3 — Asserted claims without verification metadata are rejected;
  AC4 — execution evidence without policy/lease/grant/attempt context is
        rejected, preventing unbound replay;
  AC5 — semantic Accepted is rejected; PEB settlement remains separate;
  AC6 — immutable evidence cannot be updated or deleted;
  AC7 — unresolved T24 graph evidence is preserved and does not become a
        claim or accepted authority state.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_execution_claim_evidence.py -v
"""

from __future__ import annotations

import os
import sys
import unittest
import uuid
from pathlib import Path

import pytest

pytestmark = pytest.mark.local_integration

_SELF_DIR = Path(__file__).resolve().parent
_NEXUS_PYTHON = _SELF_DIR.parents[2]
if str(_NEXUS_PYTHON) not in sys.path:
    sys.path.insert(0, str(_NEXUS_PYTHON))

DSN = os.environ.get(
    "CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus"
)
_REPO_ROOT = _NEXUS_PYTHON.parent
_V28 = _REPO_ROOT / "schemas/migrations/resolution/resolution_migration_v28_execution_claim_evidence.sql"
_V29 = _REPO_ROOT / "schemas/migrations/resolution/resolution_migration_v29_t24_graph_evidence.sql"
_V30 = _REPO_ROOT / "schemas/migrations/resolution/resolution_migration_v30_verified_execution_admission.sql"


def _migration_body(path: Path) -> str:
    """Strip the file transaction wrapper; the test owns the transaction."""
    lines = path.read_text(encoding="utf-8").splitlines()
    return "\n".join(
        line for line in lines if line.strip() not in {"BEGIN;", "COMMIT;"}
    )


def _new_id() -> str:
    return str(uuid.uuid4())


class TestExecutionClaimEvidenceIntegration(unittest.TestCase):
    """Run each case against real PostgreSQL DDL, then roll it back."""

    def setUp(self):
        import psycopg2

        self.conn = psycopg2.connect(DSN)
        self.conn.autocommit = False
        self.cur = self.conn.cursor()
        self.cur.execute(
            _migration_body(_V28) + "\n"
            + _migration_body(_V29) + "\n"
            + _migration_body(_V30)
        )

    def tearDown(self):
        self.conn.rollback()
        self.cur.close()
        self.conn.close()

    def _claim(self, *, disposition="Proposed", claim_id=None, **overrides) -> str:
        claim_id = claim_id or _new_id()
        values = {
            "id": claim_id,
            "claim_key": f"claim:{claim_id}",
            "subject_kind": "work_request",
            "subject_ref": '{"entity_key":"wr-conf-020"}',
            "predicate": "artifact_materialized",
            "object_value": '{"ref":"refs/heads/lease/wr-conf-020"}',
            "policy_version_hash": "sha256:policy-wr-conf-020",
            "lease_id": "lease-wr-conf-020",
            "grant_id": "grant-wr-conf-020",
            "attempt_id": "attempt-wr-conf-020",
            "declared_by": "builder/wr-conf-020",
            "disposition": disposition,
            "verification_method": None,
            "verified_by": None,
            "verified_at": None,
        }
        values.update(overrides)
        self.cur.execute(
            """
            INSERT INTO resolution.execution_claim
              (id, claim_key, subject_kind, subject_ref, predicate, object_value,
               policy_version_hash, lease_id, grant_id, attempt_id, declared_by,
               disposition, verification_method, verified_by, verified_at)
            VALUES
              (%(id)s, %(claim_key)s, %(subject_kind)s, %(subject_ref)s::jsonb,
               %(predicate)s, %(object_value)s::jsonb, %(policy_version_hash)s,
               %(lease_id)s, %(grant_id)s, %(attempt_id)s, %(declared_by)s,
               %(disposition)s, %(verification_method)s, %(verified_by)s,
               %(verified_at)s)
            """,
            values,
        )
        return claim_id

    def _evidence(self, *, context_kind="execution", evidence_id=None, **overrides) -> str:
        evidence_id = evidence_id or _new_id()
        values = {
            "id": evidence_id,
            "evidence_key": f"evidence:{evidence_id}",
            "evidence_kind": "git_ref_commit",
            "source_system": "git-verifier",
            "source_ref": '{"ref":"refs/heads/lease/wr-conf-020"}',
            "source_hash": f"sha256:evidence-{evidence_id}",
            "captured_by": "git-verifier/1.0",
            "context_kind": context_kind,
            "policy_version_hash": "sha256:policy-wr-conf-020",
            "lease_id": "lease-wr-conf-020",
            "grant_id": "grant-wr-conf-020",
            "attempt_id": "attempt-wr-conf-020",
            "verifier_id": "git-verifier/1.0",
            "verifier_independence": True,
            "verifier_method": "read-only-git",
            "payload": '{"outcome":"verified","ref_exists":true}',
            "metadata": '{"test":"wr-conf-020"}',
        }
        values.update(overrides)
        self.cur.execute(
            """
            INSERT INTO resolution.execution_evidence
              (id, evidence_key, evidence_kind, source_system, source_ref,
               source_hash, captured_at, captured_by, context_kind,
               policy_version_hash, lease_id, grant_id, attempt_id, verifier_id,
               verifier_independence, verifier_method, payload, metadata)
            VALUES
              (%(id)s, %(evidence_key)s, %(evidence_kind)s, %(source_system)s,
               %(source_ref)s::jsonb, %(source_hash)s, now(), %(captured_by)s,
               %(context_kind)s, %(policy_version_hash)s, %(lease_id)s,
               %(grant_id)s, %(attempt_id)s, %(verifier_id)s,
               %(verifier_independence)s, %(verifier_method)s,
               %(payload)s::jsonb, %(metadata)s::jsonb)
            """,
            values,
        )
        return evidence_id

    def _link(self, claim_id: str, evidence_id: str, *, role="supports") -> str:
        link_id = _new_id()
        self.cur.execute(
            """
            INSERT INTO resolution.execution_claim_evidence
              (id, claim_id, evidence_id, role, verification_state, strength, linked_by)
            VALUES (%s, %s, %s, %s, 'confirmed', 1.0, 'supervisor/wr-conf-020')
            """,
            (link_id, claim_id, evidence_id, role),
        )
        return link_id

    def _expect_constraint_failure(self, statement: str, params=()):
        """Assert a statement fails while keeping the outer test transaction usable."""
        import psycopg2

        savepoint = f"sp_{uuid.uuid4().hex}"
        self.cur.execute(f"SAVEPOINT {savepoint}")
        with self.assertRaises(psycopg2.Error):
            self.cur.execute(statement, params)
        self.cur.execute(f"ROLLBACK TO SAVEPOINT {savepoint}")
        self.cur.execute(f"RELEASE SAVEPOINT {savepoint}")

    def test_ac1_valid_claim_evidence_linkage(self):
        claim_id = self._claim()
        evidence_id = self._evidence()
        link_id = self._link(claim_id, evidence_id)

        self.cur.execute(
            """
            SELECT c.disposition, c.attempt_id, e.context_kind,
                   e.grant_id, ce.role, ce.verification_state
              FROM resolution.execution_claim c
              JOIN resolution.execution_claim_evidence ce ON ce.claim_id = c.id
              JOIN resolution.execution_evidence e ON e.id = ce.evidence_id
             WHERE c.id = %s AND ce.id = %s
            """,
            (claim_id, link_id),
        )
        row = self.cur.fetchone()
        self.assertEqual(
            row,
            ("Proposed", "attempt-wr-conf-020", "execution", "grant-wr-conf-020", "supports", "confirmed"),
        )

    def test_ac2_dangling_claim_and_evidence_links_are_rejected(self):
        claim_id = self._claim()
        evidence_id = self._evidence()

        self._expect_constraint_failure(
            "INSERT INTO resolution.execution_claim_evidence "
            "(id, claim_id, evidence_id, role, linked_by) "
            "VALUES (%s, %s, %s, 'supports', 'test')",
            (_new_id(), claim_id, _new_id()),
        )
        self._expect_constraint_failure(
            "INSERT INTO resolution.execution_claim_evidence "
            "(id, claim_id, evidence_id, role, linked_by) "
            "VALUES (%s, %s, %s, 'supports', 'test')",
            (_new_id(), _new_id(), evidence_id),
        )

    def test_ac3_asserted_claim_requires_verification_metadata(self):
        self._expect_constraint_failure(
            "INSERT INTO resolution.execution_claim "
            "(id, claim_key, subject_kind, predicate, declared_by, disposition) "
            "VALUES (%s, %s, 'work_request', 'artifact_materialized', 'builder', 'Asserted')",
            (_new_id(), f"invalid-asserted:{_new_id()}"),
        )

        claim_id = self._claim(
            disposition="Asserted",
            verification_method="read-only-git",
            verified_by="git-verifier/1.0",
            verified_at="2026-08-20T12:00:00+00:00",
        )
        self.cur.execute(
            "SELECT disposition, verified_by FROM resolution.execution_claim WHERE id = %s",
            (claim_id,),
        )
        self.assertEqual(self.cur.fetchone(), ("Asserted", "git-verifier/1.0"))

    def test_ac4_execution_evidence_requires_authority_context(self):
        self._expect_constraint_failure(
            """
            INSERT INTO resolution.execution_evidence
              (id, evidence_key, evidence_kind, source_system, source_hash,
               captured_at, captured_by, context_kind, payload, metadata)
            VALUES (%s, %s, 'git_ref_commit', 'git-verifier', %s, now(),
                    'git-verifier/1.0', 'execution', '{}'::jsonb, '{}'::jsonb)
            """,
            (_new_id(), f"invalid-context:{_new_id()}", f"sha256:{_new_id()}"),
        )

        evidence_id = self._evidence()
        self.cur.execute(
            "SELECT context_kind, policy_version_hash, lease_id, grant_id, attempt_id "
            "FROM resolution.execution_evidence WHERE id = %s",
            (evidence_id,),
        )
        self.assertEqual(
            self.cur.fetchone(),
            (
                "execution",
                "sha256:policy-wr-conf-020",
                "lease-wr-conf-020",
                "grant-wr-conf-020",
                "attempt-wr-conf-020",
            ),
        )

    def test_ac5_semantic_accepted_is_rejected_as_peb_shortcut(self):
        self._expect_constraint_failure(
            "INSERT INTO resolution.execution_claim "
            "(id, claim_key, subject_kind, predicate, declared_by, disposition) "
            "VALUES (%s, %s, 'work_request', 'artifact_materialized', 'supervisor', 'Accepted')",
            (_new_id(), f"invalid-accepted:{_new_id()}"),
        )

    def test_ac6_execution_evidence_is_immutable(self):
        evidence_id = self._evidence()
        self._expect_constraint_failure(
            "UPDATE resolution.execution_evidence SET payload = '{}'::jsonb WHERE id = %s",
            (evidence_id,),
        )
        self._expect_constraint_failure(
            "DELETE FROM resolution.execution_evidence WHERE id = %s",
            (evidence_id,),
        )

    def test_ac7_unresolved_t24_evidence_stays_unresolved_and_unclaimed(self):
        evidence_id = self._evidence(
            context_kind="provenance",
            policy_version_hash=None,
            lease_id=None,
            grant_id=None,
            attempt_id=None,
            evidence_kind="kg_relationship",
            source_system="knowledge",
            source_ref='{"graph_edge_id":"wr-conf-020-edge"}',
        )
        edge_id = _new_id()
        self.cur.execute(
            """
            INSERT INTO resolution.t24_graph_edge_evidence
              (evidence_id, graph_edge_id, source_section, source_id,
               relation_type, target_section, target_id, source_migration_id,
               graph_resolution, unresolved_reason)
            VALUES (%s, %s, 'actors', 'builder', 'produces', NULL,
                    'missing-target', %s, 'unresolved', 'target_not_found')
            """,
            (evidence_id, edge_id, _new_id()),
        )
        self.cur.execute(
            """
            SELECT graph_resolution, target_section, target_id,
                   unresolved_reason, claim_id
              FROM resolution.v_t24_execution_evidence
             WHERE evidence_id = %s
            """,
            (evidence_id,),
        )
        self.assertEqual(
            self.cur.fetchone(),
            ("unresolved", None, "missing-target", "target_not_found", None),
        )

    def test_ac8_verified_git_evidence_is_admissible_and_receipted(self):
        claim_id = self._claim()
        evidence_id = self._evidence()
        self._link(claim_id, evidence_id)
        peb_transaction_id = _new_id()

        self.cur.execute(
            """
            SELECT admitted, reason, receipt_id
              FROM resolution.admit_verified_execution_claim(
                %s, %s, %s, %s, %s, %s, %s, 'git-verifier', 'git_ref_commit')
            """,
            (
                peb_transaction_id,
                claim_id,
                evidence_id,
                "sha256:policy-wr-conf-020",
                "lease-wr-conf-020",
                "grant-wr-conf-020",
                "attempt-wr-conf-020",
            ),
        )
        admitted, reason, receipt_id = self.cur.fetchone()
        self.assertTrue(admitted)
        self.assertEqual(reason, "verified Git evidence is eligible for PEB admission")
        self.assertIsNotNone(receipt_id)

        self.cur.execute(
            "SELECT admitted, claim_id, evidence_id FROM resolution.execution_admission_receipt WHERE id = %s",
            (receipt_id,),
        )
        self.assertEqual(self.cur.fetchone(), (True, claim_id, evidence_id))

    def test_ac9_rejected_git_evidence_is_not_admissible(self):
        claim_id = self._claim()
        evidence_id = self._evidence(payload='{"outcome":"rejected","reason":"CLAIMED_REF_NOT_FOUND"}')
        self._link(claim_id, evidence_id)

        self.cur.execute(
            """
            SELECT admitted, reason, receipt_id
              FROM resolution.admit_verified_execution_claim(
                %s, %s, %s, %s, %s, %s, %s, 'git-verifier', 'git_ref_commit')
            """,
            (
                _new_id(), claim_id, evidence_id,
                "sha256:policy-wr-conf-020", "lease-wr-conf-020",
                "grant-wr-conf-020", "attempt-wr-conf-020",
            ),
        )
        admitted, reason, receipt_id = self.cur.fetchone()
        self.assertFalse(admitted)
        self.assertEqual(reason, "EVIDENCE_NOT_INDEPENDENTLY_VERIFIED")
        self.assertIsNotNone(receipt_id)

    def test_ac10_conflicting_replay_is_rejected(self):
        claim_id = self._claim()
        evidence_id = self._evidence()
        self._link(claim_id, evidence_id)
        peb_transaction_id = _new_id()
        args = (
            peb_transaction_id, claim_id, evidence_id,
            "sha256:policy-wr-conf-020", "lease-wr-conf-020",
            "grant-wr-conf-020", "attempt-wr-conf-020",
        )

        self.cur.execute(
            "SELECT admitted, reason, receipt_id FROM resolution.admit_verified_execution_claim(%s,%s,%s,%s,%s,%s,%s,'git-verifier','git_ref_commit')",
            args,
        )
        self.assertTrue(self.cur.fetchone()[0])

        second_claim = self._claim()
        second_evidence = self._evidence()
        self._link(second_claim, second_evidence)
        self.cur.execute(
            "SELECT admitted, reason, receipt_id FROM resolution.admit_verified_execution_claim(%s,%s,%s,%s,%s,%s,%s,'git-verifier','git_ref_commit')",
            (peb_transaction_id, second_claim, second_evidence, *args[3:]),
        )
        admitted, reason, receipt_id = self.cur.fetchone()
        self.assertFalse(admitted)
        self.assertEqual(reason, "CONFLICTING_EXECUTION_ADMISSION_REPLAY")
        self.assertIsNone(receipt_id)


if __name__ == "__main__":
    unittest.main()
