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

import json
import os
import shutil
import sys
import tempfile
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


class TestExecutorCcnfReceiptBlock(unittest.TestCase):
    """B6 — executor_cloud._run_from_path CCNF receipt block builds + posts.

    Guards the T21 re-point end-to-end shape inside the executor: with
    CONDUIT_USE_CCNF=true the delta payload is built from the compiled CER
    (no NameError — ``affected_plans`` is ``[wr_id]``, not the undefined
    ``plan_id``) and the receipt is POSTed to the kernel ``/delta/`` endpoint.
    The harness invocation is monkeypatched (LLM-free); the kernel URL is
    pointed at a local stub HTTP server.
    """

    @staticmethod
    def _valid_dco(wr_id):
        """A full WorkRequestDCO-valid document (schema-complete)."""
        return {
            "id": wr_id,
            "version": 1,
            "path": "/tmp",
            "intent": {
                "problem_statement": "Verify the CCNF receipt block",
                "desired_outcome": "Receipt posts to kernel",
                "domain": "execution",
                "priority": "medium",
                "user_intent_trace": "b6-test",
                "abstraction_level": "task",
            },
            "decomposition": {
                "strategy": "sequential",
                "steps": [{
                    "step_id": "s1",
                    "description": "run",
                    "dependencies": [],
                    "outputs": ["out"],
                    "type": "execution",
                }],
                "parallelism_model": "none",
                "recursion_allowed": False,
            },
            "requirements": {
                "functional": ["works"],
                "non_functional": [],
                "system_requirements": [],
                "tool_requirements": [],
            },
            "constraints": {
                "forbidden_actions": [],
                "safety_constraints": [],
                "resource_limits": None,
                "architectural_constraints": [],
            },
            "success_criteria": {
                "validation_rules": [],
                "acceptance_tests": [],
                "completion_conditions": [],
                "failure_modes": [],
            },
            "execution_state": {
                "status": "pending",
                "current_step": None,
                "progress": None,
                "retries": None,
                "error_state": None,
                "context_snapshot_ref": None,
                "last_updated": None,
            },
            "lineage": {
                "derived_from": [],
                "supersedes": None,
                "branches": [],
                "merge_history": [],
            },
            "artifacts": {
                "produced_files": [{"path": "out.txt", "type": "text"}],
                "intermediate_outputs": [],
            },
            "metadata": {
                "created_at": "2026-05-16T00:00:00Z",
                "updated_at": None,
                "agent_id": "builder",
                "mode": "oneshot",
                "tags": [],
                "session_id": "sess-b6",
                "role": "builder",
                "harness": "opencode",
                "model": "",
            },
        }

    @staticmethod
    def _write_dco(path, wr_id):
        with open(path, "w", encoding="utf-8") as f:
            json.dump(TestExecutorCcnfReceiptBlock._valid_dco(wr_id), f)
        return path

    def _patch_executor(self, ec, urlopen=None):
        """Shared monkeypatch + env scaffolding for executor tests."""
        saved = {
            "use_ccnf": os.environ.get("CONDUIT_USE_CCNF"),
            "kernel": os.environ.get("KERNEL_API_URL"),
            "run_opencode": ec.run_opencode,
            "urlopen": ec.urlopen,
            "capture_cost": ec._capture_session_cost,
            "heartbeat": ec.HEARTBEAT_INTERVAL_SECONDS,
        }
        ec.HEARTBEAT_INTERVAL_SECONDS = 1
        ec.run_opencode = lambda *a, **k: "[stub] done"
        ec._capture_session_cost = lambda *a, **k: None
        if urlopen is not None:
            ec.urlopen = urlopen
        return saved

    @staticmethod
    def _restore_executor(ec, saved):
        ec.run_opencode = saved["run_opencode"]
        ec.urlopen = saved["urlopen"]
        ec._capture_session_cost = saved["capture_cost"]
        ec.HEARTBEAT_INTERVAL_SECONDS = saved["heartbeat"]
        if saved["use_ccnf"] is None:
            os.environ.pop("CONDUIT_USE_CCNF", None)
        else:
            os.environ["CONDUIT_USE_CCNF"] = saved["use_ccnf"]
        if saved["kernel"] is None:
            os.environ.pop("KERNEL_API_URL", None)
        else:
            os.environ["KERNEL_API_URL"] = saved["kernel"]

    def test_ccnf_receipt_block_builds_and_posts(self):
        import executor_cloud as ec

        tmpdir = tempfile.mkdtemp(prefix="b6-")
        wr_id = "wr-b6-receipt-block"
        dco_path = self._write_dco(os.path.join(tmpdir, f"{wr_id}.json"), wr_id)

        received = {}

        class _KernelStub:
            """Fake urllib response for the kernel /delta/ POST."""

            def __enter__(self):
                return self

            def __exit__(self, *exc):
                return False

            def read(self):
                return json.dumps({"success": True, "version": 7}).encode()

        def _fake_urlopen(req, timeout=5):
            received["url"] = req.full_url
            received["method"] = req.get_method()
            received["data"] = json.loads(req.data.decode())
            return _KernelStub()

        saved = self._patch_executor(ec, urlopen=_fake_urlopen)
        try:
            os.environ["CONDUIT_USE_CCNF"] = "true"
            os.environ["KERNEL_API_URL"] = "http://stub-kernel:3103"

            exit_code = ec._run_from_path(dco_path)
            self.assertEqual(exit_code, 0)

            self.assertIn("url", received, "kernel /delta/ POST was not attempted")
            self.assertEqual(received["url"], "http://stub-kernel:3103/delta/")
            self.assertEqual(received["method"], "POST")
            payload = received["data"]
            self.assertEqual(payload["affected_plans"], [wr_id])
            receipt = payload["receipts"][0]
            self.assertEqual(receipt["type"], "CCNF_EXECUTION")
            self.assertEqual(receipt["plan_id"], wr_id)
            self.assertTrue(receipt["ccnf_hash"])
            self.assertEqual(receipt["metadata"]["request_id"], wr_id)
        finally:
            self._restore_executor(ec, saved)
            shutil.rmtree(tmpdir, ignore_errors=True)

    def test_ccnf_disabled_skips_receipt_post(self):
        import executor_cloud as ec

        tmpdir = tempfile.mkdtemp(prefix="b6-")
        wr_id = "wr-b6-disabled"
        dco_path = self._write_dco(os.path.join(tmpdir, f"{wr_id}.json"), wr_id)

        posted = []

        def _recording_urlopen(req, timeout=5):
            posted.append(req.full_url)
            raise RuntimeError("urlopen should never fire when CCNF is disabled")

        saved = self._patch_executor(ec, urlopen=_recording_urlopen)
        try:
            os.environ["CONDUIT_USE_CCNF"] = "false"

            exit_code = ec._run_from_path(dco_path)
            self.assertEqual(exit_code, 0)
            self.assertEqual(
                posted, [],
                "kernel /delta/ POST attempted with CONDUIT_USE_CCNF=false")
        finally:
            self._restore_executor(ec, saved)
            shutil.rmtree(tmpdir, ignore_errors=True)

