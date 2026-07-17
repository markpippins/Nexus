"""
Tests for streaming-endpoint detection in mesh-register.py::probe_one().

These tests pin behavior at the probe layer rather than hitting live
services. They use the stdlib http.server + socketserver to spin up
short-lived HTTP servers on a random local port, then point Candidate
instances at those servers and assert on ProbeResult.

Import strategy mirrors bin/mesh-status.sh: importlib.util because the
target file has a hyphen in its filename. The Candidate dataclass is
frozen=True so we construct instances directly.
"""
from __future__ import annotations

import contextlib
import http.server
import importlib.util
import socketserver
import sys
import threading
from pathlib import Path

import pytest


MESH_REGISTER_PATH = Path(__file__).resolve().parent.parent / "mesh-register.py"


# ── Module loader ─────────────────────────────────────────────────────

def _load_mesh_register():
    """Import the script as a module so we can call its public functions."""
    spec = importlib.util.spec_from_file_location("mr", MESH_REGISTER_PATH)
    module = importlib.util.module_from_spec(spec)
    sys.modules["mr"] = module
    spec.loader.exec_module(module)  # type: ignore[union-attr]
    return module


@pytest.fixture(scope="module")
def mr():
    return _load_mesh_register()


# ── Test HTTP server helper ───────────────────────────────────────────

class _StreamingHandler(http.server.BaseHTTPRequestHandler):
    """Base handler that lets tests fix Content-Type / body via class attrs."""

    content_type: str = "application/json"
    body: bytes = b'{"ok":true}'
    stream: bool = False  # if True, never call self.wfile.close-equivalent

    def do_GET(self):  # noqa: N802 — http.server contract
        self.send_response(200)
        self.send_header("Content-Type", self.content_type)
        if self.stream:
            # Hold the connection open. The probe should reject before
            # consuming the body via the Content-Type guard.
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            try:
                self.wfile.write(self.body)
                self.wfile.flush()
                # Block so urlopen times out unless upstream guard catches
                # us first.
                threading.Event().wait(30)
            except (BrokenPipeError, ConnectionResetError):
                pass
            return
        self.send_header("Content-Length", str(len(self.body)))
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *_args, **_kwargs):  # silence stderr noise
        return


@contextlib.contextmanager
def _server(handler_cls):
    """Yield (host, port). Caller subclasses _StreamingHandler per case."""
    handler_cls.allow_reuse_address = True
    srv = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler_cls)
    port = srv.server_address[1]
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()
    try:
        yield "127.0.0.1", port
    finally:
        srv.shutdown()
        srv.server_close()


def _candidate(mr, name, url, **extra) -> object:
    """Helper: build a Candidate with the standard test envelope."""
    return mr.Candidate(
        name=name,
        port=None,  # unused for HTTP tests
        kind="mcp_server",
        transport_type="streamable-http",
        health_url=url,
        workspace_path="nexus/test/probe",
        description=f"test candidate {name}",
        startup="",
        **extra,
    )


# ── Streaming Content-Type detection ──────────────────────────────────

