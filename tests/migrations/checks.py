#!/usr/bin/env python3
"""Migration-file integrity tests (static — no DB required).

Verifies that the sql/ migration files carry the correct supersession and
execution-status markers so future readers are not misled. These checks are
deliberately static (read-only on the sql/ directory) so the suite runs in
any environment without a live PostgreSQL.

Current coverage:
- V116 and V120 carry a banner marking them superseded by V134
  (semantics_retire_ontology_tables, commit 30221fc6).
- V134's header records its APPLIED + LEDGERED status (it was committed as a
  DRAFT and applied on titanium; ledgered 2026-09-05 by architect).

Usage:
    python3 tests/migrations/checks.py      # run this suite
    python3 tests/run_all.py migrations     # via the repo runner

Exit code: 0 if all pass, 1 otherwise.
"""

import os
import sys

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SQL_DIR = os.path.join(NEXUS_ROOT, "sql")

passed = failed = skipped = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  PASS  {name}")
        passed += 1
    else:
        print(f"  FAIL  {name}")
        if detail:
            for line in detail.split("\n"):
                print(f"        {line}")
        failed += 1


def read_sql(fn):
    p = os.path.join(SQL_DIR, fn)
    if not os.path.exists(p):
        return ""
    with open(p) as f:
        return f.read()


def run():
    print("--- Migration supersession / execution status ---")
    v116 = read_sql("V116__semantics_execution_claims.sql")
    v120 = read_sql("V120__statement_evidence_resolution_proposition.sql")
    v134 = read_sql("V134__semantics_retire_ontology_tables.sql")

    check("V116 file exists", bool(v116), "V116__semantics_execution_claims.sql not found")
    check("V120 file exists", bool(v120), "V120__statement_evidence_resolution_proposition.sql not found")
    check("V134 file exists", bool(v134), "V134__semantics_retire_ontology_tables.sql not found")

    check("V116 marked SUPERSEDED BY V134",
          "SUPERSEDED BY V134" in v116 and "commit 30221fc6" in v116,
          "V116 must carry a V134-supersession banner")
    check("V120 marked SUPERSEDED BY V134",
          "SUPERSEDED BY V134" in v120 and "commit 30221fc6" in v120,
          "V120 must carry a V134-supersession banner")

    check("V134 header records APPLIED + LEDGERED",
          "APPLIED + LEDGERED" in v134 and "30221fc6" in v134,
          "V134 must record its applied+ledgered execution record")

    print(f"\n{'='*60}\n  migrations suite: {passed} passed, {failed} failed, {skipped} skipped")
    return passed, failed, skipped


if __name__ == "__main__":
    p, f, s = run()
    sys.exit(1 if f else 0)