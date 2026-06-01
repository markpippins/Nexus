from typing import List

from pydantic import BaseModel, Field


class SpecStep(BaseModel):
    step_id: str
    command: str
    description: str | None = None
    input_contracts: List[str] = Field(default_factory=list)
    output_contracts: List[str] = Field(default_factory=list)
    execution_policy: str = "default"
    dependencies: List[str] = Field(default_factory=list)


class SpecIR(BaseModel):
    spec_id: str
    plan_id: str
    intent: str
    steps: List[SpecStep]
    failure_policy: str = "fail_fast"


__all__ = ["SpecIR", "SpecStep"]
