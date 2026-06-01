from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class CritiqueIssue(BaseModel):
    issue_type: str
    description: str
    severity: Literal["low", "medium", "high", "critical"]


class CritiqueIR(BaseModel):
    critique_id: str
    source_plan_id: str
    scores: dict = Field(default_factory=dict)
    issues: List[CritiqueIssue] = Field(default_factory=list)
    advisory_recommendation: Literal["APPROVE", "REJECT", "REVISE"]
    rationale: str


__all__ = ["CritiqueIR", "CritiqueIssue"]
