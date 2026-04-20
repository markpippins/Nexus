from dataclasses import dataclass, field
from typing import List, Set

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
            "transitions": [{"msg_id": e.message_id, "from": e.from_state, "to": e.to_state, "reason": e.reason} for e in self.state_transitions]
        }
