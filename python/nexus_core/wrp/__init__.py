"""WRP state machine primitives, kernel data types, and projection reducer."""

from .states import (
    WRP_ADJACENCY_MATRIX,
    RECEIPT_TO_WRP_STATE,
    is_valid_transition,
)

from .kernel import (
    KernelDelta,
    KernelDeltaBatch,
    KernelError,
    KernelResult,
    KernelSnapshot,
)

# conduit_wrp_reducer imports are lazy — it has a module-level crossref_taxonomy
# dependency that may not be available in all test environments.
# Use: from nexus_core.wrp.conduit_wrp_reducer import WRPProjectionBuilder

__all__ = [
    # states.py
    "WRP_ADJACENCY_MATRIX",
    "RECEIPT_TO_WRP_STATE",
    "is_valid_transition",
    # kernel.py
    "KernelDelta",
    "KernelDeltaBatch",
    "KernelError",
    "KernelResult",
    "KernelSnapshot",
]
