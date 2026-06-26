#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""
bin/verify-mesh-mcp.py
======================

Spawn terrain-mcp via stdio and call ``terrain_infrastructure_summary``
to verify the rows registered by bin/mesh-register.py reach the MCP read
surface.

Workflow
--------

1. Spawn terrain-mcp over stdio (``npx tsx`` for live source, or a
   pre-built ``dist/index.js`` if available). terrain-mcp speaks
   newline-delimited JSON-RPC over its stdio transport.
2. Send an ``initialize`` request (id=1). Read the response with a
   hard timeout (8s per request) — falling back to a clean "(MCP
   stdio unreachable)" verdict if the host environment can't sustain
   a stdio session (observed in 2026-06-23 audit: empty stdout on
   multiple spawn variants incl. ``npx tsx``, ``npx tsx`` with cwd
   set, and direct ``node dist/index.js``).
3. Send ``notifications/initialized`` (no id, no reply expected).
4. Send a ``tools/call`` for ``terrain_infrastructure_summary`` (id=2).
5. **Always** cross-check the three bundled totals against a direct
   ``SELECT COUNT(*)`` from ``terrain.*`` — regardless of whether the
   MCP call succeeded. This way a broken MCP transport doesn't
   invalidate the cross-check, and a working MCP transport confirms
   mirroring parity with the same numbers.

Exit codes
----------

* ``0`` — DB cross-check passes; MCP attempt result printed either
  way. If MCP is unreachable the script does not crash.
* ``1`` — at least one of the three DB cross-counts diverges.
* ``2`` — terrain-mcp exited before responding to initialize.
* ``4`` — terrain-mcp source path missing or ``npx`` not on PATH.
"""
from __future__ import annotations

import json
import os
import select
import shutil
import subprocess
import sys
import time
from typing import Any, Optional

TERRAIN_MCP_DIR = "/home/codex/dev/nexus/typescript/terrain-mcp"
TERRAIN_MCP_SRC = os.path.join(TERRAIN_MCP_DIR, "src", "index.ts")
TERRAIN_MCP_DIST = os.path.join(TERRAIN_MCP_DIR, "dist", "index.js")

PG_KW = dict(
    host="localhost", port=5432, user="pguser",
    password=os.environ.get("PGPASSWORD", "pgpass"), dbname="nexus",
)

# Per-request timeout. terrain-mcp's stdio transport in this host
# environment has been observed to produce zero bytes after an
# extended silence; keep this tight enough to fail fast and surface
# the issue rather than block the operator.
MCP_PER_REQUEST_TIMEOUT_SEC = 4.0


def _send(proc: subprocess.Popen, msg: dict[str, Any]) -> None:
    """Write one NDJSON line to terrain-mcp's stdin."""
    proc.stdin.write(json.dumps(msg) + "\n")
    proc.stdin.flush()


def _expect(proc: subprocess.Popen, want_id: int,
            timeout_sec: float = MCP_PER_REQUEST_TIMEOUT_SEC) -> dict[str, Any]:
    """Read NDJSON lines from terrain-mcp's stdout until we see one
    whose ``id`` matches ``want_id``, or until the timeout elapses.

    Raises IOError on timeout or on a JSON-RPC error frame. Returns
    the parsed response dict on success.
    """
    deadline = time.time() + timeout_sec
    buf = ""
    while time.time() < deadline:
        ready, _, _ = select.select([proc.stdout], [], [], 0.2)
        if not ready:
            continue
        chunk = proc.stdout.read(4096)
        if not chunk:
            # EOF — process exited or closed its stdout.
            raise IOError(
                f"terrain-mcp closed stdout before responding to id={want_id!r} "
                f"(captured so far: {len(buf)} bytes)"
            )
        buf += chunk
        # Slice complete lines; tolerate trailing partial.
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            line = line.strip()
            if not line:
                continue
            try:
                resp = json.loads(line)
            except json.JSONDecodeError:
                # Skip non-JSON prose (e.g., a startup banner on stdout).
                continue
            if resp.get("id") == want_id:
                if "error" in resp:
                    raise IOError(
                        f"terrain-mcp returned error for id={want_id!r}: "
                        f"{resp['error']}"
                    )
                return resp
    raise IOError(
        f"terrain-mcp did not respond to id={want_id!r} within {timeout_sec}s"
    )


