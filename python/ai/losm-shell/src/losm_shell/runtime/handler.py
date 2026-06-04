from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING, Any, Dict, Protocol

from losm_ir.execution_receipt import ExecutionReceipt

from losm_kernel.core import LOSMKernel
from losm_kernel.morphism import Env, Morphism
from losm_kernel.types import Graph

if TYPE_CHECKING:
    from losm_shell.runtime.executor import ExecutionStep


# ---------------------------------------------------------------------------
# Morphism registry — maps string names to LOSKernel morphisms
# ---------------------------------------------------------------------------

_MORPHISM_REGISTRY: Dict[str, Morphism] = {}

try:
    from losm_kernel.morphism import (
        compile_morphism,
        execute_morphism,
        plan_morphism,
    )
    _MORPHISM_REGISTRY["plan"] = plan_morphism
    _MORPHISM_REGISTRY["compile"] = compile_morphism
    _MORPHISM_REGISTRY["execute"] = execute_morphism
except ImportError:
    pass


def register_morphism(name: str, morphism: Morphism) -> None:
    """Register a morphism for use by KernelStepHandler."""
    _MORPHISM_REGISTRY[name] = morphism


def resolve_morphism(name: str) -> Morphism:
    """Look up a morphism by name from the registry."""
    if name not in _MORPHISM_REGISTRY:
        raise ValueError(
            f"Unknown morphism: '{name}'. "
            f"Available: {list(_MORPHISM_REGISTRY.keys())}"
        )
    return _MORPHISM_REGISTRY[name]


# ---------------------------------------------------------------------------
# StepHandler protocol and implementations
# ---------------------------------------------------------------------------


@dataclass
class ExecutionContext:
    """Bag of context for step execution.

    Carries the identity of the work request and execution,
    plus any payload the caller wants to pass through.
    """
    work_request_id: str
    execution_id: str
    payload: Any = None
    metadata: dict[str, Any] = field(default_factory=dict)


class StepHandler(Protocol):
    """Protocol for step execution semantics.

    DAGExecutor never knows what a step *means*:
    - KernelStepHandler → calls losm-kernel transformations
    - LLMStepHandler → calls an LLM
    - ToolStepHandler → calls an external tool
    - NullStepHandler → returns SUCCESS (default)

    The handler is the execution boundary. Everything downstream
    is a semantic runtime component.
    """

    async def execute(
        self,
        step: ExecutionStep,
        context: ExecutionContext,
    ) -> ExecutionReceipt:
        ...


class NullStepHandler:
    """Default handler that always returns SUCCESS.

    Preserves current behavior while establishing the protocol boundary.
    """

    async def execute(
        self,
        step: ExecutionStep,
        context: ExecutionContext,
    ) -> ExecutionReceipt:
        return ExecutionReceipt(
            work_request_id=context.work_request_id,
            executor_id="null-handler",
            inputs=[context.payload] if context.payload else [],
            mutations=[],
            timestamp=datetime.utcnow().isoformat(),
            result="SUCCESS",
            lineage_parent=context.execution_id,
        )


class KernelStepHandler:
    """StepHandler that delegates to LOSMKernel for graph transformation steps.

    Interprets ExecutionStep.payload as a kernel instruction:

    - ``{"morphism": "plan"}`` → calls ``kernel.apply(plan_morphism, graph)``
    - ``{"morphism": "compile"}`` → calls ``kernel.apply(compile_morphism, graph)``
    - ``{"morphism": "execute"}`` → calls ``kernel.apply(execute_morphism, graph)``
    - ``{"program": [...], "env": {...}}`` → calls ``kernel.run(program, env)``
    - anything else → SUCCESS no-op receipt
    """

    def __init__(self, kernel: LOSMKernel, graph: Graph):
        self._kernel = kernel
        self._graph = graph

    async def execute(
        self,
        step: ExecutionStep,
        context: ExecutionContext,
    ) -> ExecutionReceipt:
        instruction: dict = step.payload or {}

        try:
            if "morphism" in instruction:
                return await self._dispatch_morphism(instruction, context)
            elif "program" in instruction:
                return await self._dispatch_program(instruction, context)
            else:
                return ExecutionReceipt(
                    work_request_id=context.work_request_id,
                    executor_id="kernel:noop",
                    inputs=[instruction],
                    mutations=[],
                    timestamp=datetime.utcnow().isoformat(),
                    result="SUCCESS",
                    lineage_parent=context.execution_id,
                )
        except Exception as e:
            return ExecutionReceipt(
                work_request_id=context.work_request_id,
                executor_id="kernel:error",
                inputs=[instruction],
                mutations=[],
                timestamp=datetime.utcnow().isoformat(),
                result="FAILED",
                lineage_parent=context.execution_id,
            )

    async def _dispatch_morphism(
        self,
        instruction: dict,
        context: ExecutionContext,
    ) -> ExecutionReceipt:
        morphism_name: str = instruction["morphism"]
        morphism = resolve_morphism(morphism_name)
        new_g, witness = self._kernel.apply(morphism, self._graph)
        self._graph = new_g
        return ExecutionReceipt(
            work_request_id=context.work_request_id,
            executor_id=f"kernel:{morphism_name}",
            inputs=[instruction],
            mutations=[{"target": "graph", "action": "apply_morphism", "diff": morphism_name}],
            timestamp=datetime.utcnow().isoformat(),
            result="SUCCESS",
            lineage_parent=context.execution_id,
        )

    async def _dispatch_program(
        self,
        instruction: dict,
        context: ExecutionContext,
    ) -> ExecutionReceipt:
        program: list = instruction["program"]
        env_data: dict = instruction.get("env", {})
        env = Env()

        # Pre-populate env with globally registered morphisms as defaults
        for name, morphism in _MORPHISM_REGISTRY.items():
            env.bind(name, morphism)

        # Override with any morphisms passed explicitly in the payload
        if callable(env_data):
            env = env_data()
        elif isinstance(env_data, dict):
            for name, morphism_func in env_data.items():
                if callable(morphism_func):
                    env.bind(name, Morphism(name, morphism_func))

        execute = self._kernel.run(program, env)
        final_g, trace = execute(self._graph)
        self._graph = final_g
        return ExecutionReceipt(
            work_request_id=context.work_request_id,
            executor_id="kernel:run",
            inputs=[instruction],
            mutations=[{"target": "graph", "action": "run_program", "diff": str(program)}],
            timestamp=datetime.utcnow().isoformat(),
            result="SUCCESS",
            lineage_parent=context.execution_id,
        )

    @property
    def graph(self) -> Graph:
        """Current graph state after applied transformations."""
        return self._graph
