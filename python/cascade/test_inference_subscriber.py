#!/usr/bin/env python3
"""Tests for inference_subscriber.py — Cascade NATS subscriber POC.

Covers: build_prompt, _is_canonical_envelope, publish_result,
event-type→role mapping, handle_event flow, invoke_inference,
_invoke_ollama_direct, and resolve_inference_config.

Run:  python -m pytest nexus/python/cascade/test_inference_subscriber.py -v
  or: python3 nexus/python/cascade/test_inference_subscriber.py
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from unittest import mock

# ── Path setup (same pattern as inference_subscriber.py) ─────────────
_PARENT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

from inference_subscriber import (
    build_prompt,
    _is_canonical_envelope,
    publish_result,
    EVENT_TYPE_TO_ROLE,
    _PROVIDER_ENV_MAP,
    resolve_inference_config,
    invoke_inference,
    _invoke_ollama_direct,
    handle_event,
)


# ═══════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════

def _make_event(event_type: str = "IdeaCaptured",
                idea: str = "Build a message bus",
                event_id: str = "evt-001") -> dict:
    """Factory for a minimal well-formed cascade event."""
    return {
        "id": event_id,
        "type": event_type,
        "timestamp": "2026-06-27T12:00:00Z",
        "source": "test",
        "payload": {"idea": idea},
    }


def _make_envelope(inner_event: dict) -> dict:
    """Wrap a flat event in a CanonicalEnvelope-shaped dict."""
    return {
        "event_id": "env-001",
        "event_type": inner_event["type"],
        "event_version": 1,
        "occurred_at": inner_event["timestamp"],
        "origin_system": "nexus",
        "origin_component": "cascade",
        "correlation_id": inner_event["id"],
        "causation_id": None,
        "source_event_ids": [inner_event["id"]],
        "execution_id": None,
        "classification": "internal",
        "policy_version": None,
        "subject": "nexus.cascade.v1.workflow.idea_captured",
        "payload": inner_event,
    }


# ═══════════════════════════════════════════════════════════════════════
#  build_prompt
# ═══════════════════════════════════════════════════════════════════════

class TestBuildPrompt(unittest.TestCase):
    """Verify prompt construction from event payloads."""

    def test_extracts_idea_from_payload(self):
        event = _make_event(idea="Add dark mode to the dashboard")
        prompt = build_prompt(event)
        self.assertIn("Add dark mode to the dashboard", prompt)
        self.assertIn("entities", prompt)
        self.assertIn("actions", prompt)

    def test_falls_back_to_title_when_no_idea(self):
        event = {
            "id": "evt-002",
            "type": "IdeaCaptured",
            "timestamp": "2026-06-27T12:00:00Z",
            "source": "test",
            "payload": {"title": "Refactor auth module"},
        }
        prompt = build_prompt(event)
        self.assertIn("Refactor auth module", prompt)

    def test_falls_back_to_json_dumps_when_empty_payload(self):
        event = _make_event()
        event["payload"] = {}
        prompt = build_prompt(event)
        self.assertIn("{}", prompt)

    def test_includes_structured_output_instructions(self):
        prompt = build_prompt(_make_event())
        self.assertIn("entities, actions, states, constraints", prompt.lower())


# ═══════════════════════════════════════════════════════════════════════
#  _is_canonical_envelope
# ═══════════════════════════════════════════════════════════════════════

class TestIsCanonicalEnvelope(unittest.TestCase):
    """Verify envelope vs flat event detection."""

    def test_detects_envelope_shape(self):
        inner = _make_event()
        envelope = _make_envelope(inner)
        self.assertTrue(_is_canonical_envelope(envelope))

    def test_rejects_flat_event(self):
        event = _make_event()
        self.assertFalse(_is_canonical_envelope(event))

    def test_rejects_empty_dict(self):
        self.assertFalse(_is_canonical_envelope({}))

    def test_rejects_dict_with_only_payload(self):
        self.assertFalse(_is_canonical_envelope({"payload": {"type": "x"}}))

    def test_requires_correlation_id(self):
        almost_envelope = _make_envelope(_make_event())
        del almost_envelope["correlation_id"]
        # key-based fallback should reject
        self.assertFalse(_is_canonical_envelope(almost_envelope))


# ═══════════════════════════════════════════════════════════════════════
#  publish_result
# ═══════════════════════════════════════════════════════════════════════

class TestPublishResult(unittest.TestCase):
    """Verify InferenceCompleted events are written to disk."""

    def setUp(self):
        self.tmpdir = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmpdir.cleanup)
        # Override EVENTS_DIR for these tests
        patcher = mock.patch(
            "inference_subscriber.EVENTS_DIR",
            self.tmpdir.name,
        )
        patcher.start()
        self.addCleanup(patcher.stop)

        # Also suppress the NATS enqueue attempt (try_enqueue_event is
        # imported locally inside publish_result from nats_publisher)
        nats_patcher = mock.patch(
            "nats_publisher.try_enqueue_event",
            side_effect=ImportError("nats_publisher not available"),
        )
        nats_patcher.start()
        self.addCleanup(nats_patcher.stop)

    def test_writes_event_file_on_success(self):
        event = _make_event()
        publish_result(event, "analysis output", None, "architect")
        files = os.listdir(self.tmpdir.name)
        self.assertEqual(len(files), 1, "Should write exactly one event file")
        self.assertTrue(files[0].endswith(".json"))

    def test_writes_correct_status_on_success(self):
        event = _make_event()
        publish_result(event, "analysis output", None, "architect")
        path = os.path.join(self.tmpdir.name, os.listdir(self.tmpdir.name)[0])
        with open(path) as f:
            data = json.load(f)
        self.assertEqual(data["type"], "InferenceCompleted")
        self.assertEqual(data["payload"]["status"], "success")
        self.assertEqual(data["payload"]["output"], "analysis output")
        self.assertIsNone(data["payload"]["error"])

    def test_writes_error_status_on_failure(self):
        event = _make_event()
        publish_result(event, None, "Connection refused", "architect")
        path = os.path.join(self.tmpdir.name, os.listdir(self.tmpdir.name)[0])
        with open(path) as f:
            data = json.load(f)
        self.assertEqual(data["payload"]["status"], "error")
        self.assertEqual(data["payload"]["error"], "Connection refused")
        self.assertIsNone(data["payload"]["output"])

    def test_stores_source_event_info(self):
        event = _make_event(event_id="evt-src-99", idea="test")
        publish_result(event, "ok", None, "architect")
        path = os.path.join(self.tmpdir.name, os.listdir(self.tmpdir.name)[0])
        with open(path) as f:
            data = json.load(f)
        self.assertEqual(data["payload"]["source_event_id"], "evt-src-99")
        self.assertEqual(data["payload"]["source_event_type"], "IdeaCaptured")
        self.assertEqual(data["payload"]["role"], "architect")


# ═══════════════════════════════════════════════════════════════════════
#  Event type → role mapping
# ═══════════════════════════════════════════════════════════════════════

class TestEventTypeMapping(unittest.TestCase):
    """Verify the event-type-to-role lookup table."""

    def test_idea_captured_maps_to_architect(self):
        self.assertEqual(EVENT_TYPE_TO_ROLE.get("IdeaCaptured"), "architect")

    def test_unknown_type_returns_none(self):
        self.assertIsNone(EVENT_TYPE_TO_ROLE.get("NonExistentType"))


# ═══════════════════════════════════════════════════════════════════════
#  _invoke_ollama_direct
# ═══════════════════════════════════════════════════════════════════════

class TestInvokeOllamaDirect(unittest.TestCase):
    """Verify direct Ollama HTTP call construction."""

    def test_returns_error_when_ollama_unreachable(self):
        cfg = {
            "model_identifier": "test-model",
            "provider_type": "ollama",
            "endpoint_url": "http://localhost:19999",  # nothing listening here
        }
        output, error = _invoke_ollama_direct(cfg, "Hello")
        self.assertIsNone(output)
        self.assertIn("Ollama connection refused", error)


# ═══════════════════════════════════════════════════════════════════════
#  invoke_inference (with mocked subprocess)
# ═══════════════════════════════════════════════════════════════════════

class TestInvokeInference(unittest.TestCase):
    """Verify inference invocation via HarnessLauncher + subprocess."""

    def setUp(self):
        self.valid_cfg = {
            "harness_name": "opencode",
            "model_identifier": "test-model",
            "provider_type": "opencode",
            "invocation_semantics": {},
            "api_key": "",
            "endpoint_url": "",
        }

    @mock.patch("subprocess.run")
    def test_returns_output_on_success(self, mock_run):
        mock_run.return_value = mock.Mock(
            returncode=0, stdout="analysis result\n", stderr=""
        )
        output, error = invoke_inference(self.valid_cfg, "Analyze this")
        self.assertEqual(output, "analysis result")
        self.assertIsNone(error)

    @mock.patch("subprocess.run")
    def test_returns_error_on_nonzero_exit(self, mock_run):
        mock_run.return_value = mock.Mock(
            returncode=1, stdout="", stderr="command not found"
        )
        output, error = invoke_inference(self.valid_cfg, "Analyze this")
        self.assertIsNone(output)
        self.assertIn("Inference exited 1", error)

    @mock.patch("subprocess.run")
    def test_returns_stdout_even_on_nonzero_exit(self, mock_run):
        """Sometimes models output text but exit non-zero."""
        mock_run.return_value = mock.Mock(
            returncode=1, stdout="partial result", stderr="warning: something"
        )
        output, error = invoke_inference(self.valid_cfg, "Analyze this")
        self.assertEqual(output, "partial result")
        self.assertIsNone(error)

    @mock.patch("subprocess.run", side_effect=FileNotFoundError)
    def test_returns_error_on_missing_binary(self, mock_run):
        output, error = invoke_inference(self.valid_cfg, "Analyze this")
        self.assertIsNone(output)
        self.assertIn("Binary not found", error)

    def test_falls_back_to_ollama_direct_on_harness_build_failure(self):
        """If HarnessLauncher can't import, ollama provider falls back
        to direct HTTP call. But with no ollama running, it returns error."""
        cfg = {
            "harness_name": "opencode",
            "model_identifier": "test-model",
            "provider_type": "ollama",
            "invocation_semantics": {},
            "api_key": "",
            "endpoint_url": "http://localhost:19999",
        }
        # HarnessLauncher.from_harness_row() is called inside invoke_inference().
        # Raise ImportError so the except clause triggers the ollama fallback.
        with mock.patch(
            "tackle.harness_launcher.HarnessLauncher.from_harness_row",
            side_effect=ImportError("no tackle"),
        ):
            output, error = invoke_inference(cfg, "Hello")
            # Falls back to _invoke_ollama_direct which tries localhost:19999
            self.assertIsNone(output)
            self.assertIn("Ollama connection refused", error)


# ═══════════════════════════════════════════════════════════════════════
#  handle_event
# ═══════════════════════════════════════════════════════════════════════

class TestHandleEvent(unittest.TestCase):
    """Verify the async event processing pipeline."""

    def test_skips_unknown_event_type(self):
        """Events not in EVENT_TYPE_TO_ROLE should be skipped
        without calling resolve_inference_config or publish_result."""
        event = _make_event(event_type="UnknownType")

        import asyncio
        result = asyncio.run(handle_event(event))
        self.assertIsNone(result)

    def test_happy_path_idea_captured_resolves_and_invokes(self):
        """A valid IdeaCaptured event should resolve config, invoke
        inference, and publish the result without error."""
        event = _make_event(idea="Add dark mode to the dashboard")

        mock_cfg = {
            "model_identifier": "test-model",
            "harness_name": "opencode",
            "provider_type": "opencode",
            "invocation_semantics": {},
            "api_key": "",
            "endpoint_url": "",
        }

        with mock.patch(
            "inference_subscriber.resolve_inference_config",
            return_value=mock_cfg,
        ) as mock_resolve, mock.patch(
            "inference_subscriber.invoke_inference",
            return_value=("analysis output", None),
        ) as mock_invoke, mock.patch(
            "inference_subscriber.publish_result",
        ) as mock_publish:
            import asyncio
            result = asyncio.run(handle_event(event))
            self.assertIsNone(result)

            # Verify the pipeline was called correctly
            mock_resolve.assert_called_once_with("architect")
            mock_invoke.assert_called_once()
            invoke_args = mock_invoke.call_args[0]
            self.assertEqual(invoke_args[0], mock_cfg)       # config
            self.assertIsInstance(invoke_args[1], str)        # prompt
            self.assertGreater(len(invoke_args[1]), 0)        # prompt non-empty
            mock_publish.assert_called_once()

            # Verify publish_result received success data
            call_args = mock_publish.call_args[0]
            self.assertEqual(call_args[0], event)         # source event
            self.assertEqual(call_args[1], "analysis output")  # output
            self.assertIsNone(call_args[2])               # error
            self.assertEqual(call_args[3], "architect")   # role

    def test_happy_path_publishes_error_when_no_config(self):
        """When Tackle has no config, publish_result should be called
        with an error status (not crash)."""
        event = _make_event(idea="Refactor auth module")

        with mock.patch(
            "inference_subscriber.resolve_inference_config",
            return_value=None,
        ) as mock_resolve, mock.patch(
            "inference_subscriber.publish_result",
        ) as mock_publish:
            import asyncio
            result = asyncio.run(handle_event(event))
            self.assertIsNone(result)

            mock_resolve.assert_called_once_with("architect")
            mock_publish.assert_called_once()

            # Should have error, no output
            call_args = mock_publish.call_args[0]
            self.assertEqual(call_args[0], event)
            self.assertIsNone(call_args[1])  # no output
            self.assertIn("No Tackle config", call_args[2])  # error message
            self.assertEqual(call_args[3], "architect")


# ═══════════════════════════════════════════════════════════════════════
#  resolve_inference_config
# ═══════════════════════════════════════════════════════════════════════

class TestResolveInferenceConfig(unittest.TestCase):
    """Verify Tackle config resolution."""

    @mock.patch("tackle.db.get_role_config")
    def test_returns_config_on_success(self, mock_get):
        mock_get.return_value = {
            "model_identifier": "gpt-4o",
            "harness_name": "opencode",
            "provider_type": "openai",
        }
        cfg = resolve_inference_config("architect")
        self.assertIsNotNone(cfg)
        self.assertEqual(cfg["model_identifier"], "gpt-4o")

    @mock.patch("tackle.db.get_role_config", return_value=None)
    def test_returns_none_when_no_config(self, mock_get):
        cfg = resolve_inference_config("architect")
        self.assertIsNone(cfg)

    @mock.patch("tackle.db.get_role_config", side_effect=ConnectionError("no server"))
    def test_returns_none_on_error(self, mock_get):
        cfg = resolve_inference_config("architect")
        self.assertIsNone(cfg)


# ═══════════════════════════════════════════════════════════════════════
#  Provider env map
# ═══════════════════════════════════════════════════════════════════════

class TestProviderEnvMap(unittest.TestCase):
    """Verify provider type → env var name mapping."""

    def test_opencode_maps_to_key(self):
        self.assertEqual(_PROVIDER_ENV_MAP["opencode"], "OPENCODE_API_KEY")

    def test_ollama_has_empty_key(self):
        self.assertEqual(_PROVIDER_ENV_MAP["ollama"], "")

    def test_unknown_provider_not_in_map(self):
        self.assertNotIn("nonexistent", _PROVIDER_ENV_MAP)


if __name__ == "__main__":
    unittest.main()
