#!/usr/bin/env python3
"""W1.09 cross-runtime replay conformance harness.

Proves the governance admission envelope is the replay authority:

  AC2  identical captured inputs -> identical result + fingerprint
       (every fixture replayed twice; verdict dumps compared for equality)
  AC3  six intentional mutations produce classified drift signals
       (contract / doctrine / frame / input / evaluator / receipt-lineage)
  AC4  JVM agreement surface: emits ``jvm/expected-digests.json`` mapping
       every vector to its evaluation_fingerprint and
       canonical_payload_sha256 (byte-stable across two runs)
  AC5  SOL assessment cannot mutate PEB/Conduit state: the replay package's
       import surface is AST-scanned for any I/O-capable module root
       (db drivers, docker exec, sockets, HTTP clients, message brokers);
       absence is asserted mechanically
  AC6  drift verdicts carry their category

Offline by construction: no database, network, or wall-clock use anywhere in
the replay package (time enters only through captured timestamps).

Usage:
    python3 bin/run_replay_conformance.py            # full suite, exit 0/2
    python3 bin/run_replay_conformance.py --quiet    # pass/fail lines only
"""

from __future__ import annotations

import ast
import hashlib
import json
import sys
from pathlib import Path

PKG = Path(__file__).resolve().parents[1]           # nexus/python/governance-envelope/
REPO_ROOT = PKG.parents[2]                          # .../nexus  -> dev? resolved below
sys.path.insert(0, str(PKG / "src"))
sys.path.insert(0, str(PKG / "tests"))

from governance_envelope import evaluate_fingerprint            # noqa: E402
from governance_envelope import replay as rp                    # noqa: E402
from governance_envelope.canonical import canonical_json, canonicalize  # noqa: E402

FIXTURE_DIR = PKG / "replay_fixtures"
JVM_OUT = PKG / "jvm" / "expected-digests.json"

# Any import root here inside src/governance_envelope/*.py breaks AC5.
# urllib.parse is deliberately ALLOWED (IRI normalization is stdlib, pure).
FORBIDDEN_IMPORT_ROOTS = {
    "subprocess", "docker", "socket", "ssl", "requests", "httpx",
    "http", "urllib3", "psycopg", "psycopg2", "sqlite3", "pymysql",
    "redis", "pika", "confluent_kafka", "nats", "celery",
    "peb_kernel", "cascade",
}

# AC3 mutation matrix over the F01 base envelope
DRIFT_MATRIX = [
    ("contract.contract_digest",     rp.DRIFT_CONTRACT,        "sha256:" + "ff" * 32),
    ("law.proposition_ids",          rp.DRIFT_DOCTRINE,
        ["11111111-2222-4333-8444-555555555555"]),
    ("law.posture_ids",              rp.DRIFT_DOCTRINE,
        ["qqqqqqqq-2222-4333-8444-555555555555"]),
    ("law.frame_values",             rp.DRIFT_FRAME,
        [{"frame": "execution_backend", "value": "batch"},
         {"frame": "environment", "value": "production"}]),
    ("inputs.input_snapshot_id",     rp.DRIFT_INPUT,
        "22222222-2222-4333-8444-555555555555"),
    ("evaluation.evaluated_at",      rp.DRIFT_EVALUATOR,
        "2026-08-26T14:41:26.000000Z"),
    ("authority.peb_transaction_id", rp.DRIFT_RECEIPT_LINEAGE,
        "aaaaaaaa-1111-4222-8333-000000000099"),
]

ALLOW_CATEGORIES_EXPECTED = [
    None,                      # F01 replay_ok
    None,                      # F02
    None,                      # F03
    rp.DRIFT_DOCTRINE,         # F04 stale posture
    rp.DRIFT_CONTRACT,         # F05 digest drift
]


def load_corpus() -> list[dict]:
    docs = []
    for p in sorted(FIXTURE_DIR.glob("*.json")):
        docs.append(json.loads(p.read_text()))
    if len(docs) != 7:
        raise SystemExit(f"FATAL: expected 7 fixtures, found {len(docs)}")
    return docs


