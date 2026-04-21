from dataclasses import dataclass, field
from typing import Optional, Literal, List, Dict, Any, Set
from enum import Enum

class InteractionArchetype(Enum):
    CONSTRUCTION = "CONSTRUCTION"
    EXECUTION = "EXECUTION"
    REFLECTION = "REFLECTION"
    RECONCILIATION = "RECONCILIATION"
    REVISION = "REVISION"
    COUNTERFACTUAL = "COUNTERFACTUAL"
    AUDIT = "AUDIT"
    COMPRESSION = "COMPRESSION"
    CONSTRAINT_INJECTION = "CONSTRAINT_INJECTION"

TrajectoryState = Literal["active", "suspended", "resumed", "stable", "closed"]

@dataclass
class SemanticLabel:
    archetype: str
    confidence: float
    source_span: str
    timestamp: str

@dataclass
class ConstraintNode:
    id: str
    state: str # OPEN | SATISFIED | VIOLATED
    constraint_type: str # LEGAL | TECHNICAL | RESOURCE | POLICY
    source: str
    linked_nodes: List[str] = field(default_factory=list)

@dataclass
class Relationship:
    source_id: str
    target_id: str
    relation_type: str
    confidence: float

@dataclass
class MessageNode:
    id: str
    text: str
    speaker: str = "unknown"
    timestamp: Optional[str] = None
    turn_index: int = 0
    sequence_position: int = 0
    embedding: Optional[List[float]] = None
    trajectoryId: Optional[str] = None
    peoIds: List[str] = field(default_factory=list)

@dataclass
class Trajectory:
    id: str
    anchorMessage: str  
    state: TrajectoryState
    confidence: float
    messages: List[str] = field(default_factory=list) 

@dataclass
class Interruption:
    id: str
    type: str 
    messageId: str
    suspendsTrajectory: bool

@dataclass
class PEO:  
    id: str
    originMessage: str
    proposal: str
    trajectoryId: str
    status: str 
    decayScore: float

@dataclass
class Concept:
    id: str
    name: str
    scope_id: Optional[str] = None
    description: Optional[str] = None

@dataclass
class Speaker:
    id: str
    name: str

@dataclass
class Conversation:
    id: str
    title: Optional[str] = None

@dataclass
class Conversation:
    id: str
    title: Optional[str] = None

@dataclass
class StateEvent:
    message_id: str
    from_state: str
    to_state: str
    reason: str

@dataclass
class TrajectorySnapshot:
    timestep_message_id: str
    concepts_active: Dict[str, Optional[str]] = field(default_factory=dict) # Maps cid -> scope_id to detect modifications

@dataclass
class IR_EventEnvelope:
    trajectory_id: str
    timestep_msg_id: str
    added_nodes: List[str] = field(default_factory=list)
    modified_nodes: List[str] = field(default_factory=list)
    removed_nodes: List[str] = field(default_factory=list)
    reintroduced_nodes: List[str] = field(default_factory=list)
    emitted_edges: List[Any] = field(default_factory=list)
    emitted_observations: List[Any] = field(default_factory=list)
    emitted_questions: List[Any] = field(default_factory=list)
    partial_resolutions: List[Any] = field(default_factory=list)
    emitted_constraints: List[Any] = field(default_factory=list)
    semantic_labels: List[SemanticLabel] = field(default_factory=list)
    archetypes: Set[InteractionArchetype] = field(default_factory=set)
    schema_version: str = "v1"
    timestep_sequence: int = 0

@dataclass
class ObservationContent:
    concept_ids: List[str]
    relation: str  # SUPPORTS | CONTRADICTS | REFINES | REINTRODUCES
    evidence_pointer: str  

@dataclass
class Observation:
    id: str  
    source_trajectory_id: str
    scope_id: str
    content: Any 
    polarity: str 
    confidence: float
    type: str = "EPISTEMIC_DIFF"

@dataclass
class QuestionBinding:
    required_concept_ids: List[str] = field(default_factory=list)

@dataclass
class QuestionNode:
    id: str
    scope_id: str
    source_trajectory_id: Optional[str]
    binding: QuestionBinding
    status: str = "OPEN"  # OPEN | PARTIALLY_RESOLVED | RESOLVED

@dataclass
class PartialResolution:
    question_id: str
    satisfied_predicates: List[str]
    missing_predicates: List[str]
    candidate_subgraph_roots: List[str]

@dataclass
class ReconstructedClosureSet:
    trajectory_id: str
    resolved_concepts: Set[str] = field(default_factory=set)
    resolves_edges: List[Any] = field(default_factory=list)
    constraints: List[ConstraintNode] = field(default_factory=list)

@dataclass
class MaterializedReplayView:
    run_id: str
    schema_version: str
    closures: Dict[str, ReconstructedClosureSet] = field(default_factory=dict)

@dataclass
class ReconstructedTrajectory:
    id: str
    seed_id: str
    messages: List[str] = field(default_factory=list)
    interruptions: List[str] = field(default_factory=list)
    reattachments: List[str] = field(default_factory=list)
    state: str = "active"  # active | interrupted | resumed | stable
    
    state_transitions: List[StateEvent] = field(default_factory=list)
    snapshots: List[TrajectorySnapshot] = field(default_factory=list)
    event_envelopes: List[IR_EventEnvelope] = field(default_factory=list)
    
    # Track historical validation context
    has_interrupted: bool = False
    
    # Internal trackers for compilation passes
    concepts_seed: Set[str] = field(default_factory=set)
    concepts_active: Set[str] = field(default_factory=set)

    def transition(self, to_state: str, message_id: str, reason: str):
        """Append trace log and securely update internal machine state."""
        if self.state == to_state:
            return
            
        self.state_transitions.append(StateEvent(
            message_id=message_id,
            from_state=self.state,
            to_state=to_state,
            reason=reason
        ))
        
        if to_state == "interrupted":
            self.has_interrupted = True
            
        self.state = to_state

    def to_dict(self):
        return {
            "id": self.id,
            "seed_id": self.seed_id,
            "messages": self.messages,
            "interruptions": self.interruptions,
            "reattachments": self.reattachments,
            "state": self.state,
            "transitions": [{"msg_id": e.message_id, "from": e.from_state, "to": e.to_state, "reason": e.reason} for e in self.state_transitions]
        }

@dataclass
class ConversationGraph:
    """Root container for a conversation's graph structure acting as an object registry."""
    id: str
    build_version: str = "phase_3"
    
    # Object Registries
    messages: Dict[str, MessageNode] = field(default_factory=dict)
    conversations: Dict[str, Conversation] = field(default_factory=dict)
    speakers: Dict[str, Speaker] = field(default_factory=dict)
    concepts: Dict[str, Concept] = field(default_factory=dict)
    trajectories: Dict[str, Trajectory] = field(default_factory=dict)
    reconstructed_trajectories: Dict[str, ReconstructedTrajectory] = field(default_factory=dict)
    replay_views: Dict[str, Dict[str, MaterializedReplayView]] = field(default_factory=dict) # run_id -> (schema_version -> view)
    interruptions: Dict[str, Interruption] = field(default_factory=dict)
    peos: Dict[str, PEO] = field(default_factory=dict)
    questions: Dict[str, QuestionNode] = field(default_factory=dict)
    observations: Dict[str, Observation] = field(default_factory=dict)
    constraints: Dict[str, ConstraintNode] = field(default_factory=dict)
    artifacts: Dict[str, Any] = field(default_factory=dict)

    # Relationship Graph
    relationships: List[Relationship] = field(default_factory=list)

    def to_dict(self) -> dict:
        from dataclasses import asdict
        return asdict(self)
