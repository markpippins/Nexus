from __future__ import annotations

import json
from io import BytesIO

import pytest

import peb_kernel.adapters as adapters
from peb_kernel.adapters import AdapterError, ConduitMcpAdapter, LosmIrTransitionAdapter


class Response:
    def __init__(self, payload):
        self.payload = json.dumps(payload).encode()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return self.payload


def test_conduit_adapter_uses_java_compatible_paths(monkeypatch):
    calls = []

    def fake_urlopen(request, timeout):
        calls.append((request.method, request.full_url, request.data, timeout))
        return Response({"ok": True})

    monkeypatch.setattr(adapters, "urlopen", fake_urlopen)
    client = ConduitMcpAdapter("http://conduit")
    assert client.submit_work_request({"title": "x"}) == {"ok": True}
    assert client.get_work_request("wr/1") == {"ok": True}
    assert calls[0][0:2] == ("POST", "http://conduit/wr/submit")
    assert calls[1][1] == "http://conduit/wr/wr%2F1"


def test_losm_adapter_sends_transition_shape(monkeypatch):
    captured = {}

    def fake_urlopen(request, timeout):
        captured["body"] = json.loads(request.data)
        captured["url"] = request.full_url
        return Response({"state": "PEB_COMMITTED"})

    monkeypatch.setattr(adapters, "urlopen", fake_urlopen)
    result = LosmIrTransitionAdapter("http://losm").transition("wr-1", "DONE", "engineer", "finished")
    assert result["state"] == "PEB_COMMITTED"
    assert captured["url"] == "http://losm/work-requests/wr-1/transition"
    assert captured["body"] == {"to_state": "DONE", "actor": "engineer", "reason": "finished"}


def test_adapter_translates_network_errors(monkeypatch):
    def fake_urlopen(request, timeout):
        raise TimeoutError("timed out")

    monkeypatch.setattr(adapters, "urlopen", fake_urlopen)
    with pytest.raises(AdapterError, match="timed out"):
        ConduitMcpAdapter().query_state()
