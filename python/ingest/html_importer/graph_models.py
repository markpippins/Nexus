from dataclasses import dataclass, field
from typing import Optional, Literal, List, Dict, Any, Set

TrajectoryState = Literal["active", "suspended", "resumed", "stable", "closed"]

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
class GraphIndexes:
    # Future placeholder for inverse lookups (e.g. trajectory_to_messages)
    pass

@dataclass
class StateEvent:
    message_id: str
    from_state: str
    to_state: str
    reason: str

@dataclass
class ReconstructedTrajectory:
    id: str
    seed_id: str
    messages: List[str] = field(default_factory=list)
    interruptions: List[str] = field(default_factory=list)
    reattachments: List[str] = field(default_factory=list)
    state: str = "active"  # active | interrupted | resumed | stable
    
    confidence: float = 0.0
    classification: str = "unclassified"

    state_transitions: List[StateEvent] = field(default_factory=list)
    
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
            "confidence": self.confidence,
            "classification": self.classification,
            "transitions": [{"msg_id": e.message_id, "from": e.from_state, "to": e.to_state, "reason": e.reason} for e in self.state_transitions]
        }

@dataclass
class ConversationGraph:
    """Root container for a conversation's graph structure acting as an object registry."""
    id: str
    build_version: str = "phase_3_v1"
    
    # Object Registries
    messages: Dict[str, MessageNode] = field(default_factory=dict)
    conversations: Dict[str, Conversation] = field(default_factory=dict)
    speakers: Dict[str, Speaker] = field(default_factory=dict)
    concepts: Dict[str, Concept] = field(default_factory=dict)
    trajectories: Dict[str, Trajectory] = field(default_factory=dict)
    reconstructed_trajectories: Dict[str, ReconstructedTrajectory] = field(default_factory=dict)
    interruptions: Dict[str, Interruption] = field(default_factory=dict)
    peos: Dict[str, PEO] = field(default_factory=dict)
    artifacts: Dict[str, Any] = field(default_factory=dict) # Placeholder for artifacts

    # Relationship Graph
    relationships: List[Relationship] = field(default_factory=list)

    # Indexes
    indexes: GraphIndexes = field(default_factory=GraphIndexes)

    def to_dict(self) -> dict:
        from dataclasses import asdict
        return asdict(self)
