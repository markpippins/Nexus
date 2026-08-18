"""
wr-conf-017: role-memory readiness contract (P1 item 8).

Guards the explicit role-memory readiness surface that makes an empty/stale
Redis cache visible instead of silently resolving to zero procedure cards:

    GET  /health          — Redis connectivity, last sync timestamp,
                            procedure count, role-index count, stale flag
    POST /refresh         — repair action (repopulate Redis from PG)

Tested invariants:
  AC1 — /health reports the full readiness signal (redis, lastUpdated,
        procedureCount, roleIndexCount, stale, status ∈ ok|degraded).
  AC2 — POST /refresh repopulates and returns {procedures, roleIndices,
        timestamp} with positive counts.
  AC3 — GET /procedures/:role returns a non-empty index for a real role.

Local-only (requires role-memory-srv on :3500); CI skips.

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_role_memory_readiness.py -v
"""

from __future__ import annotations

import json
import os
import urllib.request

import pytest

_skip_if_ci = pytest.mark.skipif(
    os.environ.get("CI") == "true",
    reason="wr-conf-017 requires live role-memory-srv on :3500 (local only)",
)

ROLE_MEMORY_URL = os.environ.get("ROLE_MEMORY_URL", "http://localhost:3500")


def _get(path: str):
    with urllib.request.urlopen(f"{ROLE_MEMORY_URL}{path}", timeout=15) as resp:
        return resp.status, json.loads(resp.read())


@_skip_if_ci
def test_01_health_readiness_signal():
    status, data = _get("/health")
    assert status == 200
    assert data.get("redis") == "connected", f"health={data}"
    assert data.get("status") in ("ok", "degraded"), f"health={data}"
    assert "lastUpdated" in data, f"health={data}"
    assert isinstance(data.get("procedureCount"), int), f"health={data}"
    assert isinstance(data.get("roleIndexCount"), int), f"health={data}"
    assert isinstance(data.get("stale"), bool), f"health={data}"
    # A healthy registry has a positive procedure + role-index count.
    assert data.get("procedureCount", 0) > 0, f"procedureCount=0: {data}"
    assert data.get("roleIndexCount", 0) > 0, f"roleIndexCount=0: {data}"
    assert data.get("stale") is False, f"stale should be False when populated: {data}"


@_skip_if_ci
def test_02_refresh_repair_action():
    req = urllib.request.Request(
        f"{ROLE_MEMORY_URL}/refresh", method="POST", data=b"{}",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read())
    assert resp.status == 200
    assert data.get("procedures", 0) > 0, f"refresh={data}"
    assert data.get("roleIndices", 0) > 0, f"refresh={data}"
    assert data.get("timestamp"), f"refresh missing timestamp: {data}"


@_skip_if_ci
def test_03_real_role_has_index():
    # A canonical role (engineer) must have a non-empty procedure index —
    # this is what harness admission probes for role_index_present.
    status, data = _get("/procedures/engineer")
    assert status == 200
    assert isinstance(data, list) and len(data) > 0, \
        f"engineer index empty/missing: {data}"
