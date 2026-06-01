from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class InvocationContract(BaseModel):
    type: Literal["cli", "http", "module"]
    command: Optional[str] = None
    model_config = {"extra": "allow"}


class ExecutorRegistration(BaseModel):
    executor_id: str
    supports: List[str]
    invocation_contract: InvocationContract
    system_prompt: Optional[str] = None
    model_config = {"extra": "allow"}


class ExecutorRegistry(BaseModel):
    executors: List[ExecutorRegistration] = Field(default_factory=list)
    model_config = {"extra": "allow"}


__all__ = ["ExecutorRegistry"]
