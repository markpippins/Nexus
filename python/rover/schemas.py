from pydantic import BaseModel, Field
from typing import List


class HarvestedCode(BaseModel):
    language: str = Field(description="The programming language of the snippet, e.g., python, typescript, bash, sql.")
    purpose: str = Field(description="Short sentence explaining what this specific block of code implements.")
    raw_code: str = Field(description="The EXACT executable code snippet extracted from the transcript. Do not modify or truncate.")


class SpecificationCandidate(BaseModel):
    title: str = Field(description="Action-oriented title for the requirement candidate.")
    status: str = Field(description="Alignment tier from the conversation, e.g., 'Proposed', 'Agreed', 'Superseded'.")
    intent_description: str = Field(description="The business objective or core logic discussed by the speakers.")
    requirements: List[str] = Field(description="Bullet-point structural validation rules or acceptance criteria.")
    implementation_notes: List[str] = Field(description="Technical infrastructure or architectural boundaries discussed.")
    code_snippets: List[HarvestedCode] = Field(description="List of all implementable code blocks or configurations shared in the transcript for this candidate.")
    open_questions: List[str] = Field(description="Unresolved points, blockers, or items requiring another follow-up chat.")


class SpecificationAgenda(BaseModel):
    agenda_items: List[SpecificationCandidate] = Field(description="Array of all specification candidates mined from this transcript.")
