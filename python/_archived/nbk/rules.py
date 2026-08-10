"""
Mutation rules for the NBK self-optimization loop (SOCO layer).

Each rule implements the MutationRule protocol from kernel.py:

    - applies(node_id, node_def, kernel) → bool
    - apply(node_id, kernel) → list[str]  (affected node ids)

Rules are deterministic, semantics-preserving transformations that
must never violate replay equivalence.
"""

from __future__ import annotations

from typing import Any

from nbk.kernel import MutationRule, NexusBootstrapKernel


class CollapseChainRule(MutationRule):
    """Collapse a linear chain A→B→C into a single fused node.

    Applies when a node has exactly one upstream and one downstream
    dependency, forming a pure pipeline segment.
    """

    def applies(self, node_id: str, node, kernel: NexusBootstrapKernel) -> bool:
        deps = kernel.dependencies(node_id)
        depes = kernel.dependents(node_id)
        # Exactly one input and one output = pipeline stage
        return len(deps) == 1 and len(depes) == 1

    def apply(self, node_id: str, kernel: NexusBootstrapKernel) -> list[str]:
        up = kernel.dependencies(node_id)[0]
        down = kernel.dependents(node_id)[0]
        up_node = kernel.get_node(up)
        middle_node = kernel.get_node(node_id)
        down_node = kernel.get_node(down)

        if up_node is None or middle_node is None or down_node is None:
            return []

        # Fuse: compose all three functions into one.
        # Original: A (up) → B (middle) → C (down)
        # A outputs a value; B expects {"A": a_out}; C expects {"B": b_out}
        def fused(inputs: dict[str, Any]) -> Any:
            a_out = up_node.fn(inputs)
            b_input = {up: a_out}
            b_out = middle_node.fn(b_input)
            c_input = {node_id: b_out}
            return down_node.fn(c_input)

        fused_id = f"{up}+{node_id}+{down}"
        kernel.add_node(fused_id, fused)

        # Rewire: connect upstream deps of 'up' to fused
        for dep_of_up in kernel.dependencies(up):
            if dep_of_up != fused_id:
                kernel.add_edge(dep_of_up, fused_id)

        # Connect fused to downstream dependents of 'down'
        for dep_of_down in kernel.dependents(down):
            if dep_of_down not in (node_id, fused_id):
                kernel.add_edge(fused_id, dep_of_down)

        # Remove old leases
        for old in [up, node_id, down]:
            if old in kernel.leases:
                del kernel.leases[old]

        return [fused_id]


class MergeIdleLeasesRule(MutationRule):
    """Rebind idle nodes (unexecuted) to a shared executor.

    Reduces executor fragmentation by consolidating unassigned or
    idle leases under a single executor.
    """

    def __init__(self, target_executor: str = "executor-shared") -> None:
        self.target = target_executor

    def applies(self, node_id: str, node, kernel: NexusBootstrapKernel) -> bool:
        # Node is unexecuted or not leased
        return (
            node_id in kernel.leases
            and node_id not in kernel._node_states
        )

    def apply(self, node_id: str, kernel: NexusBootstrapKernel) -> list[str]:
        old = kernel.leases.get(node_id)
        kernel.leases[node_id] = self.target
        return [node_id]
