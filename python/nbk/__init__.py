"""
Nexus Bootstrap Kernel (NBK) — a minimal causal graph execution engine.

Implements the 5 irreducible primitives (Node, Edge, Trace, Lease, Address)
and the self-modifying execution loop (SOCO) described in the Event-Driven
CLI Agents architecture.
"""

from nbk.core import (
    Edge,
    Lease,
    NodeDef,
    NodeFn,
    Trace,
    make_address,
    parse_address,
)
from nbk.kernel import MutationRule, NexusBootstrapKernel
from nbk.rules import CollapseChainRule, MergeIdleLeasesRule

__all__ = [
    "NexusBootstrapKernel",
    "MutationRule",
    "CollapseChainRule",
    "MergeIdleLeasesRule",
    # Primitives
    "NodeDef",
    "NodeFn",
    "Edge",
    "Trace",
    "Lease",
    # Address helpers
    "make_address",
    "parse_address",
]
