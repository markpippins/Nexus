import uuid
from collections import defaultdict, deque
from typing import List, Dict, Any


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
    def execute(self, steps: List[ExecutionStep]) -> ExecutionResult:
        execution_id = str(uuid.uuid4())
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
                failure_summary="Cycle detected in DAG dependencies"
            )

        for step in sorted_steps:
            result = StepResult(
                step_id=step.step_id,
                status="SUCCESS",
                logs=f"Dispatched step payload: {step.payload}"
            )
            step_results.append(result)

        return ExecutionResult(
            execution_id=execution_id,
            status="SUCCESS",
            step_results=step_results
        )