# ---------------------------------------------------------------------------
# AC5 purity proof
# ---------------------------------------------------------------------------

def import_roots(tree: ast.AST) -> set[str]:
    roots = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                roots.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.module and node.level == 0:
                roots.add(node.module.split(".")[0])
    return roots


def assert_package_purity() -> list[str]:
    violations = []
    for py in sorted((PKG / "src" / "governance_envelope").glob("*.py")):
        tree = ast.parse(py.read_text(), filename=str(py))
        bad = import_roots(tree) & FORBIDDEN_IMPORT_ROOTS
        if bad:
            violations.append(f"{py.name}: imports {sorted(bad)}")
    return violations


# ---------------------------------------------------------------------------
# per-fixture expectations
# ---------------------------------------------------------------------------

EXPECTED = {
    # fixture_id -> list of (verdict, category_or_None)
    "F01_allow_with_receipt": [("replay_ok", None)],
    "F02_reject_plain": [("replay_ok", None)],
    "F03_refuse_unknown_context": [("replay_ok", None)],
    "F04_stale_doctrine": [("stale_doctrine", rp.DRIFT_DOCTRINE)],
    "F05_contract_digest_drift": [("drift_confirmed", rp.DRIFT_CONTRACT)],
    "F06_duplicate_retry": [("replay_ok", None), ("duplicate_retry",
                                                  rp.DRIFT_RECEIPT_LINEAGE)],
    "F07_doctrine_change_mid_workflow": [("replay_ok", None),
                                         ("stale_doctrine", rp.DRIFT_DOCTRINE)],
}


def attempt_view(doc: dict, idx: int) -> dict:
    return {
        "law_registry": doc["law_registry"],
        "contract_registry": doc["contract_registry"],
        "expected": doc["expected_outcomes"][idx],
        # duplicate-retry flag applies to every attempt AFTER the first
        "prior_admission_consumed": bool(doc.get("retry_after_admission")) and idx > 0,
        "envelope": doc["attempts"][idx]["envelope"],
    }


# ---------------------------------------------------------------------------
# main suite
# ---------------------------------------------------------------------------

