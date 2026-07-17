"""
KernelDelta — the sole input type to the WRP kernel Reduce function.

This module re-exports KernelDelta and KernelDeltaBatch from nexus_core.wrp.kernel
(the canonical definition). See nexus_core/ for the authoritative types.
"""

from nexus_core.wrp.kernel import KernelDelta, KernelDeltaBatch

__all__ = ["KernelDelta", "KernelDeltaBatch"]
