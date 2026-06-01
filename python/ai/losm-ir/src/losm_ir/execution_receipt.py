from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class MutationRecord(BaseModel):
    target: Optional[str] = None
    action: Optional[str] = None
    diff: Optional[str] = None
    model_config = {"extra": "allow"}


class ExecutionReceipt(BaseModel):
    work_request_id: str
    executor_id: str
    inputs: List[Dict[str, Any]] = Field(default_factory=list)
    mutations: List[MutationRecord] = Field(default_factory=list)
    timestamp: str
    result: Literal["SUCCESS", "FAILED", "PARTIAL"]
    lineage_parent: str

    model_config = {"extra": "allow"}


__all__ = ["ExecutionReceipt"]
