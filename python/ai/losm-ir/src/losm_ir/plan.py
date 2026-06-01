from typing import List

from pydantic import BaseModel


class ExecutionStep(BaseModel):
    order: int
    action: str
    description: str | None = None


class PlanIR(BaseModel):
    goal_interpretation: str
    constraints: list[str]
    assumptions: list[str]
    execution_steps: list[ExecutionStep]


__all__ = ["PlanIR", "ExecutionStep"]
