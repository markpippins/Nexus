"""Tests for KernelStepHandler — the kernel activation boundary."""

import pytest

from losm_ir.execution_receipt import ExecutionReceipt
from losm_kernel.constraints import ConstraintSystem, no_cycles
from losm_kernel.core import LOSMKernel
from losm_kernel.morphism import Morphism
from losm_kernel.types import Graph, Node, Edge
from losm_shell.runtime.executor import ExecutionStep
from losm_shell.runtime.handler import (
    ExecutionContext,
    KernelStepHandler,
    register_morphism,
)


@pytest.fixture
def empty_graph() -> Graph:
    return Graph(nodes={}, edges=[])


@pytest.fixture
def kernel() -> LOSMKernel:
    cs = ConstraintSystem()
    cs.add(no_cycles)
    return LOSMKernel(cs)


@pytest.fixture
def handler(empty_graph: Graph, kernel: LOSMKernel) -> KernelStepHandler:
    return KernelStepHandler(kernel, empty_graph)


@pytest.fixture
def context() -> ExecutionContext:
    return ExecutionContext(
        work_request_id="wr-001",
        execution_id="exec-001",
        payload={},
    )


class TestKernelStepHandlerConstruction:
    def test_requires_kernel_and_graph(self, kernel: LOSMKernel, empty_graph: Graph):
        h = KernelStepHandler(kernel, empty_graph)
        assert h is not None

    def test_graph_property(self, handler: KernelStepHandler):
        assert handler.graph is not None


class TestKernelStepHandlerDispatch:
    @pytest.mark.asyncio
    async def test_noop_for_empty_payload(
        self, handler: KernelStepHandler, context: ExecutionContext,
    ):
        step = ExecutionStep(step_id="s1", dependencies=[], payload={})
        receipt = await handler.execute(step, context)
        assert receipt.result == "SUCCESS"
        assert receipt.executor_id == "kernel:noop"

    @pytest.mark.asyncio
    async def test_noop_for_unknown_instruction(
        self, handler: KernelStepHandler, context: ExecutionContext,
    ):
        step = ExecutionStep(step_id="s1", dependencies=[], payload={"unknown": "value"})
        receipt = await handler.execute(step, context)
        assert receipt.result == "SUCCESS"
        assert receipt.executor_id == "kernel:noop"

    @pytest.mark.asyncio
    async def test_morphism_dispatch(
        self, kernel: LOSMKernel, context: ExecutionContext,
    ):
        """Apply a no-op (identity) morphism — should succeed."""
        g = Graph(nodes={"a": Node("a", "test", {"v": 1})}, edges=[])
        register_morphism("identity", Morphism("identity", lambda g: g))
        h = KernelStepHandler(kernel, g)
        step = ExecutionStep(step_id="s1", dependencies=[], payload={"morphism": "identity"})
        receipt = await h.execute(step, context)
        assert receipt.result == "SUCCESS"
        assert receipt.executor_id == "kernel:identity"

    @pytest.mark.asyncio
    async def test_morphism_transforms_graph(
        self, kernel: LOSMKernel, context: ExecutionContext,
    ):
        """Morphism that adds a node — graph should be updated."""
        g = Graph(nodes={}, edges=[])

        def add_node(g: Graph) -> Graph:
            import copy
            new_g = copy.deepcopy(g)
            new_g.nodes["result"] = Node("result", "test", {"v": 42})
            return new_g

        register_morphism("add_test_node", Morphism("add_test_node", add_node))
        h = KernelStepHandler(kernel, g)
        step = ExecutionStep(step_id="s1", dependencies=[], payload={"morphism": "add_test_node"})
        receipt = await h.execute(step, context)
        assert receipt.result == "SUCCESS"
        assert "result" in h.graph.nodes
        assert h.graph.nodes["result"].data["v"] == 42

    @pytest.mark.asyncio
    async def test_morphism_failure_returns_failed_receipt(
        self, kernel: LOSMKernel, context: ExecutionContext,
    ):
        g = Graph(nodes={"a": Node("a", "test")}, edges=[])
        h = KernelStepHandler(kernel, g)

        # Unknown morphism name → should FAIL
        step = ExecutionStep(step_id="s1", dependencies=[], payload={"morphism": "nonexistent"})
        receipt = await h.execute(step, context)
        assert receipt.result == "FAILED"
        assert receipt.executor_id == "kernel:error"

    @pytest.mark.asyncio
    async def test_program_dispatch(
        self, kernel: LOSMKernel, context: ExecutionContext,
    ):
        """Run a simple program with a registered morphism."""
        g = Graph(nodes={"x": Node("x", "test")}, edges=[])
        register_morphism("id", Morphism("id", lambda g: g))
        h = KernelStepHandler(kernel, g)
        step = ExecutionStep(
            step_id="s1",
            dependencies=[],
            payload={
                "program": ["id"],
                "env": {},
            },
        )
        receipt = await h.execute(step, context)
        assert receipt.result == "SUCCESS"
        assert receipt.executor_id == "kernel:run"

    @pytest.mark.asyncio
    async def test_graph_state_persists_across_calls(
        self, kernel: LOSMKernel, context: ExecutionContext,
    ):
        """Handler.graph should reflect all applied morphisms."""
        g = Graph(nodes={}, edges=[])

        counter = [0]

        def inc(g: Graph) -> Graph:
            import copy
            counter[0] += 1
            new_g = copy.deepcopy(g)
            new_g.nodes[f"step_{counter[0]}"] = Node(f"step_{counter[0]}", "test")
            return new_g

        register_morphism("inc", Morphism("inc", inc))
        h = KernelStepHandler(kernel, g)

        step1 = ExecutionStep("s1", [], {"morphism": "inc"})
        await h.execute(step1, context)
        assert len(h.graph.nodes) == 1

        step2 = ExecutionStep("s2", [], {"morphism": "inc"})
        await h.execute(step2, context)
        assert len(h.graph.nodes) == 2
