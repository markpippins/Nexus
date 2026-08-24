"""
wr-conf-010: cross-language CCNF entity-key conformance — the "computed
identically by Go/Rust/Python via I8" claim, guarded.

The governance & identity stack thread (ded5b0de, architect disposition #2)
ACCEPTED entity_key as the canonical asset identity hash, verifying that it
is "content-addressed, cross-host deterministic, computed identically by
Go/Rust/Python via I8". This test locks that claim: the pure-Python emitter
(nexus_core/wrp/identity.py) must agree byte-for-byte with the Go reference
binary and be accepted by the Rust verifier on the same inputs.

Tested invariants:
  AC1 — Python == Go: emit_identity() produces the same entity_key + scope as
        `ccnf-conformance process` on multiple vectors (execution /
        specification / system domains, nested actor maps).
  AC2 — Rust accepts: the CER produced by the Go binary from the same input
        verifies cleanly under the Rust ccnf-verifier (exit 0).
  AC3 — Golden vector: the probe document's entity_key is the exact value
        recorded in the thread (aa512485…), so regressions fail even without
        the binaries.
  AC4 — Error contract: missing intent.action raises ValueError (same as the
        Go source's "no action in intent"); actions outside the controlled
        vocabulary raise (INTENT_NORMALIZATION_FAILURE parity).
  AC5 — CanonicalJSON determinism: key order never affects the entity_key,
        and the derivation is stable across calls (pure function).
  AC6 — Q4 P1 (plan 1287): the canonical WR birth shape (built by
        ccnf_input_from_dco_json / ccnf_input_from_intent_string) hashes to
        the golden value, and no live vision.work_requests row with a
        compile-unit identity (non-empty wr_id) carries a NULL entity_key —
        every stored key must equal the pure-Python mirror re-derived from
        the row's dco_json + wr_id (locks the V093 SQL backfill). Identity-
        less rows (wr_id NULL/'') are resolution-comparator fixtures (e.g.
        the `wr-mongo-wiring` seed) with no compile-unit identity, exactly
        the class conduit's v17 event-log backfill skips — they are not WRs
        and cannot carry a birth identity. DB-backed test skips when the
        local nexus DB is absent.

Deterministic and LLM-free. The Go/Rust binaries are repo-committed under
go/wrp/ccnf-ref/bin and rust/wrp/ccnf-verifier/target/release; tests skip
gracefully if a binary is missing so the rest of the suite stays green.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_ccnf_identity.py -v
"""
import json
import os
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from nexus_core.wrp.identity import (                               # noqa: E402
    canonical_json,
    ccnf_input_from_dco_json,
    ccnf_input_from_intent_string,
    derive_entity_key,
    emit_identity,
    normalize_intent,
)

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))
GO_BIN = os.path.join(NEXUS_ROOT, "go", "wrp", "ccnf-ref", "bin", "ccnf-conformance")
RUST_BIN = os.path.join(NEXUS_ROOT, "rust", "wrp", "ccnf-verifier", "target", "release", "ccnf-verifier")


def _connect():
    import psycopg2
    return psycopg2.connect(
        host=os.environ.get("PGHOST", "localhost"),
        port=int(os.environ.get("PGPORT", "5432")),
        user=os.environ.get("PGUSER", "pguser"),
        password=os.environ.get("PGPASSWORD", "pgpass"),
        dbname=os.environ.get("PGDATABASE", "nexus"),
    )


def _db_available():
    try:
        conn = _connect()
        conn.close()
        return True
    except Exception:  # noqa: BLE001 — graceful skip, no DB in CI
        return False

# Golden value recorded in the governance thread (ded5b0de) — the probe doc
# below is the exact document whose entity_key the architect's inventory cites.
GOLDEN_PROBE = {
    "event_id": "wr-0001",
    "actor": {"type": "system", "id": "conduit"},
    "intent": {"action": "execute", "target_type": "workrequest",
               "target_id": "workrequest:wr-0001"},
    "domain": "execution",
    "timestamp": 1720000000,
    "payload": {"data": {}, "meta": {}},
}
GOLDEN_ENTITY_KEY = "aa512485a017493fedf97827e25f29cb1bd4d071656a94cd1b4e6d9c0d92779a"