class TestOllamaHarnessExplicitModel(unittest.TestCase):
    """B7 — run_ollama honors the DCO's explicit metadata.model verbatim.

    Guards the finding 8b1a8623 option D fix: the ollama harness talks to the
    local ollama server, which expects bare model names. An opencode-style
    ``ollama/<name>`` ID must be stripped to the bare name, a bare name must
    pass through untouched, and the role-config resolution (which returns
    opencode-qualified IDs like ``nvidia/z-ai/glm-5.2``) must only be used as
    a fallback when no explicit model is set. LLM-free (fake ollama module).
    """

    class _FakeOllama:
        """Records the model passed to ollama.generate and returns output."""

        def __init__(self):
            self.calls = []

        def generate(self, model, system=None, prompt=None, options=None):
            self.calls.append(model)
            return {"response": "verified"}

    def _patch_ollama(self, ec, fake):
        saved = ec.ollama
        ec.ollama = fake
        return saved

    def test_explicit_ollama_prefixed_model_stripped(self):
        import executor_cloud as ec

        fake = self._FakeOllama()
        saved = self._patch_ollama(ec, fake)
        try:
            req = {"metadata": {"model": "ollama/qwen2.5-coder-ctx32k"}}
            result = ec.run_ollama(req, "sys", "prompt")
            self.assertEqual(result, "verified")
            self.assertEqual(
                fake.calls, ["qwen2.5-coder-ctx32k"],
                "opencode-style ollama/ prefix must be stripped for the local server")
        finally:
            ec.ollama = saved

    def test_explicit_bare_model_passes_through(self):
        import executor_cloud as ec

        fake = self._FakeOllama()
        saved = self._patch_ollama(ec, fake)
        try:
            req = {"metadata": {"model": "qwen2.5-coder:latest"}}
            ec.run_ollama(req, "sys", "prompt")
            self.assertEqual(fake.calls, ["qwen2.5-coder:latest"])
        finally:
            ec.ollama = saved

    def test_no_explicit_model_falls_back_to_role_config(self):
        import executor_cloud as ec

        fake = self._FakeOllama()
        saved_ollama = self._patch_ollama(ec, fake)
        saved_resolve = ec._resolve_model_name
        ec._resolve_model_name = lambda req: "nvidia/z-ai/glm-5.2"
        try:
            req = {"metadata": {"model": ""}}  # no explicit model
            ec.run_ollama(req, "sys", "prompt")
            # Role-config fallback is still used (and still opencode-qualified),
            # preserving pre-fix behavior when no model is specified.
            self.assertEqual(fake.calls, ["nvidia/z-ai/glm-5.2"])
        finally:
            ec.ollama = saved_ollama
            ec._resolve_model_name = saved_resolve

    def test_ollama_module_missing_raises(self):
        import executor_cloud as ec

        saved = ec.ollama
        ec.ollama = None
        try:
            with self.assertRaises(RuntimeError):
                ec.run_ollama({"metadata": {}}, "sys", "prompt")
        finally:
            ec.ollama = saved


if __name__ == "__main__":
    unittest.main()
