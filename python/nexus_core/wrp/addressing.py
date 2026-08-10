"""
Pure-Python CAL addressing — zero-dep port of the nbk P5 primitive.

Ported from `python/nbk/core.py` (P5 — ADDRESS, the "hash(Node + context)
CAL addressing" primitive). The `NexusBootstrapKernel` reference kernel that
originally owned it is unclaimed (dependency-map thread `1a07a098`, Q2 still
open: archive vs. fold); CAL addressing is the one genuinely novel nbk
primitive with no counterpart elsewhere in nexus_core / python/ir / LOSM, so
it is cherry-picked here as a pure, zero-dependency module — same pattern as
`identity.py` (port a standalone primitive into the canonical zero-dep core).

Format: ``cal://{realm}/{graph}/{trajectory}/{node}/{version}`` where the
default version is a content hash (SHA-256 prefix) of the location path, so
addresses are deterministic and content-addressed without any external state.

Parity with the nbk source is guarded by wr-conf-011
(test_conformance_cal_addressing.py), which derives addresses through this
module and through ``nbk.core`` and asserts both agree — so a future nbk
edit cannot silently diverge this port.

Usage::

    from nexus_core.wrp.addressing import make_address, parse_address

    addr = make_address("dev", "my-pipeline", "t0", "transform")
    # 'cal://dev/my-pipeline/t0/transform/<sha256-prefix>'
    parts = parse_address(addr)
    # {'realm': 'dev', 'graph': 'my-pipeline', 'trajectory': 't0',
    #  'node_id': 'transform', 'version': '<sha256-prefix>'}
"""

from __future__ import annotations

import hashlib
from typing import Any, Dict, Optional

__all__ = [
    "content_hash",
    "make_address",
    "parse_address",
]


def content_hash(*parts: str) -> str:
    """Deterministic content hash (first 12 hex chars of SHA-256).

    Mirrors ``nbk.core._content_hash`` byte-for-byte: the parts are joined
    with ``|`` before hashing.
    """
    raw = "|".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:12]


def make_address(
    realm: str,
    graph: str,
    trajectory: str,
    node_id: str,
    version: Optional[str] = None,
) -> str:
    """Build a CAL address from components.

    Format: ``cal://{realm}/{graph}/{trajectory}/{node}/{version}``.

    When ``version`` is omitted it is derived as a content hash of the
    location path (``realm/graph/trajectory/node_id``), so the same location
    always addresses to the same value and any change to the path changes the
    address. Mirrors ``nbk.core.make_address`` exactly.
    """
    ver = version or content_hash(f"{realm}/{graph}/{trajectory}/{node_id}")
    return f"cal://{realm}/{graph}/{trajectory}/{node_id}/{ver}"


def parse_address(address: str) -> Optional[Dict[str, str]]:
    """Parse a CAL address into its components.

    Returns ``None`` for anything that is not a ``cal://`` address with at
    least realm/graph/trajectory/node (a missing version yields ``""``).
    Mirrors ``nbk.core.parse_address`` exactly.
    """
    if not address.startswith("cal://"):
        return None
    parts = address[6:].split("/")
    if len(parts) < 4:
        return None
    return {
        "realm": parts[0],
        "graph": parts[1],
        "trajectory": parts[2],
        "node_id": parts[3],
        "version": parts[4] if len(parts) > 4 else "",
    }
