from __future__ import annotations

import uuid
from collections import defaultdict, deque
from typing import Any, List

from losm_ir.execution_receipt import ExecutionReceipt
from losm_shell.runtime.handler import ExecutionContext, StepHandler


class ExecutionStep:
    def __init__(self, step_id: str, dependencies: List[str], payload: Any = None):
        self.step_id = step_id
        self.dependencies = dependencies
        self.payload = payload


class StepResult:
    def __init__(self, step_id: str, status: str, logs: str = ""):
        self.step_id = step_id
        self.status = status
        self.logs = logs


class ExecutionResult:
    def __init__(self, execution_id: str, status: str, step_results: List[StepResult], failure_summary: str = None):
        self.execution_id = execution_id
        self.status = status
        self.step_results = step_results
        self.failure_summary = failure_summary


class DAGExecutor:
    async def execute(
        self,
        steps: List[ExecutionStep],
        handler: StepHandler,
        context: ExecutionContext,
    ) -> ExecutionResult:
        execution_id = context.execution_id
        step_results = []

        in_degree = defaultdict(int)
        graph = defaultdict(list)
        step_map = {step.step_id: step for step in steps}

        for step in steps:
            in_degree[step.step_id] = len(step.dependencies)
            for dep in step.dependencies:
                graph[dep].append(step.step_id)

        queue = deque([sid for sid in step_map.keys() if in_degree[sid] == 0])
        sorted_steps = []

        while queue:
            curr = queue.popleft()
            sorted_steps.append(step_map[curr])
            for neighbor in graph[curr]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(sorted_steps) != len(steps):
            return ExecutionResult(
                execution_id=execution_id,
                status="FAILED",
                step_results=step_results,
                failure_summary="Cycle detected in DAG dependencies",
            )

        # Execute via handler
        for step in sorted_steps:
            receipt = await handler.execute(step, context)
            step_results.append(self._receipt_to_step_result(receipt))
            if receipt.result == "FAILED":
                return ExecutionResult(
                    execution_id=execution_id,
                    status="FAILED",
                    step_results=step_results,
                    failure_summary=f"Step {step.step_id} failed",
                )

        return ExecutionResult(
            execution_id=execution_id,
            status="SUCCESS",
            step_results=step_results,
        )

    @staticmethod
    def _receipt_to_step_result(receipt: ExecutionReceipt) -> StepResult:
        return StepResult(
            step_id=receipt.executor_id,
            status=receipt.result,
            logs=f"Receipt: {receipt.model_dump_json()}",
        )
