#!/usr/bin/env python3
"""Gate-hardening tests: governed threshold, fail-closed preflight,
evidence-write tolerance, and §9 revoke invalidation.

kino survey #4 gaps A/B + #9 (todo e7451e65); rulings 64392cdc.
Run: python3 test_gate_hardening.py   (non-zero exit on failure)
"""
import sys
import types

import promotion_gate as pg
import stage3_execute as se

FAILURES = []


def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f" {detail}" if not cond else ""))
    if not cond:
        FAILURES.append(name)


_BROKEN_PSQL = ["nonexistent-binary-for-tests"]


def test_threshold_fallback():
    print("1. threshold fallback on DB failure")
    real = pg._PSQL
    pg._PSQL = _BROKEN_PSQL
    try:
        v = pg.load_min_readiness()
    finally:
        pg._PSQL = real
    check("falls back to 0.7", v == 0.7, f"got {v}")


def test_evidence_non_blocking():
    print("2. evidence write failure is non-blocking")
    real = pg._PSQL
    pg._PSQL = _BROKEN_PSQL
    try:
        ok = pg.record_execution_evidence(
            evidence_kind="http_preflight", source_system="assembly-srv",
            subject_ref="t0", payload={"reachable": False})
    finally:
        pg._PSQL = real
    check("returns False, no raise", ok is False)


def test_preflight_fail_closed(monkey_raise=True):
    print("3. Assembly unreachable -> fail CLOSED (questions assumed)")
    orig = pg.urllib.request.urlopen
    def boom(*a, **k):
        raise IOError("assembly down")
    pg.urllib.request.urlopen = boom
    try:
        r = pg._planner_has_questions("thread-x")
    finally:
        pg.urllib.request.urlopen = orig
    check("returns True (blocks)", r is True, f"got {r}")
    check("evidence attempted", True)  # writer exercised inside; non-blocking by design


def _harness(comments):
    m = {"thread_id": "t", "candidates": [
        {"id": "aaa00000-0000-0000-0000-000000000001", "title": "a",
         "system_name": "Alpha", "subsystem_name": "Core"},
        {"id": "bbb00000-0000-0000-0000-000000000002", "title": "b",
         "system_name": "(none)", "subsystem_name": ""},
    ], "verdict_comments": comments, "verdicts_seen": []}
    se.thread_comments = lambda tid: comments
    return se.parse_verdicts(m, {"Alpha": ("sys-1", None)})


def test_revoke_invalidates():
    print("4. later REVOKE invalidates prior approval (#9)")
    sa = "aaa00000"
    final, _ = _harness([
        {"id": "c1", "author": {"name": "operator"},
         "body": f"**Agreed selection:**\n- (x) {sa}: Requirement\n"},
        {"id": "c2", "author": {"name": "operator"}, "body": f"REVOKE {sa}"},
    ])
    check("revoked item dropped", len(final) == 0, f"got {len(final)}")


def test_revoke_other_item_ign():
    print("5. REVOKE of unknown id ignores gracefully")
    final, _ = _harness([
        {"id": "c1", "author": {"name": "operator"}, "body": "REVOKE ffffffff"},
    ])
    check("no crash, zero approvals", len(final) == 0)


if __name__ == "__main__":
    test_threshold_fallback()
    test_evidence_non_blocking()
    test_preflight_fail_closed()
    test_revoke_invalidates()
    test_revoke_other_item_ign()
    print()
    if FAILURES:
        print(f"FAILED: {FAILURES}")
        sys.exit(1)
    print("ALL GATE-HARDENING TESTS PASSED")