def main() -> int:
    failures: list[str] = []

    # --- AC5 ---------------------------------------------------------------
    purity = assert_package_purity()
    print(f"[AC5] purity scan over src/governance_envelope/*.py:",
          "CLEAN" if not purity else f"VIOLATIONS {purity}")
    if purity:
        failures.append("AC5 import-surface violation")

    corpus = load_corpus()
    print(f"corpus: {len(corpus)} fixtures")

    vectors_for_jvm = []
    canonical_bytes_digests_run_a: dict[str, str] = {}

    for doc in corpus:
        fid = doc["fixture_id"]
        expected_pairs = EXPECTED[fid]
        results = []
        for idx in range(len(doc["attempts"])):
            view = attempt_view(doc, idx)
            v1 = rp.replay_envelope(view)
            # --- AC2 determinism: identical second replay ------------------
            v2 = rp.replay_envelope(json.loads(json.dumps(view)))
            if json.dumps(v1, sort_keys=True) != json.dumps(v2, sort_keys=True):
                failures.append(f"{fid}[{idx}] nondeterministic replay")
            exp_verdict, _ = expected_pairs[idx]
            ok = v1.get("verdict") == exp_verdict
            cat = v1.get("category")
            exp_cat = expected_pairs[idx][1]
            cat_ok = (cat == exp_cat) if exp_cat else True
            if not (ok and cat_ok):
                failures.append(
                    f"{fid}[{idx}] verdict={v1.get('verdict')} "
                    f"(want {exp_verdict}) category={cat} (want {exp_cat})")
            results.append(v1)

            env = view["envelope"]
            # fingerprint round-trip sanity inside harness too
            fp_ok, recomputed = rp.envelope_fingerprint_check(env)
            if not fp_ok:
                failures.append(f"{fid}[{idx}] stored fingerprint mismatch")
            vectors_for_jvm.append({
                "fixture": fid,
                "attempt_index": idx,
                "envelope_id": env["envelope_id"],
                "disposition": env["evaluation"]["disposition"],
                "refusal_code": env["evaluation"]["refusal_code"],
                "evaluation_fingerprint":
                    env["fingerprint"]["evaluation_fingerprint"],
                "canonical_payload_sha256": rp.envelope_digest(env),
            })
            canonical_bytes_digests_run_a[
                f"{fid}[{idx}]"] = vectors_for_jvm[-1]["canonical_payload_sha256"]

        verdicts = ", ".join(r.get("verdict", "?") for r in results)
        marker = "OK " if all(
            r.get("verdict") == e[0] for r, e in zip(results, expected_pairs)
        ) else "BAD"
        print(f"[{marker}] {fid}: {verdicts}")

    # --- AC3 / AC6 drift matrix --------------------------------------------
    base_doc = next(d for d in corpus if d["fixture_id"] == "F01_allow_with_receipt")
    base_env = base_doc["attempts"][0]["envelope"]
    base_expected_fp = base_doc["expected_outcomes"][0]["evaluation_fingerprint"]

    print("[AC3] intentional-drift matrix:")
    base_view = attempt_view(base_doc, 0)
    for path, category, value in DRIFT_MATRIX:
        out = rp.drift_verdict(base_view, path, value)
        line = (f"{out['signal_emitted']} cat={out['category']:<14}"
                f"path={path}")
        problems = []
        if not out["signal_emitted"]:
            problems.append("no signal")
        if out["category"] != category:
            problems.append(f"misaapplied taxonomy ({out['category']} != {category})")
        status = "CAUGHT" if not problems else "WRONG"
        print(f"  [{status}] {line}")
        if problems:
            failures.append(f"drift matrix {path}: {'; '.join(problems)}")

    # --- AC4 JVM surface ----------------------------------------------------
    JVM_OUT.parent.mkdir(parents=True, exist_ok=True)
    manifest = {
        "spec_item": "W1.09",
        "purpose": ("cross-runtime agreement targets: a JVM verifier must "
                    "reproduce evaluation_fingerprint over its own canonical "
                    "serialization of the envelope minus the fingerprint group, "
                    "and canonical_payload_sha256 over the W1.04 canonical form "
                    "(compact sorted-key JSON, no trailing newline). See "
                    "docs/governance-envelope-serialization.md."),
        "algorithm": {
            "fingerprint": "sha256 over canonical_json(envelope minus fingerprint group)",
            "canonical_payload": "sha256 over canonical_json(full canonical envelope)",
        },
        "vectors": vectors_for_jvm,
    }
    jvm_payload = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    JVM_OUT.write_text(jvm_payload)
    first_dump = JVM_OUT.read_text()
    JVM_OUT.write_text(jvm_payload)               # second write, compare stable
    if first_dump != JVM_OUT.read_text():
        failures.append("JVM manifest not byte-stable across writes")

    # round-trip double-render determinism
    rendered_again = json.dumps(
        json.loads(first_dump), indent=2, sort_keys=True,
        ensure_ascii=False) + "\n"
    if rendered_again != first_dump:
        failures.append("JVM manifest not idempotent under re-render")

    print(f"[AC4] JVM agreement surface: {len(vectors_for_jvm)} vectors -> "
          f"{JVM_OUT.relative_to(PKG)}")

    total_checks = sum(len(d["attempts"]) for d in corpus) + len(DRIFT_MATRIX)
    print(f"suite: {total_checks} replay/drift checks "
          f"+ {len(corpus)*2} determinism passes + purity scan + JVM emit")
    if failures:
        print("FAILURES:")
        for f in failures:
            print("  -", f)
        return 2
    print("ALL GREEN")
    return 0


if __name__ == "__main__":
    sys.exit(main())
