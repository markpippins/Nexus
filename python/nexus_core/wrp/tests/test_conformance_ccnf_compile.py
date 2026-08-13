"""
wr-conf-012: T21 compile-time CCNF/CER emission conformance.

Guards the single compiler entry point (``nexus_core/wrp/compile.py``) that T21
delivers: Spec + Plan -> validated WorkRequest -> CER + entity_key, fail-closed
and deterministic, reusing ``identity.py`` so the entity-key bytes match the Go
reference exactly.

Tested invariants:
  AC1 — Golden-vector entity_key parity: every CCNF golden vector
        (go/wrp/ccnf-ref/vectors/v1) produces the entity_key recorded in
        expected-hashes.json (drift-free — identity hashes only
        {domain, intent, actor, scope}).
  AC2 — Error contract: error vectors raise the exact Go error code
        (INTENT_NORMALIZATION_FAILURE, ARTIFACT_RESOLUTION_FAILURE,
        CCNF_VERSION_MISMATCH).
  AC3 — Compile golden vectors: minimal / full / zero-filesAffected /
        duplicate-AC / unicode compile fixtures pin both entity_key AND
        canonical_hash (regression-locked).
  AC4 — Determinism: compiling the same input twice is byte-identical.
  AC5 — Single identity derivation: the compile entity_key equals
        ``identity.emit_identity`` of the canonical WR birth shape (no second
        derivation — T21 item 5).
  AC6 — Version gate: manifest == embedded constant; unknown/newer version
        fails closed.
  AC7 — Fail-closed: missing spec/plan fields, invalid intent, non-canonical
        serialization all raise (never a partial WR/CER).
  AC8 — Cross-language: the emitted CER verifies cleanly under the Rust
        ccnf-verifier (exit 0 + ccnf_hash line), independently confirming the
        canonical serialization + hash.

KNOWN DRIFT (surfaced to the Architect, not silently papered over):
  ``go/wrp/ccnf-ref/bin/ccnf-conformance`` is a stale build — it neither
  derives ``identity.collapse_key`` nor resolves artifacts, and
  expected-hashes.json was generated from that stale binary. So
  ``canonical_hash`` parity against expected-hashes.json is asserted only for
  compile fixtures (where WE own the pinned values); for the CCNF golden
  vectors, only the drift-free ``entity_key`` is asserted. Full byte parity
  requires rebuilding the Go binary from source and regenerating
  expected-hashes.json.

Deterministic and LLM-free. The Go/Rust binaries are repo-committed; Rust is
required only for AC8 and skips gracefully when missing.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_ccnf_compile.py -v
"""

import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from nexus_core.wrp.compile import (                             # noqa: E402
    CCNF_VERSION,
    CCNFVersionMismatch,
    CompileError,
    HashMismatch,
    IntentNormalizationFailure,
    MissingPlanField,
    MissingSpecField,
    StructuralParseFailure,
    build_envelope,
    compile_ccnf_input,
    compile_work_request,
    locked_ccnf_version,
    manifest_matches_constant,
    read_ccnf_version_manifest,
)
from nexus_core.wrp.identity import emit_identity               # noqa: E402

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
VECTORS_DIR = os.path.join(NEXUS_ROOT, "go", "wrp", "ccnf-ref", "vectors", "v1")
RUST_BIN = os.path.join(
    NEXUS_ROOT, "rust", "wrp", "ccnf-verifier", "target", "release", "ccnf-verifier"
)

# Error string (Go) -> CompileError code asserted for error vectors.
_ERROR_CODE_BY_STRING = {
    "INTENT_NORMALIZATION_FAILURE": "INTENT_NORMALIZATION_FAILURE",
    "ARTIFACT_RESOLUTION_FAILURE": "ARTIFACT_RESOLUTION_FAILURE",
    "CCNF_VERSION_MISMATCH": "CCNF_VERSION_MISMATCH",
    "STRUCTURAL_PARSE_FAILURE": "STRUCTURAL_PARSE_FAILURE",
    "DELTA_SCOPE_VIOLATION": "DELTA_SCOPE_VIOLATION",
}


