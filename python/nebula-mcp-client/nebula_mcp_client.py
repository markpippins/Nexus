#!/usr/bin/env python3
"""Canonical MCP Streamable-HTTP JSON-RPC client for Nexus MCP servers.

Supports both transport behaviors documented in
`docs/mcp-transport-matrix.md`:

- **sessionful** (nebula-mcp :3102) — performs the `initialize` handshake
  automatically and manages the `mcp-session-id` header on every request.
- **stateless** (conduit :3100, tackle :3400, semantics :3161,
  assembly :3113, address-tts :3105, slash-command :3220) — requests work
  immediately; the client simply skips the handshake headers.

This is the canonical replacement for the hand-rolled SSE/handshake
probe scripts that used to live in /home/codex/dev/tmp (to-do 8e09a57f,
Gap 4).

Usage::

    from nebula_mcp_client import McpClient

    c = McpClient("http://localhost:3102")     # sessionful — auto-initializes
    tools = c.list_tools()
    resp = c.call("nebula_get_inbox", {"role": "engineer"})

    c2 = McpClient("http://localhost:3400")    # stateless — no handshake
    resp = c2.call("memory_get_procedures", {"role": "engineer"})

CLI::

    python -m nebula_mcp_client http://localhost:3102 list
    python -m nebula_mcp_client http://localhost:3102 call nebula_get_inbox '{"role":"engineer"}'
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from typing import Any

PROTOCOL_VERSION = "2025-03-26"


class McpError(RuntimeError):
    """Raised on JSON-RPC errors, tool errors, or non-JSON responses."""


class McpClient:
    """Minimal, dependency-free MCP streamable-HTTP client.

    Auto-initializes when constructed with `auto_initialize=True` (the
    default) — safe for both sessionful and stateless servers: stateless
    servers ignore the initialize request or return no session header.
    """

    def __init__(
        self,
        base_url: str,
        timeout: float = 30,
        auto_initialize: bool = True,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._session_id: str | None = None
        self._rpc_id = 0
        if auto_initialize:
            self.initialize()

    # ── low-level ────────────────────────────────────────────────────

    def _post(self, payload: dict[str, Any]) -> tuple[str | None, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self._session_id:
            headers["mcp-session-id"] = self._session_id
            headers["mcp-protocol-version"] = PROTOCOL_VERSION
        req = urllib.request.Request(
            self.base_url,
            data=json.dumps(payload).encode(),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                sid = resp.headers.get("mcp-session-id")
                raw = resp.read().decode()
        except urllib.error.HTTPError as e:
            raise McpError(f"HTTP {e.code}: {e.read().decode(errors='replace')[:300]}")
        except urllib.error.URLError as e:
            raise McpError(f"connection error: {e.reason}")
        return sid, raw

    def _rpc(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self._rpc_id += 1
        sid, raw = self._post(
            {"jsonrpc": "2.0", "id": self._rpc_id, "method": method, "params": params or {}}
        )
        if sid:
            self._session_id = sid
        # Streamable-HTTP responses may be SSE-framed ("event:" / "data:" lines).
        # Parse strictly: skip the spec's terminal "data: [DONE]" and empty data
        # events, and take the first JSON-parsable payload.
        lines = raw.splitlines()
        if raw.lstrip().startswith("event:") or any(
            line.startswith("data:") for line in lines
        ):
            data = None
            for line in lines:
                if not line.startswith("data:"):
                    continue
                chunk = line[5:].strip()
                if not chunk or chunk == "[DONE]":
                    continue
                try:
                    json.loads(chunk)
                    data = chunk
                    break
                except json.JSONDecodeError:
                    continue
            if data is None:
                raise McpError(f"no JSON payload in SSE response: {raw[:200]}")
        else:
            data = raw
        try:
            d = json.loads(data)
        except json.JSONDecodeError:
            raise McpError(f"non-JSON response: {raw[:200]}")
        if isinstance(d, dict) and "error" in d:
            err = d["error"]
            raise McpError(f"MCP error {err.get('code')}: {err.get('message')}")
        return d

    # ── lifecycle ────────────────────────────────────────────────────

    def initialize(self) -> str | None:
        """Perform the MCP initialize handshake and store the session id."""
        self._rpc_id += 1
        sid, _ = self._post(
            {
                "jsonrpc": "2.0",
                "id": self._rpc_id,
                "method": "initialize",
                "params": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "nebula-mcp-client", "version": "1.0"},
                },
            }
        )
        if sid:
            self._session_id = sid
        try:
            self._post({"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}})
        except Exception:
            pass  # notification — no response is returned
        return self._session_id

    # ── tools ────────────────────────────────────────────────────────

    def list_tools(self) -> list[dict[str, Any]]:
        """Return the server's authoritative tool catalog (tools/list)."""
        result = self._rpc("tools/list")
        return (result.get("result") or {}).get("tools", [])

    def call(self, name: str, arguments: dict[str, Any] | None = None) -> Any:
        """Invoke an MCP tool; raises McpError on JSON-RPC or tool errors."""
        result = self._rpc("tools/call", {"name": name, "arguments": arguments or {}})
        result = result.get("result")
        if isinstance(result, dict) and result.get("isError"):
            text = "\n".join(
                c.get("text", "")
                for c in result.get("content", [])
                if isinstance(c, dict) and c.get("type") == "text"
            )
            raise McpError(f"tool error: {text[:300]}")
        return result


# ── CLI ──────────────────────────────────────────────────────────────

def _main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 1
    url = argv[0]
    mode = argv[1]
    client = McpClient(url)
    if mode == "list":
        for t in client.list_tools():
            print(t.get("name"))
        return 0
    if mode == "call":
        if len(argv) < 3:
            print("usage: nebula_mcp_client <url> call <tool> [json-args]")
            return 1
        tool = argv[2]
        args = json.loads(argv[3]) if len(argv) > 3 else {}
        print(json.dumps(client.call(tool, args), indent=2, default=str))
        return 0
    print(f"unknown mode: {mode}")
    return 1


if __name__ == "__main__":
    sys.exit(_main(sys.argv[1:]))