VECTORS = [
    GOLDEN_PROBE,
    {
        "event_id": "wr-0002",
        "actor": {"type": "agent", "id": "planner"},
        "intent": {"action": "validate", "target_type": "requirement",
                   "target_id": "req:r1"},
        "domain": "specification",
        "timestamp": 1720000001,
        "priority": 5,
    },
    {
        "event_id": "wr-0003",
        "actor": {"type": "system", "id": "watchdog"},
        "intent": {"action": "create", "target_type": "session",
                   "target_id": "sess:abc"},
        "domain": "system",
        "timestamp": 1720000002,
        "confidence": 0.5,
    },
    # Canonical WR birth shape (Q4 P1 / V093 backfill): a WR is a system
    # `execute` on its workrequest target. This is the exact shape the
    # ccnf_input_from_* builders emit, so Python/Go parity here locks the
    # backfill shape to the reference binaries.
    {
        "event_id": "wr-0004",
        "actor": {"type": "system", "id": "conduit"},
        "intent": {"action": "execute", "target_type": "workrequest",
                   "target_id": "workrequest:wr-0004"},
        "domain": "execution",
    },
]


def _go_process(doc: dict) -> dict:
    p = subprocess.run(
        [GO_BIN, "process"],
        input=json.dumps(doc).encode(),
        capture_output=True, timeout=30,
    )
    if p.returncode != 0:
        raise RuntimeError(f"Go process failed: {p.stderr.decode()[:300]}")
    return json.loads(p.stdout)


class TestAc1PythonMatchesGo(unittest.TestCase):
    """AC1 — the pure-Python emitter agrees with the Go reference binary."""

    @unittest.skipUnless(os.path.exists(GO_BIN), f"go binary missing: {GO_BIN}")
    def test_entity_key_and_scope_match_go_on_all_vectors(self):
        for i, doc in enumerate(VECTORS):
            with self.subTest(vector=i):
                py_key, py_type, py_scope = emit_identity(doc)
                cer = _go_process(doc)
                ident = cer["identity"]
                self.assertEqual(py_key, ident["entity_key"],
                                 f"vector {i}: Python/Go entity_key diverge")
                self.assertEqual(py_scope, ident["scope"],
                                 f"vector {i}: Python/Go scope diverge")
                self.assertEqual(py_type, ident["type"])

    def test_derive_entity_key_helper(self):
        # The convenience helper must agree with the full tuple unpack.
        # Pure-Python assertion — no subprocess needed.
        self.assertEqual(derive_entity_key(GOLDEN_PROBE),
                         emit_identity(GOLDEN_PROBE)[0])


class TestAc2RustVerifierAccepts(unittest.TestCase):
    """AC2 — the Rust verifier accepts the Go-produced CER for same inputs."""

    @unittest.skipUnless(os.path.exists(RUST_BIN), f"rust verifier missing: {RUST_BIN}")
    def test_rust_verifies_go_cer(self):
        for i, doc in enumerate(VECTORS):
            with self.subTest(vector=i):
                cer = _go_process(doc)
                p = subprocess.run(
                    [RUST_BIN, "--stdin"],
                    input=json.dumps(cer).encode(),
                    capture_output=True, timeout=30,
                )
                self.assertEqual(p.returncode, 0,
                                 f"vector {i}: Rust rejected Go CER: {p.stderr.decode()[:200]}")
                # Rust prints its own ccnf_hash line — ensure it emitted one.
                self.assertIn(b"ccnf_hash", p.stdout)


class TestAc3GoldenVector(unittest.TestCase):
    """AC3 — the exact value recorded in the thread must never drift."""

    def test_golden_entity_key(self):
        key, _, scope = emit_identity(GOLDEN_PROBE)
        self.assertEqual(key, GOLDEN_ENTITY_KEY)
        self.assertEqual(scope, "executiongraph.v2")


class TestAc4ErrorContract(unittest.TestCase):
    """AC4 — failure parity with the Go source."""

    def test_missing_action_raises(self):
        with self.assertRaises(ValueError):
            emit_identity({"domain": "execution", "intent": {"target_type": "x"}})

    def test_free_text_intent_raises(self):
        with self.assertRaises(ValueError):
            normalize_intent("build the thing")

    def test_unknown_action_raises(self):
        with self.assertRaises(ValueError):
            normalize_intent({"action": "plan", "target_type": "x"})  # not in controlled vocab

    def test_non_map_actor_and_domain_coerce_like_go(self):
        # Go's getMap/getString coerce non-dict actor -> nil and non-string
        # domain -> "" BEFORE hashing. Assert the Python mirror does the same
        # (guards the malformed-input drift class, not just well-formed docs).
        key_str_actor, _, scope_str = emit_identity(
            {"domain": "execution", "actor": "conduit",
             "intent": {"action": "execute"}})
        key_null_actor, _, scope_null = emit_identity(
            {"domain": "execution", "actor": None,
             "intent": {"action": "execute"}})
        self.assertEqual(key_str_actor, key_null_actor,
                         "string actor must coerce to nil like Go getMap")
        self.assertEqual(scope_str, scope_null)
        _, _, scope_int_domain = emit_identity(
            {"domain": 5, "actor": {"type": "system", "id": "x"},
             "intent": {"action": "execute"}})
        self.assertEqual(scope_int_domain, ".v1",
                         "non-string domain must coerce to '' -> '.v1' like Go")

    def test_controlled_vocab_actions_accepted(self):
        for action in ("create", "update", "delete", "execute", "validate", "emit"):
            with self.subTest(action=action):
                norm = normalize_intent({"action": action})
                self.assertEqual(norm["type"], "normalized_verb")
                self.assertEqual(norm["action"], action)