def _load_vectors():
    """Load every golden vector (excluding expected-hashes.json)."""
    vectors = []
    for fn in sorted(os.listdir(VECTORS_DIR)):
        if not fn.endswith(".json") or fn == "expected-hashes.json":
            continue
        with open(os.path.join(VECTORS_DIR, fn), encoding="utf-8") as f:
            vectors.append((fn, json.load(f)))
    return vectors


def _inputs_of(vector):
    """Yield (label, input_dict) pairs, mirroring the Go runner."""
    for label in ("input", "input_a", "input_b"):
        if label in vector and isinstance(vector[label], dict):
            yield label, vector[label]


def _compile_fixtures():
    """Return the pinned compile fixtures: (name, spec, plan, timestamp,
    entity_key, canonical_hash)."""
    return [
        (
            "minimal",
            {"intent": "build it", "constraints": []},
            {"id": "wr-min", "goal": "Minimal work request",
             "files_affected": [], "acceptance_criteria": []},
            1720000000,
            "33db1b9c484bffd0d4c0aafaaa8c8c24c096a807fd17860d7adbeba02ab349d9",
            "e69b7726834e45617b1d5719bc8cf298c3e7e2967a438f95e00292fc44a979de",
        ),
        (
            "full",
            {"intent": {"action": "execute", "target_type": "plan",
                        "target_id": "plan:77"},
             "constraints": ["no schema changes", "keep it small"]},
            {"id": "wr-full", "goal": "Refactor the planner into focused modules",
             "files_affected": ["src/planner.py", "src/queue.py"],
             "acceptance_criteria": ["tests pass", "lint clean"],
             "title": "Planner refactor", "project": "nexus",
             "dependencies": ["0042"]},
            1720000001,
            "81d5da45420bd317cc6666fe2da97e88445ba7b5b727d81feacd463e28408055",
            "198f48e00ca9189b97a7ff20e15e18bfed53ff541ac75583d633bee2384f5c63",
        ),
        (
            "zero_files",
            {"intent": {"action": "validate", "target_type": "plan",
                        "target_id": "plan:9"}, "constraints": []},
            {"id": "wr-zero", "goal": "Validate only",
             "files_affected": [], "acceptance_criteria": ["no files touched"]},
            1720000002,
            "c5c9e8d7589ea0cdb181fb3d9252f78050ef36481e77b3a2d863539567bdcdc5",
            "30d9359f573f526c41f631d5db04526c5535309da3ad34f00f80da1e89153bea",
        ),
        (
            "dup_ac",
            {"intent": "dupe test", "constraints": []},
            {"id": "wr-dup", "goal": "Duplicate AC case",
             "files_affected": ["a.py"],
             "acceptance_criteria": ["x", "x", "y"]},
            1720000003,
            "04e53d96b668cb85b1a1ecfa7472a1504de0e074fb39565ce70a73ca7f31fde8",
            "09ee3f1abc900c32cfae477add5ea3a57fd87ca6841aea87aab50156adc7ce22",
        ),
        (
            "unicode",
            {"intent": "unicode goal", "constraints": []},
            {"id": "wr-uni", "goal": "R\u00e9sum\u00e9 \u2192 na\u00efve caf\u00e9\u200b edge",
             "files_affected": ["r\u00e9sum\u00e9.py"],
             "acceptance_criteria": ["caf\u00e9"]},
            1720000004,
            "4b7ef7eaedc083273ec9d22a87cdce9fd778cc993d0760b1830ee4aab6d1a8e2",
            "15762342cc6ee5d9d1238aa61c4a7408d21fd2c52b9405af117fd9c076d5306f",
        ),
    ]


