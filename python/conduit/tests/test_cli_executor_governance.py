"""
Guard for the cli_executor governance-receipt wiring (2026-08-10).

The CLI executor now emits a LOSM ExecutionReceipt into vision.receipts on
completion (success AND failure), which triggers trg_receipt_governance →
peb.governance_events — so every execution channel leaves a governance
event, not just the interactive one.

This test mocks the guarded imports (tackle.vision_bridge /
losm_ir.execution_receipt) so the helper's contract is locked without a
live DB or server: SUCCESS/FAILED results, correct work_request_id /
executor_id, and non-propagation on failure (best-effort).

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/conduit/tests/test_cli_executor_governance.py -v
"""
import sys
import types
import unittest
from unittest import mock

# Module-level fakes — injected into sys.modules for the whole test class so
# the helper's *guarded runtime import* (inside _emit_vision_receipt, at call
# time, not at module import time) resolves to them.
captured = {}


class _FakeExecutionReceipt:
    def __init__(self, **kwargs):
        captured["kwargs"] = kwargs
        for k, v in kwargs.items():
            setattr(self, k, v)


_fake_losm = types.ModuleType("losm_ir.execution_receipt")
_fake_losm.ExecutionReceipt = _FakeExecutionReceipt
_fake_tackle = types.ModuleType("tackle.vision_bridge")
_fake_tackle.issue_receipt = mock.Mock(return_value={"ok": True})

_MODULE_PATCHES = {
    "losm_ir.execution_receipt": _fake_losm,
    "tackle.vision_bridge": _fake_tackle,
}


def _import_cli_executor():
    """Import conduit.cli_executor with vision/losm deps stubbed out."""
    with mock.patch.dict(sys.modules, _MODULE_PATCHES):
        import conduit.cli_executor as ce
    return ce


class TestEmitVisionReceipt(unittest.TestCase):
    """Lock the cli_executor → vision_bridge.issue_receipt contract."""

    def setUp(self):
        self._patcher = mock.patch.dict(sys.modules, _MODULE_PATCHES)
        self._patcher.start()
        self.addCleanup(self._patcher.stop)
        self.addCleanup(_fake_tackle.issue_receipt.reset_mock)
        captured.clear()
        self.ce = _import_cli_executor()

    def test_success_receipt_constructed(self):
        self.ce._emit_vision_receipt("req-abc", "SUCCESS", "done", "cli-executor")
        kw = captured["kwargs"]
        self.assertEqual(kw["work_request_id"], "req-abc")
        self.assertEqual(kw["result"], "SUCCESS")
        self.assertEqual(kw["executor_id"], "cli-executor")
        self.assertEqual(kw["lineage_parent"], "done")
        self.assertTrue(kw["timestamp"].endswith("Z"))
        _fake_tackle.issue_receipt.assert_called_once()

    def test_failed_receipt_constructed(self):
        self.ce._emit_vision_receipt("req-abc", "FAILED", "boom", "cli-executor")
        self.assertEqual(captured["kwargs"]["result"], "FAILED")
        _fake_tackle.issue_receipt.assert_called_once()

    def test_issue_receipt_called_with_plan_id(self):
        self.ce._emit_vision_receipt("req-abc", "SUCCESS", "done", "cli-executor")
        _fake_tackle.issue_receipt.assert_called_once()
        call = _fake_tackle.issue_receipt.call_args
        self.assertEqual(call.args[0].work_request_id, "req-abc")  # the ExecutionReceipt
        self.assertEqual(call.kwargs["plan_id"], "req-abc")

    def test_import_failure_does_not_raise(self):
        # If tackle/losm are unavailable the helper must degrade silently.
        with mock.patch.dict(sys.modules, {
            "tackle.vision_bridge": None,
            "losm_ir.execution_receipt": None,
        }):
            # ImportError raised by `from X import Y` when sys.modules[X] is
            # None; the helper catches ImportError — nothing should propagate.
            self.ce._emit_vision_receipt("req-abc", "SUCCESS", "done", "cli-executor")

    def test_issue_receipt_failure_does_not_raise(self):
        # Even an unexpected exception from issue_receipt must not propagate
        # (best-effort) — the lease release and request COMPLETED tail follow.
        _fake_tackle.issue_receipt.side_effect = RuntimeError("server down")
        self.ce._emit_vision_receipt("req-abc", "SUCCESS", "done", "cli-executor")


if __name__ == "__main__":
    unittest.main()
