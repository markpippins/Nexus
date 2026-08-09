#!/usr/bin/env python3
"""Unit tests for bin/check-inbox.sh pointer semantics.

Hermetic: spins up a mock Streamable-HTTP JSON-RPC MCP server and points
check-inbox.sh at it via the NEBULA_MCP_BASE env override, so no real
nebula-mcp / database is touched. Pins the behaviors documented in
AGENTS.md R17 and the inbox-query-procedure memory card:

- `--pointer` / `--since` are **non-destructive**: they override
  createdAfter for that call only; the stored pointer is never written.
- `--update-pointer` advances the stored pointer to the newest record's
  createdAt (converted to ISO), including when combined with --pointer
  (catch-up through the reviewed window, not a rewind to the override).
- The default path uses the single-call `nebula_get_inbox` tool; the
  explicit paths use `nebula_list_agent_records` with createdAfter.

Usage:
    python3 tests/bin/checks.py          # run this suite
    python3 tests/run_all.py bin         # via the repo runner

Exit code: 0 if all pass, 1 otherwise.
"""

import json
import os
import subprocess
import sys
import threading
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

NEXUS_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCRIPT = os.path.join(NEXUS_ROOT, "bin", "check-inbox.sh")

# ── fixtures ──────────────────────────────────────────────────────────────
# Records carry createdAt as epoch ms (like nebula agent records).
T1 = 1_752_000_000_000  # older
T2 = 1_752_000_360_000  # newer (+6 min)
STORE_POINTER = "2026-08-01T00:00:00Z"

REC_OLDER = {"createdAt": T1, "recordType": "engineering_log", "title": "older record"}
REC_NEWER = {"createdAt": T2, "recordType": "report", "title": "newer record"}


def iso_of(epoch_ms: int) -> str:
    return datetime.fromtimestamp(epoch_ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ── mock MCP server (Streamable-HTTP, stateless) ─────────────────────────
class MockMcp(BaseHTTPRequestHandler):
    """Minimal JSON-RPC server. config/calls are class-level so each test
    seeds fixtures via start_server() and inspects recorded calls."""

    config = {"stored_pointer": STORE_POINTER, "records": []}
    calls: list[tuple] = []  # (method, params) in request order

    def log_message(self, *a):  # silence request logging
        pass

    def _send_json(self, obj: dict, code: int = 200) -> None:
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):  # noqa: N802 (http.server API)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length).decode()
        try:
            req = json.loads(raw)
        except Exception:
            self._send_json({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}})
            return
        method = req.get("method", "")
        params = req.get("params") or {}
        self.__class__.calls.append((method, params))

        if method == "initialize":
            self._send_json({"jsonrpc": "2.0", "id": req.get("id"), "result": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "serverInfo": {"name": "mock-mcp", "version": "1.0"},
            }})
        elif method == "notifications/initialized":
            self._send_json({"jsonrpc": "2.0", "id": None, "result": {}})
        elif method == "tools/list":
            self._send_json({"jsonrpc": "2.0", "id": req.get("id"), "result": {"tools": []}})
        elif method == "tools/call":
            name = params.get("name", "")
            args = params.get("arguments") or {}
            result = self._handle_tool(name, args)
            self._send_json({"jsonrpc": "2.0", "id": req.get("id"), "result": {
                "content": [{"type": "text", "text": json.dumps(result)}],
            }})
        else:
            self._send_json({"jsonrpc": "2.0", "id": req.get("id"),
                             "error": {"code": -32601, "message": "method not found"}})

    @classmethod
    def _handle_tool(cls, name: str, args: dict) -> dict:
        cfg = cls.config
        if name == "nebula_get_inbox":
            return {"role": args.get("role"), "pointer": cfg["stored_pointer"],
                    "items": cfg["records"], "count": len(cfg["records"])}
        if name == "nebula_list_agent_records":
            return {"items": cfg["records"], "total": len(cfg["records"])}
        if name == "nebula_set_inbox_pointer":
            return {"ok": True}
        return {"items": [], "total": 0}


def start_server(config: dict):
    """Seed fixtures, reset the call log, and start the mock on a free port."""
    MockMcp.config = dict(config)
    MockMcp.calls = []
    srv = HTTPServer(("127.0.0.1", 0), MockMcp)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def run_script(port: int, args: list[str]) -> subprocess.CompletedProcess:
    env = dict(os.environ)
    env["NEBULA_MCP_BASE"] = f"http://127.0.0.1:{port}"
    return subprocess.run(["bash", SCRIPT] + args, capture_output=True, text=True, env=env, timeout=60)


def tool_calls(name: str) -> list[tuple]:
    return [c for c in MockMcp.calls if c[0] == "tools/call" and c[1].get("name") == name]


def list_args() -> dict:
    la = tool_calls("nebula_list_agent_records")
    assert la, "expected nebula_list_agent_records call"
    return la[0][1].get("arguments", {})


def set_pointer_args_list() -> list[dict]:
    return [c[1].get("arguments", {}) for c in tool_calls("nebula_set_inbox_pointer")]