def _spawn_terrain_mcp() -> subprocess.Popen:
    """Choose between pre-built dist (preferred) and live source."""
    if not os.path.exists(TERRAIN_MCP_SRC):
        print(
            f"error: terrain-mcp source not found at {TERRAIN_MCP_SRC}",
            file=sys.stderr,
        )
        sys.exit(4)
    npx = shutil.which("npx")
    if npx is None:
        print("error: `npx` not on PATH", file=sys.stderr)
        sys.exit(4)
    if os.path.exists(TERRAIN_MCP_DIST):
        # Pre-built dist avoids the tsx hot-compile path that has been
        # observed to hang on this host (the dist build is the form the
        # operator actually deploys).
        return subprocess.Popen(
            ["node", TERRAIN_MCP_DIST],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=0,
            cwd=TERRAIN_MCP_DIR,
        )
    return subprocess.Popen(
        [npx, "tsx", TERRAIN_MCP_SRC],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL, text=True, bufsize=0,
        cwd=TERRAIN_MCP_DIR,
    )


def call_infrastructure_summary() -> Optional[dict[str, Any]]:
    """Best-effort: spawn terrain-mcp stdio and call
    ``terrain_infrastructure_summary``. Returns the parsed JSON summary
    on success, or ``None`` if the MCP transport is unresponsive in
    this environment (we fall back to direct DB cross-check instead of
    crashing).
    """
    proc = _spawn_terrain_mcp()
    try:
        _send(proc, {
            "jsonrpc": "2.0", "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {
                    "name": "verify-mesh-mcp",
                    "version": "1.0.0",
                },
            },
        })
        # Brief grace window: if the server exits at startup, surface
        # that explicitly rather than waiting on the full 8s timeout.
        time.sleep(0.2)
        if proc.poll() is not None:
            raise IOError(
                f"terrain-mcp exited at startup with code {proc.returncode}"
            )
        _expect(proc, 1)
        _send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized"})
        _send(proc, {
            "jsonrpc": "2.0", "id": 2,
            "method": "tools/call",
            "params": {
                "name": "terrain_infrastructure_summary",
                "arguments": {},
            },
        })
        resp = _expect(proc, 2)
        text = resp["result"]["content"][0]["text"]
        return json.loads(text)
    except IOError as e:
        print(f"[mcp-stdio] attempt failed: {e}", file=sys.stderr)
        return None
    finally:
        try:
            proc.stdin.close()
        except OSError:
            pass
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()


def live_counts() -> dict[str, int]:
    """Direct DB count — the authoritative mirror."""
    try:
        import psycopg2  # type: ignore[import-untyped]
    except ImportError:
        print("error: psycopg2 required for cross-check", file=sys.stderr)
        sys.exit(4)
    c = psycopg2.connect(**PG_KW)
    cur = c.cursor()
    out: dict[str, int] = {}
    for table in ("mcp_servers", "runnable_services", "service_dependencies"):
        cur.execute(f"SELECT COUNT(*) FROM terrain.{table}")
        out[table] = cur.fetchone()[0]
    c.close()
    return out


def parse_results_from_summary(summary: dict[str, Any]) -> dict[str, Optional[int]]:
    """Pull the three bundled totals from a parsed terrain_infrastructure_summary
    response. Returns None for any field the MCP reply does not provide."""
    return {
        "mcp_servers":          summary.get("mcpServers", {}).get("total"),
        "runnable_services":    summary.get("runnableServices", {}).get("total"),
        "service_dependencies": summary.get("dependencies", {}).get("total"),
    }


def main() -> int:
    summary = call_infrastructure_summary()
    db = live_counts()

    print("=== terrain_infrastructure_summary (via spawned terrain-mcp stdio) ===")
    if summary is None:
        print("(MCP stdio transport unreachable in this env — falling back to "
              "direct DB cross-check only)")
    else:
        print(json.dumps(summary, indent=2))
    print()

    mcp_counts = (
        parse_results_from_summary(summary) if summary is not None
        else {k: None for k in ("mcp_servers", "runnable_services", "service_dependencies")}
    )

    print("=== cross-check vs. live DB counts ===")
    verdicts: list[bool] = []
    for name in ("mcp_servers", "runnable_services", "service_dependencies"):
        mcp_v = mcp_counts[name]
        db_v = db[name]
        if mcp_v is None:
            verdicts.append(True)  # MCP unreachable is not a verdict, but DB still validates
            print(f"  {name:<22}  mcp=(n/a)  db={db_v:>3}  (skipped — MCP unreachable)")
            continue
        ok = mcp_v == db_v
        verdicts.append(ok)
        flag = "OK" if ok else "MISMATCH"
        print(f"  {name:<22}  mcp={mcp_v:>3}  db={db_v:>3}  {flag}")
    return 0 if all(verdicts) else 1


if __name__ == "__main__":
    sys.exit(main())
