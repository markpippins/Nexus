"""
D-T21-1 conformance: conduit's CCNF bridge is a *caller* of nexus_core.wrp.compile.

Guards the T21 re-point of ``python/conduit/ccnf_bridge.py``: CER emission is
delegated to ``nexus_core.wrp.compile.compile_ccnf_input`` (the single compile
entry point). There is no Go subprocess and no alternate emitter — conduit's
compile path is a caller, never a second emitter.

Tested invariants:
  B1 — No divergent emission: ``call_ccnf_conformance`` produces the exact CER
       ``compile_ccnf_input`` produces for the same input (and the source
       behavior — collapse key present, state_delta ``[]`` — not the stale
       Go-binary shape).
  B2 — Single identity derivation: the bridge hash is the CER signature hash,
       and the CER entity_key is the canonical WR birth identity (no re-derivation).
  B3 — Fail-closed contract preserved: invalid input raises CCNFBridgeError
       (callers fall back to the non-CCNF path exactly as before).
  B4 — Determinism: the same DCO compiles to an identical CER/hash.
  B5 — Receipt path intact: CERBinder.attach_execution still builds a receipt
       from the compiled CER.

Deterministic and LLM-free. No DB, no binaries, no network.

Usage:
    cd /home/codex/dev/nexus/python
    python3 -m pytest conduit/tests/test_ccnf_bridge_compile.py -v
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))  # python/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))        # conduit/

from ccnf_bridge import (                              # noqa: E402
    CCNFAdapter,
    CCNFBridgeError,
    CERBinder,
    call_ccnf_conformance,
)
from nexus_core.wrp.compile import compile_ccnf_input  # noqa: E402
from nexus_core.wrp.identity import emit_identity      # noqa: E402

# A canonical WorkRequest DCO (deterministic created_at -> fixed timestamp).
DCO = {
    "id": "wr-bridge-001",
    "metadata": {"agent_id": "builder", "created_at": "2026-05-16T00:00:00Z"},
    "lineage": {"derived_from": ["plan:001"]},
    "intent": {"problem_statement": "Add a widget", "desired_outcome": "Done"},
    "constraints": {"safety_constraints": ["no schema changes"]},
    "artifacts": {"produced_files": [{"path": "src/widget.py"}]},
}


class TestBridgeNoDivergentEmission(unittest.TestCase):
    """B1 — the bridge emits exactly what compile_ccnf_input emits."""

    def test_bridge_cer_equals_compile_cer(self):
        ccnf_input = CCNFAdapter.from_work_request(DCO)
        result = call_ccnf_conformance(ccnf_input)
        direct = compile_ccnf_input(ccnf_input)
        self.assertEqual(result.cer, direct, "bridge diverges from compile.py")
        self.assertEqual(result.hash, direct["signature"]["hash"])

    def test_bridge_emits_source_behavior_not_stale_binary(self):
        # Source behavior (T21 target): collapse key derived + state_delta [].
        # The stale Go binary emitted collapse_key null / state_delta null.
        result = call_ccnf_conformance(CCNFAdapter.from_work_request(DCO))
        self.assertEqual(
            result.cer["identity"]["collapse_key"],
            "workrequest:workrequest:wr-bridge-001")
        self.assertEqual(result.cer["state_delta"], [])
        self.assertEqual(result.cer["artifact_refs"], None)
        self.assertEqual(result.cer["payload"]["meta"]["work_request"]["id"],
                         "wr-bridge-001")


class TestBridgeSingleIdentity(unittest.TestCase):
    """B2 — single identity derivation; hash == signature.hash."""

    def test_hash_is_cer_signature_hash(self):
        result = call_ccnf_conformance(CCNFAdapter.from_work_request(DCO))
        self.assertEqual(result.hash, result.cer["signature"]["hash"])

    def test_entity_key_is_wr_birth_identity(self):
        result = call_ccnf_conformance(CCNFAdapter.from_work_request(DCO))
        birth = {
            "event_id": "wr-bridge-001",
            "actor": {"type": "system", "id": "builder"},
            "intent": {"action": "execute", "target_type": "workrequest",
                       "target_id": "workrequest:wr-bridge-001"},
            "domain": "execution",
        }
        self.assertEqual(result.cer["identity"]["entity_key"],
                         emit_identity(birth)[0])


class TestBridgeFailClosed(unittest.TestCase):
    """B3 — invalid input raises CCNFBridgeError (caller fall-back contract)."""

    def test_missing_intent_raises_bridge_error(self):
        with self.assertRaises(CCNFBridgeError):
            call_ccnf_conformance({
                "actor": {"type": "system", "id": "x"},
                "domain": "execution",
                "event_id": "e1",
                # intent missing -> STRUCTURAL_PARSE_FAILURE
            })

    def test_free_text_intent_raises_bridge_error(self):
        with self.assertRaises(CCNFBridgeError):
            call_ccnf_conformance({
                "actor": {"type": "system", "id": "x"},
                "intent": "build the thing",
                "domain": "execution",
                "event_id": "e1",
            })

    def test_binary_path_param_is_ignored(self):
        # The legacy binary_path arg must be a no-op — the pure-Python compiler
        # is authoritative (no subprocess). Passing a bogus path must NOT error.
        result = call_ccnf_conformance(
            CCNFAdapter.from_work_request(DCO),
            binary_path="/nonexistent/ccnf-conformance")
        self.assertTrue(result.hash)


class TestBridgeDeterminism(unittest.TestCase):
    """B4 — the same DCO compiles to an identical CER."""

    def test_compile_twice_identical(self):
        ccnf_input = CCNFAdapter.from_work_request(DCO)
        a = call_ccnf_conformance(ccnf_input)
        b = call_ccnf_conformance(CCNFAdapter.from_work_request(DCO))
        self.assertEqual(a.cer, b.cer)
        self.assertEqual(a.hash, b.hash)


class TestBridgeReceiptPath(unittest.TestCase):
    """B5 — CERBinder still builds receipts from the compiled CER."""

    def test_receipt_fields_from_cer(self):
        result = call_ccnf_conformance(CCNFAdapter.from_work_request(DCO))
        receipt = CERBinder.attach_execution(
            cer_json=result.cer,
            session_id="sess-1",
            plan_id="",
            wr_id="wr-bridge-001",
            status="SUCCESS",
            started_at=100,
            completed_at=120,
        )
        self.assertEqual(receipt["ccnf_hash"], result.hash)
        self.assertEqual(receipt["request_id"], "wr-bridge-001")
        self.assertEqual(receipt["cer_root_hash"],
                         result.cer["identity"]["entity_key"])
        self.assertEqual(receipt["trace_event_count"], 1)
        self.assertEqual(receipt["status"], "SUCCESS")
        self.assertIsNone(receipt["failure"])


if __name__ == "__main__":
    unittest.main()