# ── tests ────────────────────────────────────────────────────────────────
def test_default_uses_get_inbox_single_call():
    srv = start_server({"stored_pointer": STORE_POINTER, "records": [REC_NEWER, REC_OLDER]})
    try:
        r = run_script(srv.server_port, ["--role", "engineer"])
        assert r.returncode == 0, r.stderr
        assert tool_calls("nebula_get_inbox"), "default path must use nebula_get_inbox"
        assert tool_calls("nebula_list_agent_records") == [], "default path must NOT use list path"
        assert set_pointer_args_list() == [], "default path must not write the pointer"
        assert f"since {STORE_POINTER}" in r.stdout
        assert "newer record" in r.stdout and "older record" in r.stdout
    finally:
        srv.shutdown()
        srv.server_close()


def test_pointer_is_non_destructive():
    OLDER = "2026-07-01T00:00:00Z"
    srv = start_server({"stored_pointer": STORE_POINTER, "records": [REC_NEWER]})
    try:
        r = run_script(srv.server_port, ["--role", "engineer", "--pointer", OLDER])
        assert r.returncode == 0, r.stderr
        assert list_args().get("createdAfter") == OLDER, "createdAfter must equal the --pointer value"
        assert set_pointer_args_list() == [], "--pointer must not write the stored pointer"
        assert f"since {OLDER}" in r.stdout
        assert "newer record" in r.stdout
    finally:
        srv.shutdown()
        srv.server_close()


def test_update_pointer_advances_to_newest():
    srv = start_server({"stored_pointer": STORE_POINTER, "records": [REC_NEWER, REC_OLDER]})
    try:
        r = run_script(srv.server_port, ["--role", "engineer", "--update-pointer"])
        assert r.returncode == 0, r.stderr
        args = set_pointer_args_list()
        assert len(args) == 1, f"expected exactly one pointer write, got {len(args)}"
        assert args[0]["timestamp"] == iso_of(T2), "pointer must advance to the NEWEST record"
        assert f"# pointer updated to {iso_of(T2)}" in r.stdout
    finally:
        srv.shutdown()
        srv.server_close()


def test_pointer_with_update_catches_up_through_window():
    OLDER = "2026-07-01T00:00:00Z"
    srv = start_server({"stored_pointer": STORE_POINTER, "records": [REC_NEWER, REC_OLDER]})
    try:
        r = run_script(srv.server_port, ["--role", "engineer", "--pointer", OLDER, "--update-pointer"])
        assert r.returncode == 0, r.stderr
        assert list_args().get("createdAfter") == OLDER
        args = set_pointer_args_list()
        assert len(args) == 1
        assert args[0]["timestamp"] == iso_of(T2), "catch-up must go to newest in window, not the override"
    finally:
        srv.shutdown()
        srv.server_close()


def test_since_computes_relative_pointer_non_destructive():
    srv = start_server({"stored_pointer": STORE_POINTER, "records": [REC_NEWER]})
    try:
        before = datetime.now(timezone.utc)
        r = run_script(srv.server_port, ["--role", "engineer", "--since", "7d"])
        after = datetime.now(timezone.utc)
        assert r.returncode == 0, r.stderr
        created_after = list_args().get("createdAfter")
        assert created_after, "--since must produce a createdAfter"
        parsed = datetime.strptime(created_after, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        lo = (before - timedelta(days=7)) - timedelta(seconds=5)
        hi = (after - timedelta(days=7)) + timedelta(seconds=5)
        assert lo <= parsed <= hi, f"createdAfter {created_after} outside 7d window [{lo}, {hi}]"
        assert set_pointer_args_list() == [], "--since must not write the stored pointer"
    finally:
        srv.shutdown()
        srv.server_close()


def test_all_ignores_pointer_no_write():
    srv = start_server({"stored_pointer": STORE_POINTER, "records": [REC_NEWER]})
    try:
        r = run_script(srv.server_port, ["--role", "engineer", "--all"])
        assert r.returncode == 0, r.stderr
        assert "createdAfter" not in list_args(), "--all must not send createdAfter"
        assert set_pointer_args_list() == []
    finally:
        srv.shutdown()
        srv.server_close()


def test_usage_errors_exit_2():
    srv = start_server({"stored_pointer": STORE_POINTER, "records": []})
    try:
        cases = [
            ["--since", "bogus"],
            ["--since", "7d", "--pointer", "2026-01-01T00:00:00Z"],
            ["--since", "7d", "--all"],
            ["--since"],
        ]
        for extra in cases:
            r = run_script(srv.server_port, ["--role", "engineer"] + extra)
            assert r.returncode == 2, (extra, r.returncode, r.stderr)
            assert r.stderr.strip().startswith("ERROR:"), (extra, r.stderr)
    finally:
        srv.shutdown()
        srv.server_close()


# ── suite entrypoint (tests/run_all.py convention) ───────────────────────
def run() -> tuple[int, int, int]:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = failed = 0
    for t in tests:
        try:
            t()
            print(f"  PASS  {t.__name__}")
            passed += 1
        except Exception as e:  # noqa: BLE001 — suite reports any failure
            print(f"  FAIL  {t.__name__}: {e}")
            failed += 1
    return passed, failed, 0


if __name__ == "__main__":
    passed, failed, skipped = run()
    print(f"\n  bin suite: {passed} passed, {failed} failed, {skipped} skipped")
    sys.exit(1 if failed else 0)