class TestAc1GoldenVectorEntityKey(unittest.TestCase):
    """AC1 — entity_key parity on every CCNF golden vector (drift-free)."""

    def test_entity_key_matches_expected_on_all_vectors(self):
        for fn, vector in _load_vectors():
            expected = vector.get("expected") or {}
            err = expected.get("error")
            ccnf_version = vector.get("ccnf_version", CCNF_VERSION)
            if not isinstance(ccnf_version, int):
                ccnf_version = int(ccnf_version)
            for label, input_dict in _inputs_of(vector):
                suffix = {"input": "", "input_a": "_a", "input_b": "_b"}[label]
                with self.subTest(vector=fn, label=label):
                    if err:
                        # Error vector: assert the right error code.
                        code = _ERROR_CODE_BY_STRING.get(err, err)
                        with self.assertRaises(CompileError) as ctx:
                            compile_ccnf_input(input_dict, ccnf_version)
                        self.assertEqual(
                            ctx.exception.code, code,
                            f"{fn} ({label}): expected {code}")
                        continue
                    cer = compile_ccnf_input(input_dict, ccnf_version)
                    want_key = expected.get("entity_key" + suffix)
                    if want_key:
                        self.assertEqual(
                            cer["identity"]["entity_key"], want_key,
                            f"{fn} ({label}): entity_key diverged")


class TestAc2ErrorContract(unittest.TestCase):
    """AC2 — error codes match the Go error contract exactly."""

    def test_free_text_intent_rejected(self):
        with self.assertRaises(IntentNormalizationFailure) as ctx:
            compile_ccnf_input({
                "actor": {"type": "system", "id": "x"},
                "intent": "build the thing",
                "domain": "execution",
                "event_id": "e1",
            })
        self.assertEqual(ctx.exception.code, "INTENT_NORMALIZATION_FAILURE")

    def test_unknown_action_rejected(self):
        with self.assertRaises(IntentNormalizationFailure):
            compile_ccnf_input({
                "actor": {"type": "system", "id": "x"},
                "intent": {"action": "plan"},
                "domain": "execution",
                "event_id": "e1",
            })

    def test_missing_required_field(self):
        with self.assertRaises(StructuralParseFailure):
            compile_ccnf_input({
                "actor": {"type": "system", "id": "x"},
                "intent": {"action": "execute"},
                "domain": "execution",
                # event_id missing
            })

    def test_version_mismatch(self):
        with self.assertRaises(CCNFVersionMismatch):
            compile_ccnf_input({
                "actor": {"type": "system", "id": "x"},
                "intent": {"action": "execute"},
                "domain": "execution",
                "event_id": "e1",
            }, ccnf_version=999)


class TestAc3CompileGoldenVectors(unittest.TestCase):
    """AC3 — pinned entity_key + canonical_hash for compile fixtures."""

    def test_all_compile_fixtures_pinned(self):
        for name, spec, plan, ts, want_key, want_hash in _compile_fixtures():
            with self.subTest(fixture=name):
                result = compile_work_request(spec, plan, timestamp=ts)
                self.assertEqual(result.entity_key, want_key, name)
                self.assertEqual(result.canonical_hash, want_hash, name)


class TestAc4Determinism(unittest.TestCase):
    """AC4 — compile is byte-identical on repeat."""

    def test_compile_twice_identical(self):
        spec = {"intent": "d", "constraints": []}
        plan = {"id": "wr-d", "goal": "deterministic", "files_affected": [],
                "acceptance_criteria": []}
        a = compile_work_request(spec, plan, timestamp=1720000000)
        b = compile_work_request(spec, plan, timestamp=1720000000)
        self.assertEqual(a.entity_key, b.entity_key)
        self.assertEqual(a.canonical_hash, b.canonical_hash)
        self.assertEqual(a.cer, b.cer)

    def test_ccnf_input_fold_twice_identical(self):
        for fn, vector in _load_vectors():
            expected = vector.get("expected") or {}
            if expected.get("error"):
                continue
            for _, input_dict in _inputs_of(vector):
                ccnf_version = vector.get("ccnf_version", CCNF_VERSION)
                a = compile_ccnf_input(input_dict, int(ccnf_version), now_ts=0)
                b = compile_ccnf_input(input_dict, int(ccnf_version), now_ts=0)
                self.assertEqual(a, b, f"{fn} not deterministic")