def test_text_event_stream_is_rejected(mr):
    class H(_StreamingHandler):
        content_type = "text/event-stream"
        body = b"data: hello\n\n"

    with _server(H) as (host, port):
        c = _candidate(mr, "sse", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is False
    assert "streaming endpoint detected via Content-Type" in r.error
    assert r.http_status is None  # rejected before body read


def test_multipart_x_mixed_replace_is_rejected(mr):
    class H(_StreamingHandler):
        content_type = "multipart/x-mixed-replace; boundary=foo"
        body = b"--foo\r\nContent-Type: text/plain\r\n\r\nhi\r\n--foo--\r\n"

    with _server(H) as (host, port):
        c = _candidate(mr, "multipart-stream", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is False
    assert "streaming endpoint detected via Content-Type" in r.error


def test_application_grpc_web_is_rejected(mr):
    class H(_StreamingHandler):
        content_type = "application/grpc-web"
        body = b"\x00\x00"

    with _server(H) as (host, port):
        c = _candidate(mr, "grpc-web", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is False
    assert "streaming endpoint detected via Content-Type" in r.error


def test_application_json_is_accepted(mr):
    class H(_StreamingHandler):
        content_type = "application/json"
        body = b'{"status":"ok"}'

    with _server(H) as (host, port):
        c = _candidate(mr, "json", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is True
    assert r.http_status == 200
    assert "ok" in r.body_excerpt


def test_application_json_with_charset_params_is_accepted(mr):
    """Parameters after the media type must not flip the verdict."""
    class H(_StreamingHandler):
        content_type = "application/json; charset=utf-8"
        body = b'{"ok":1}'

    with _server(H) as (host, port):
        c = _candidate(mr, "json-charset", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is True


def test_text_event_stream_with_charset_is_rejected(mr):
    """Canonical split strips ';charset=...' so SSE is still detected."""
    class H(_StreamingHandler):
        content_type = "text/event-stream; charset=utf-8"
        body = b"data: x\n\n"

    with _server(H) as (host, port):
        c = _candidate(mr, "sse-charset", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is False
    assert "streaming endpoint detected via Content-Type" in r.error


def test_vendor_extension_with_event_stream_is_NOT_rejected(mr):
    """Canonical exact-match must NOT match application/vnd....text/event-stream+json.

    This is the regression the substring scan had: it would falsely reject
    vendor media types whose name contains 'text/event-stream' as a
    substring. With canonical-media-type parse + exact membership, only
    the three canonical streaming media types are caught.
    """
    class H(_StreamingHandler):
        content_type = "application/vnd.custom.text/event-stream+json"
        body = b'{"ok":1}'

    with _server(H) as (host, port):
        c = _candidate(mr, "vendor-ext", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is True, (
        f"vendor extension falsely rejected: error={r.error!r}"
    )
    assert r.http_status == 200


def test_uppercase_event_stream_is_rejected(mr):
    """RFC 9110 lets servers vary case; the guard lower-cases before compare."""
    class H(_StreamingHandler):
        content_type = "Text/Event-Stream"
        body = b"data: x\n\n"

    with _server(H) as (host, port):
        c = _candidate(mr, "sse-upper", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is False
    assert "streaming endpoint detected via Content-Type" in r.error


def test_no_content_type_header_falls_through(mr):
    """Empty Content-Type should fall through to body-read path."""
    class H(_StreamingHandler):
        # Override to omit Content-Type entirely.
        def do_GET(self):
            self.send_response(200)
            self.send_header("X-No-Content-Type", "1")
            self.end_headers()
            self.wfile.write(b'{"ok":true}')

    with _server(H) as (host, port):
        c = _candidate(mr, "no-ct", f"http://{host}:{port}/health")
        r = mr.probe_one(c)
    assert r.reachable is True


# ── URL-suffix streaming guard ────────────────────────────────────────

@pytest.mark.parametrize("suffix", ["/sse", "/events", "/ws", "/stream"])
def test_url_suffix_streaming_guarded(mr, suffix):
    path = f"/health{suffix}"
    c = mr.Candidate(
        name=f"suffix-{suffix.strip('/')}",
        port=None,
        kind="mcp_server",
        transport_type="streamable-http",
        health_url=f"http://127.0.0.1:1{path}",  # port 1 will refuse connection
        workspace_path="nexus/test/probe",
    )
    r = mr.probe_one(c)
    assert r.reachable is False
    assert "streaming endpoint" in r.error
    assert "configure /health" in r.error
    assert "instead of" in r.error


# ── stdio / empty health_url path ─────────────────────────────────────

def test_empty_health_url_is_rejected(mr):
    c = mr.Candidate(
        name="stdio",
        port=None,
        kind="mcp_server",
        transport_type="stdio",
        health_url="",
        workspace_path="nexus/test/stdio",
    )
    r = mr.probe_one(c)
    assert r.reachable is False
    assert "no health URL" in r.error


# ── health_cmd branch ─────────────────────────────────────────────────

def test_health_cmd_success_is_reachable(mr):
    c = mr.Candidate(
        name="health-cmd-ok",
        port=None,
        kind="runnable_service",
        service_type="Python Service",
        health_url="",
        health_cmd='bash -c "echo pong"',
        workspace_path="nexus/test/cmd",
    )
    r = mr.probe_one(c)
    assert r.reachable is True
    assert "pong" in r.body_excerpt


def test_health_cmd_nonzero_exit_is_offline(mr):
    c = mr.Candidate(
        name="health-cmd-fail",
        port=None,
        kind="runnable_service",
        service_type="Python Service",
        health_url="",
        health_cmd='bash -c "echo bad >&2; exit 1"',
        workspace_path="nexus/test/cmd",
    )
    r = mr.probe_one(c)
    assert r.reachable is False
    assert "health_cmd exited 1" in r.error
    assert "bad" in r.error
