"""
NBK Core Primitives.

The five irreducible primitives from which all other layers derive:

    P1 — NODE      function(State) -> State     pure transformation
    P2 — EDGE      Node_A -> Node_B              causal constraint
    P3 — TRACE     record(Node, in, out)         replay substrate
    P4 — LEASE     permission(Node, executor)    distributed execution
    P5 — ADDRESS   hash(Node + context)          CAL addressing
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any


# ── Type aliases ──────────────────────────────────────────────────────
State = Any  # The opaque unit flowing between nodes


# ── P1: Node ──────────────────────────────────────────────────────────

NodeFn = Callable[[dict[str, Any]], Any]
"""A pure transformation: receives upstream states keyed by node-id,
returns a new value that becomes this node's contribution to downstream
state."""


@dataclass(frozen=True)
class NodeDef:
    """A named computation node in the causal graph."""
    id: str
    fn: NodeFn
    metadata: dict[str, Any] = field(default_factory=dict)


# ── P2: Edge ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Edge:
    """A causal dependency edge: ``to`` cannot execute before ``from``."""
    from_id: str
    to_id: str


# ── P3: Trace ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Trace:
    """An immutable record of a single node execution."""
    sequence: int
    node_id: str
    input_state: dict[str, Any]
    output_state: Any
    timestamp: float = field(default_factory=time.time)


# ── P4: Lease ─────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Lease:
    """Permission binding a node to an executor for a scope."""
    node_id: str
    executor_id: str
    issued_at: float = field(default_factory=time.time)


# ── P5: Address (CAL) ─────────────────────────────────────────────────

def make_address(
    realm: str,
    graph: str,
    trajectory: str,
    node_id: str,
    version: str | None = None,
) -> str:
    """Build a CAL address from components.

    Format: ``cal://{realm}/{graph}/{trajectory}/{node}/{version}``
    """
    ver = version or _content_hash(f"{realm}/{graph}/{trajectory}/{node_id}")
    return f"cal://{realm}/{graph}/{trajectory}/{node_id}/{ver}"


def parse_address(address: str) -> dict[str, str] | None:
    """Parse a CAL address into its components."""
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


def _content_hash(*parts: str) -> str:
    raw = "|".join(parts).encode()
    return hashlib.sha256(raw).hexdigest()[:12]