class TestAc5SingleIdentityDerivation(unittest.TestCase):
    """AC5 — the compile entity_key equals the canonical WR birth identity."""

    def test_entity_key_is_single_derivation(self):
        spec = {"intent": "free text", "constraints": []}
        plan = {"id": "wr-1", "goal": "g", "files_affected": [],
                "acceptance_criteria": []}
        result = compile_work_request(spec, plan, timestamp=1720000000)
        birth = {
            "event_id": "wr-1",
            "actor": {"type": "system", "id": "conduit"},
            "intent": {"action": "execute", "target_type": "workrequest",
                       "target_id": "workrequest:wr-1"},
            "domain": "execution",
        }
        self.assertEqual(result.entity_key, emit_identity(birth)[0])
        # The envelope carries the CER's entity_key — no re-derivation.
        env = build_envelope(result)
        self.assertEqual(env["payload"]["entity_key"], result.entity_key)
        self.assertEqual(env["correlation_id"], "wr-1")
        self.assertEqual(env["ccnf_version"], CCNF_VERSION)


class TestAc6VersionGate(unittest.TestCase):
    """AC6 — manifest == constant; unknown/newer version fails closed."""

    def test_manifest_matches_constant(self):
        self.assertTrue(manifest_matches_constant())

    def test_locked_version_is_current(self):
        self.assertEqual(locked_ccnf_version(), CCNF_VERSION)
        self.assertEqual(read_ccnf_version_manifest(), CCNF_VERSION)

    def test_newer_version_fails_closed(self):
        spec = {"intent": "x", "constraints": []}
        plan = {"id": "w", "goal": "g", "files_affected": [],
                "acceptance_criteria": []}
        with self.assertRaises(CCNFVersionMismatch):
            compile_work_request(spec, plan, ccnf_version=CCNF_VERSION + 1)


class TestAc7FailClosed(unittest.TestCase):
    """AC7 — fail-closed: no partial WorkRequest/CER."""

    def _spec(self):
        return {"intent": "x", "constraints": []}

    def _plan(self):
        return {"id": "w", "goal": "g", "files_affected": [],
                "acceptance_criteria": []}

    def test_missing_spec_intent(self):
        with self.assertRaises(MissingSpecField):
            compile_work_request({"constraints": []}, self._plan())

    def test_missing_plan_id(self):
        with self.assertRaises(MissingPlanField):
            compile_work_request(self._spec(), {"goal": "g"})

    def test_missing_plan_goal(self):
        with self.assertRaises(MissingPlanField):
            compile_work_request(self._spec(), {"id": "w"})

    def test_invalid_intent_action(self):
        with self.assertRaises(IntentNormalizationFailure):
            compile_work_request(
                {"intent": {"action": "plan"}, "constraints": []}, self._plan())

    def test_bad_constraints_type(self):
        with self.assertRaises(MissingSpecField):
            compile_work_request(
                {"intent": "x", "constraints": "not-a-list"}, self._plan())

    def test_bad_files_affected_type(self):
        with self.assertRaises(MissingPlanField):
            compile_work_request(
                self._spec(),
                {"id": "w", "goal": "g", "files_affected": "nope",
                 "acceptance_criteria": []})

    def test_missing_timestamp_fails_closed(self):
        """A compile without a deterministic timestamp fails closed unless the
        caller explicitly opts into wall-clock (T21 determinism)."""
        with self.assertRaises(MissingPlanField):
            compile_work_request(self._spec(), self._plan())

    def test_use_wall_clock_allows_missing_timestamp(self):
        result = compile_work_request(
            self._spec(), self._plan(), use_wall_clock=True, now_ts=1720000000)
        self.assertEqual(result.cer["timestamp"], 1720000000)


@unittest.skipUnless(os.path.exists(RUST_BIN), f"rust verifier missing: {RUST_BIN}")
class TestAc8CrossLanguageRust(unittest.TestCase):
    """AC8 — the Rust verifier accepts the emitted CER (independent canonical
    serialization + hash confirmation)."""

    def test_rust_verifies_compile_cer(self):
        result = compile_work_request(
            {"intent": "r", "constraints": []},
            {"id": "wr-r", "goal": "rust check", "files_affected": [],
             "acceptance_criteria": []},
            timestamp=1720000000,
        )
        p = subprocess.run(
            [RUST_BIN, "--stdin"],
            input=json.dumps(result.cer).encode(),
            capture_output=True, timeout=30,
        )
        self.assertEqual(p.returncode, 0,
                         f"Rust rejected CER: {p.stderr.decode()[:300]}")
        self.assertIn(b"ccnf_hash", p.stdout)


if __name__ == "__main__":
    unittest.main()