class TestAc5CanonicalJsonDeterminism(unittest.TestCase):
    """AC5 — CanonicalJSON + derivation are pure and key-order independent."""

    def test_map_key_order_does_not_change_entity_key(self):
        base = dict(GOLDEN_PROBE)
        # Python dicts preserve insertion order; emit from a reversed-key copy.
        shuffled = {"timestamp": base["timestamp"], "payload": base["payload"],
                    "domain": base["domain"], "intent": base["intent"],
                    "actor": base["actor"], "event_id": base["event_id"]}
        self.assertEqual(emit_identity(shuffled)[0], GOLDEN_ENTITY_KEY)

    def test_canonical_json_is_sorted_and_compact(self):
        self.assertEqual(canonical_json({"b": 1, "a": [2, 1]}), '{"a":[2,1],"b":1}')
        self.assertEqual(canonical_json(None), "null")
        self.assertEqual(canonical_json(True), "true")
        self.assertEqual(canonical_json("a\nb"), '"a\\nb"')

    def test_derivation_stable_across_calls(self):
        self.assertEqual(emit_identity(GOLDEN_PROBE), emit_identity(GOLDEN_PROBE))


class TestWrBirthShapeIdentity(unittest.TestCase):
    """Q4 P1 / V093 — the canonical WR birth shape carries the golden CCNF
    identity, so the backfill document and the app-layer write paths produce
    the exact reference value (aa512485…)."""

    def test_birth_shape_is_golden(self):
        doc = ccnf_input_from_dco_json(
            json.dumps({"wrId": "wr-0001", "intent": {"type": "test"}}),
            "wr-0001")
        self.assertEqual(emit_identity(doc)[0], GOLDEN_ENTITY_KEY)
        key_from_intent = emit_identity(
            ccnf_input_from_intent_string("free-text intent", "wr-0001"))[0]
        self.assertEqual(key_from_intent, GOLDEN_ENTITY_KEY)

    def test_dco_json_falls_back_to_embedded_wr_id(self):
        doc = ccnf_input_from_dco_json(json.dumps({"wrId": "asof-final"}))
        self.assertEqual(doc["event_id"], "asof-final")
        self.assertEqual(doc["intent"]["target_id"], "workrequest:asof-final")

    def test_free_text_intent_never_breaks_birth_shape(self):
        # action is the controlled verb `execute`, so the WR shape is always
        # emittable — the caller-side write path never null-defaults.
        for intent in ("", "build the thing", "run the pipeline"):
            key, _, _ = emit_identity(ccnf_input_from_intent_string(intent, "wr-x"))
            self.assertTrue(key)


@unittest.skipUnless(_db_available(), "no local nexus DB")
class TestNoLiveWrNullEntityKey(unittest.TestCase):
    """Q4 P1 — no live vision.work_requests row has a NULL entity_key, and
    every stored key equals the pure-Python mirror re-derived from the row's
    dco_json + wr_id (locks the V093 SQL backfill to the emitter)."""

    def test_no_live_wr_null_entity_key(self):
        conn = _connect()
        try:
            cur = conn.cursor()
            # Scope: rows with a compile-unit identity only (wr_id present).
            # Identity-less rows are resolution-comparator fixtures, not WRs
            # (see module docstring AC6) — same convention as conduit's v17
            # event-log backfill, which skips them.
            cur.execute(
                "SELECT count(*) FILTER (WHERE entity_key IS NULL), count(*) "
                "FROM vision.work_requests "
                "WHERE wr_id IS NOT NULL AND wr_id <> ''")
            nulls, total = cur.fetchone()
            cur.execute(
                "SELECT wr_id, dco_json, entity_key FROM vision.work_requests "
                "WHERE wr_id IS NOT NULL AND wr_id <> ''")
            rows = cur.fetchall()
        finally:
            conn.close()
        self.assertEqual(
            nulls, 0, f"{nulls}/{total} compile-unit WRs have NULL entity_key")
        for wr_id, dco_json, ek in rows:
            with self.subTest(wr_id=wr_id):
                self.assertEqual(
                    emit_identity(ccnf_input_from_dco_json(dco_json, wr_id))[0],
                    ek, "stored entity_key diverges from pure-Python mirror")


if __name__ == "__main__":
    unittest.main()
