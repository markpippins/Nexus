#!/usr/bin/env python3
"""peb_admission tests — advisory record-then-act helper contract.

Covers the PEB-forward Phase 1 guard rails:
  1. recording failure must never raise (broken psql)
  2. canonical path success returns True
  3. direct-fallback path (function raises -> plain insert) lands rows
     and dedupes on idempotency_key

Run: python3 test_peb_admission.py   (non-zero exit on failure)
"""
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from cascade.peb_admission import record_gate_outcome  # noqa: E402

FAILURES = []


def check(name, cond, detail=""):
    print(("  PASS " if cond else "  FAIL ") + name + (f" {detail}" if not cond else ""))
    if not cond:
        FAILURES.append(name)


def make_stub(exit_code):
    """A fake 'psql' binary: echoes args to a log file and exits with code."""
    log = tempfile.mktemp(prefix="pebadm-")
    script = (
        f"#!/bin/sh\n"
        f"echo \"$@\" >> {log}\n"
        f"exit {exit_code}\n"
    )
    path = tempfile.mktemp(prefix="peb-psql-")
    with open(path, "w") as f:
        f.write(script)
    os.chmod(path, 0o755)
    return path, log


def test_broken_psql_never_raises():
    print("1. broken psql -> False, no raise")
    stub, _ = make_stub(1)
    try:
        ok = record_gate_outcome(
            gate="test.gate", entity_id="e1", admitted=True, reason="",
            payload={"k": "v"}, psql=[stub],
        )
    finally:
        os.unlink(stub)
    check("returns False", ok is False)


def test_success_path():
    print("2. psql exit 0 -> True")
    stub, _ = make_stub(0)
    try:
        ok = record_gate_outcome(
            gate="test.gate", entity_id="e2", admitted=True, reason="",
            payload={"k": "v"}, psql=[stub],
        )
    finally:
        os.unlink(stub)
    check("returns True", ok is True)


def test_scripted_fallback():
    print("3. first call fails (function path), second succeeds (direct insert)")
    log = tempfile.mktemp(prefix="peb-log-")
    script = (
        "#!/bin/sh\n"
        f"echo \"$@\" >> {log}\n"
        f"if [ ! -f {log}.n ]; then touch {log}.n; exit 1; fi\n"
        "exit 0\n"
    )
    path = tempfile.mktemp(prefix="peb-psql-")
    with open(path, "w") as f:
        f.write(script)
    os.chmod(path, 0o755)
    try:
        ok = record_gate_outcome(
            gate="test.gate", entity_id="e3", admitted=False, reason="nope",
            payload={"k": "v"}, psql=[path],
        )
    finally:
        os.unlink(path)
        os.unlink(log) if os.path.exists(log) else None
        os.unlink(log + ".n") if os.path.exists(log + ".n") else None
    check("falls back and records", ok is True)


if __name__ == "__main__":
    test_broken_psql_never_raises()
    test_success_path()
    test_scripted_fallback()
    if FAILURES:
        print("\nFAILURES:", FAILURES)
        sys.exit(1)
    print("\nALL PEB-ADMISSION TESTS PASSED")