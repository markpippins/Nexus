from dataclasses import dataclass, field
from typing import Dict, List, Set, Any
from graph_models import ConversationGraph, Observation

@dataclass
class WorkingSet:
    """Execution Substrate projected purely from ClosureSet(T). Epistemically blind."""
    workspace_id: str
    resolved_concepts: Set[str] = field(default_factory=set)
    resolves_edges: List[Any] = field(default_factory=list)

@dataclass
class ConflictSet:
    """Epistemic layer pushing unresolved tensions natively tracking constraints explicitly out of execution."""
    workspace_id: str
    contradicted_concepts: Set[str] = field(default_factory=set)
    unresolved_questions: List[str] = field(default_factory=list)
    observations: List[Observation] = field(default_factory=list)

@dataclass
class Workspace:
    id: str
    conversations: Dict[str, ConversationGraph] = field(default_factory=dict)
