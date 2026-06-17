from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class ValidationStatus(str):
    SUCCESS = "success"
    FAILURE = "failure"
    PARTIAL = "partial"


class ValidationIssue(BaseModel):
    issue_type: str
    description: str


class ValidationIR(BaseModel):
    validation_id: str
    intent: str
    status: Literal[ValidationStatus.SUCCESS, ValidationStatus.FAILURE, ValidationStatus.PARTIAL]
    score: float = 0.0
    issues: List[ValidationIssue] = Field(default_factory=list)
    recommendation: Optional[str] = None
    logs: Optional[str] = None


__all__ = ["ValidationIR", "ValidationStatus", "ValidationIssue"]
