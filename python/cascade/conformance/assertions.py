"""assertions.py — LOSM semantic invariants for cascade transitions.

These are the first LOSM semantic assertions. They check that a real
cascade transition satisfies the invariants the semantic model requires.

The assertions are not checking implementation details. They are checking
semantic invariants:

    - Every transition has a subject
    - Every completed transition has an outcome
    - Every transition produces at least one artifact
    - Every transition is recorded as a receipt
    - Transitions form a lineage chain

When an assertion fails, it reveals a gap between the semantic model and
the running system. That gap is a discovery, not a bug.

Usage:

    python3 -m cascade.conformance.assertions artifacts/capture_*.json
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass, field
from typing import Any

# ── Path setup ──────────────────────────────────────────────────────
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)


# ── Results model ───────────────────────────────────────────────────

@dataclass
class AssertionResult:
    name: str
    passed: bool
    message: str = ""


@dataclass
class AssertionSuite:
    """Results from running the assertion suite against one transition."""
    transition_name: str
    results: list[AssertionResult] = field(default_factory=list)
    passed: int = 0
    failed: int = 0

    def add(self, name: str, passed: bool, message: str = "") -> None:
        self.results.append(AssertionResult(name=name, passed=passed, message=message))
        if passed:
            self.passed += 1
        else:
            self.failed += 1

    def print_summary(self) -> None:
        status = "✅" if self.failed == 0 else "❌"
        print(f"\n{status} {self.transition_name}")
        print(f"   Passed: {self.passed}, Failed: {self.failed}")
        for r in self.results:
            icon = "✅" if r.passed else "❌"
            print(f"   {icon} {r.name}")
            if not r.passed and r.message:
                print(f"       {r.message}")


# ── Assertions ──────────────────────────────────────────────────────

def assert_has_subject(
    request: Any,
    result: Any | None,
) -> AssertionResult:
    """Every transition has a subject (the thing being transitioned)."""
    subject_id = (request.subject_id if request else None) or (result.subject_id if result else None)
    passed = subject_id is not None and len(str(subject_id)) > 0
    return AssertionResult(
        name="has_subject",
        passed=passed,
        message="" if passed else f"Transition has no subject_id (request={request})",
    )


def assert_has_outcome(result: Any | None) -> AssertionResult:
    """Every completed transition has an outcome."""
    if result is None:
        return AssertionResult(
            name="has_outcome",
            passed=False,
            message="No result — transition may not have completed",
        )
    passed = result.has_outcome and result.outcome not in (None, "", "unknown")
    return AssertionResult(
        name="has_outcome",
        passed=passed,
        message="" if passed else f"Outcome is missing or unknown: {getattr(result, 'outcome', None)}",
    )


def assert_has_artifact(result: Any | None) -> AssertionResult:
    """Every completed transition produces at least one materialized artifact."""
    if result is None:
        return AssertionResult(
            name="has_artifact",
            passed=False,
            message="No result — cannot check artifacts",
        )
    passed = len(result.artifacts) >= 1
    return AssertionResult(
        name="has_artifact",
        passed=passed,
        message="" if passed else f"No artifacts produced (artifacts={result.artifacts})",
    )


def assert_has_receipt(result: Any | None) -> AssertionResult:
    """Every transition is recorded as an immutable receipt."""
    if result is None:
        return AssertionResult(
            name="has_receipt",
            passed=False,
            message="No result — cannot check receipt",
        )
    passed = result.has_receipt
    return AssertionResult(
        name="has_receipt",
        passed=passed,
        message="" if passed else "No receipt recorded — PG may not have persisted this transition yet",
    )


def assert_has_lineage(result: Any | None) -> AssertionResult:
    """Every transition is connected to its predecessor via lineage."""
    if result is None:
        return AssertionResult(
            name="has_lineage",
            passed=False,
            message="No result — cannot check lineage",
        )
    passed = result.has_lineage and len(result.lineage) >= 1
    return AssertionResult(
        name="has_lineage",
        passed=passed,
        message="" if passed else f"No lineage edges (lineage={result.lineage})",
    )


def assert_source_matches_result(
    request: Any,
    result: Any | None,
) -> AssertionResult:
    """The subject of the request matches the subject of the result."""
    if result is None:
        return AssertionResult(
            name="source_matches_result",
            passed=False,
            message="No result to compare against",
        )
    passed = (
        request.subject_id == result.subject_id
        if request and result and request.subject_id and result.subject_id
        else False
    )
    return AssertionResult(
        name="source_matches_result",
        passed=passed,
        message="" if passed else (
            f"Subject mismatch: request={getattr(request, 'subject_id', None)} "
            f"result={getattr(result, 'subject_id', None)}"
        ),
    )


# ── Suite runner ────────────────────────────────────────────────────

def run_assertions(
    request: Any,
    result: Any | None,
    transition_name: str = "observation.captured → assessment.completed",
) -> AssertionSuite:
    """Run all LOSM semantic assertions against a projected transition."""
    suite = AssertionSuite(transition_name=transition_name)

    # Every transition must have a subject
    suite.add("has_subject", assert_has_subject(request, result).passed,
              assert_has_subject(request, result).message)

    # Every completed transition has an outcome
    result_has_outcome = assert_has_outcome(result)
    suite.add("has_outcome", result_has_outcome.passed, result_has_outcome.message)

    # Every transition produces at least one artifact
    result_has_artifact = assert_has_artifact(result)
    suite.add("has_artifact", result_has_artifact.passed, result_has_artifact.message)

    # Every transition is recorded as a receipt
    result_has_receipt = assert_has_receipt(result)
    suite.add("has_receipt", result_has_receipt.passed, result_has_receipt.message)

    # Every transition has lineage
    result_has_lineage = assert_has_lineage(result)
    suite.add("has_lineage", result_has_lineage.passed, result_has_lineage.message)

    # Source and result refer to the same subject
    result_source_matches = assert_source_matches_result(request, result)
    suite.add("source_matches_result", result_source_matches.passed, result_source_matches.message)

    return suite


# ── Entry point ─────────────────────────────────────────────────────

def main() -> None:
    """Run assertions against projected transitions from evidence bundles."""
    from cascade.conformance.probe import load_bundle, list_bundles
    from cascade.conformance.projector import project_bundle

    files = sys.argv[1:] if len(sys.argv) > 1 else list_bundles()[-2:]
    if not files:
        print("[assertions] No evidence bundles found. Run probe.py first.")
        sys.exit(1)

    all_passed = True

    # Establish PG connection for semantic enrichment
    pg_conn = _get_pg_conn()

    for f in files:
        print(f"\n{'='*60}")
        print(f"Evidence: {f}")
        bundle = load_bundle(f)

        # First projection: NATS data only (outcome will be "unknown")
        request, result = project_bundle(bundle, pg_conn=pg_conn)

        if request is None:
            print("  ⏭  Skipped — no projectable events")
            continue

        # Run assertions against NATS + PG enriched data
        suite = run_assertions(request, result)
        suite.print_summary()

        if suite.failed > 0:
            print("\n  ⚠  Some assertions failed:")
            suite.print_summary()
            all_passed = False

    if pg_conn:
        pg_conn.close()

    sys.exit(0 if all_passed else 1)


def _get_pg_conn() -> Any | None:
    """Return a PG connection for enrichment, or None if unavailable."""
    try:
        import psycopg2
        conn = psycopg2.connect(
            os.getenv("DATABASE_URL", "postgres://pguser:pgpass@localhost:5432/nexus")
        )
        return conn
    except Exception as e:
        print(f"  [assertions] ⚠ PG connection unavailable: {e}")
        return None


def _enrich_with_pg_receipts(result: Any, bundle: Any) -> None:
    """Try to query PG receipts for the transition's subject."""
    if result is None:
        return
    try:
        import psycopg2
        conn = psycopg2.connect(
            os.getenv("DATABASE_URL", "postgres://pguser:pgpass@localhost:5432/nexus")
        )
        with conn.cursor() as cur:
            # Look for the transition_event row matching the subject
            if result.subject_id:
                cur.execute(
                    """SELECT event_id::text, event_type, authority, timestamp,
                              payload->>'outcome' as outcome
                       FROM kernel.transition_event
                       WHERE aggregate_id = %s
                       ORDER BY id DESC LIMIT 5""",
                    (result.subject_id,),
                )
                for row in cur.fetchall():
                    result.receipts.append({
                        "event_id": row[0],
                        "event_type": row[1],
                        "authority": row[2],
                        "timestamp": str(row[3]),
                        "outcome": row[4],
                    })
                    result.has_receipt = True
                    # Fix outcome if it was unknown
                    if row[4] and result.outcome in (None, "", "unknown"):
                        result.outcome = row[4]
                        result.has_outcome = True
        conn.close()
    except Exception as e:
        print(f"  [assertions] ⚠ Could not query PG receipts: {e}")


if __name__ == "__main__":
    main()
