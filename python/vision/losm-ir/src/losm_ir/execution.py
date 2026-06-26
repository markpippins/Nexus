from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from losm_ir.spec import SpecIR


class ExecutionStatus(str):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"


class StepResult(BaseModel):
    step_id: str
    status: Literal[ExecutionStatus.SUCCESS, ExecutionStatus.FAILURE, ExecutionStatus.PENDING]
    logs: Optional[str] = None
    error: Optional[str] = None


class ExecutionIR(BaseModel):
    execution_id: str
    spec: SpecIR
    status: Literal[
        ExecutionStatus.PENDING,
        ExecutionStatus.RUNNING,
        ExecutionStatus.SUCCESS,
        ExecutionStatus.FAILURE,
    ] = ExecutionStatus.PENDING
    step_results: List[StepResult] = Field(default_factory=list)
    logs: Optional[str] = None
    metrics: dict = Field(default_factory=dict)
    retry_count: int = 0
    failure_summary: Optional[str] = None


__all__ = ["ExecutionIR", "ExecutionStatus", "StepResult"]
