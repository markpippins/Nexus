from dataclasses import dataclass, field
from typing import Optional, Literal, List, Dict, Any, Set, Union
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

TrajectoryState = Literal["ACTIVE", "BLOCKED", "INTERMEDIATE", "PAUSED", "CLOSED", "ABORTED"]

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
    state: str
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
    completion_candidate: bool = False

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
    state: str = "ACTIVE"  # ACTIVE | BLOCKED | INTERMEDIATE | PAUSED | CLOSED | ABORTED
    
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

@dataclass
class TransitionRequest:
    """COMPILER INTERNAL STRUCTURE ONLY: Represents unresolved intent ambiguity explicitly mapped inside the Compiler Frontend cleanly before committing to IR_v2_EventEnvelope bounds."""
    trajectory_id: str
    from_state: str
    to_state: str
    trigger: str
    evidence: Dict[str, Any]
    confidence: float
    schema_version: str = "v1"
    pending_mutations: bool = False
    constraint_snapshot: List[ConstraintNode] = field(default_factory=list)

@dataclass
class TransitionDecision:
    status: str # APPROVE_EXECUTION | ROUTE_TO_SANDBOX | REJECT_TRANSITION
    reasoning: List[str]
    required_blockers: List[ConstraintNode] = field(default_factory=list)

@dataclass
class PolicySnapshot:
    policy_snapshot_id: str
    policy_hash: str



@dataclass
class ExecutionUniverse:
    universe_id: str
    ir_schema_version: str
    synthesizer_version: str
    policy_version: str
    fsm_version: str

@dataclass
class EnvelopeTransition:
    from_state: str
    to_state: str
    transition_type: str

@dataclass
class EnvelopeProvenance:
    origin_archetype: str
    origin_event_id: str
    origin_component: str
    timestamp: str

@dataclass
class EnvelopePolicyReference:
    policy_set_id: str
    policy_snapshot_hash: str

@dataclass
class EnvelopeDeterminism:
    input_hash: str
    dependency_hash: str

@dataclass
class EnvelopeReplay:
    expected_state: str
    invariant_checks: List[str]

@dataclass
class IR_v2_EventEnvelope:
    envelope_id: str
    execution_universe: ExecutionUniverse
    transition: EnvelopeTransition
    inputs: Dict[str, Any]
    provenance: EnvelopeProvenance
    policy_reference: EnvelopePolicyReference
    determinism: EnvelopeDeterminism
    replay: EnvelopeReplay

@dataclass
class KernelResultFailure:
    failed_envelope_index: int
    failed_envelope_id: str
    error_type: str
    message: str
    stage: str

@dataclass
class KernelResultStateEntry:
    index: int
    state_hash: str
    prev_hash: str

from enum import Enum

class ConflictType(Enum):
    NONE = "NONE"
    VALUE = "VALUE"
    STRUCTURAL = "STRUCTURAL"

@dataclass
class InstructionImpact:
    read_set: set
    write_set: set
    effect_type: str

@dataclass(frozen=True)
class CreateNode:
    node_id: str
    node_type: str
    def impact(self) -> InstructionImpact:
        return InstructionImpact(read_set=set(), write_set={f"node:{self.node_id}"}, effect_type="structural")

@dataclass(frozen=True)
class DeleteNode:
    node_id: str
    def impact(self) -> InstructionImpact:
        return InstructionImpact(read_set={f"node:{self.node_id}"}, write_set={f"node:{self.node_id}"}, effect_type="structural")

@dataclass(frozen=True)
class SetProperty:
    node_id: str
    key: str
    value: Any
    def impact(self) -> InstructionImpact:
        return InstructionImpact(read_set={f"node:{self.node_id}"}, write_set={f"node:{self.node_id}:prop:{self.key}"}, effect_type="value")

@dataclass(frozen=True)
class RemoveProperty:
    node_id: str
    key: str
    def impact(self) -> InstructionImpact:
        return InstructionImpact(read_set={f"node:{self.node_id}"}, write_set={f"node:{self.node_id}:prop:{self.key}"}, effect_type="value")

@dataclass(frozen=True)
class AddEdge:
    from_node: str
    to_node: str
    edge_type: str
    def impact(self) -> InstructionImpact:
        return InstructionImpact(read_set={f"node:{self.from_node}", f"node:{self.to_node}"}, write_set={f"edge:{self.from_node}:{self.to_node}:{self.edge_type}"}, effect_type="structural")

@dataclass(frozen=True)
class RemoveEdge:
    from_node: str
    to_node: str
    edge_type: str
    def impact(self) -> InstructionImpact:
        return InstructionImpact(read_set={f"node:{self.from_node}", f"node:{self.to_node}"}, write_set={f"edge:{self.from_node}:{self.to_node}:{self.edge_type}"}, effect_type="structural")

GraphMutation = Union[CreateNode, DeleteNode, SetProperty, RemoveProperty, AddEdge, RemoveEdge]

@dataclass
class GraphMutationEvent:
    event_id: str
    trajectory_id: str
    timestep_seq: int
    mutations: List[GraphMutation] = field(default_factory=list)
    provenance: EnvelopeProvenance = None
    schema_version: str = "v2"

    def compute_hash(self) -> str:
        import hashlib
        payload_data = [str(m.__dict__) for m in self.mutations]
        payload = f"{self.trajectory_id}|{self.timestep_seq}|{payload_data}"
        return hashlib.sha256(payload.encode('utf-8')).hexdigest()

def normalize(value: Any) -> Any:
    if isinstance(value, dict):
        return tuple((k, normalize(v)) for k, v in sorted(value.items()))
    if isinstance(value, list) or isinstance(value, set) or isinstance(value, tuple):
        return tuple(normalize(v) for v in value)
    if isinstance(value, float):
        return ("float", repr(value))
    if isinstance(value, int):
        return ("int", repr(value))
    if isinstance(value, str):
        return ("str", repr(value))
    if isinstance(value, bool):
        return ("bool", repr(value))
    if value is None:
        return ("None",)
    return value

@dataclass(frozen=True)
class GraphState:
    nodes: Dict[str, Any] = field(default_factory=dict)
    edges: Dict[str, Any] = field(default_factory=dict)

    def get_canonical_structure(self) -> tuple:
        return (
            "GraphState",
            ("nodes", tuple((node_id, normalize(n_props)) for node_id, n_props in sorted(self.nodes.items()))),
            ("edges", tuple((edge_id, normalize(e_props)) for edge_id, e_props in sorted(self.edges.items()))),
        )
        
    def canonical_bytes(self) -> bytes:
        return repr(self.get_canonical_structure()).encode("utf-8")
        
    def compute_hash(self) -> str:
        import hashlib
        return hashlib.sha256(self.canonical_bytes()).hexdigest()

@dataclass
class KernelResultTraceEntry:
    index: int
    envelope_id: str
    outcome: str
    graph_mutation_event_hash: Optional[str] = None
    state_hash: Optional[str] = None
    policy_snapshot_id: Optional[str] = None

@dataclass
class KernelDeterminismProof:
    input_hash: str
    dependency_hash: str
    replay_verified: bool

@dataclass
class KernelResult:
    run_id: str
    execution_universe: ExecutionUniverse
    status: str
    total_envelopes: int
    committed_envelopes: int
    final_state_hash: str
    failure: Optional[KernelResultFailure] = None
    state_chain: List[KernelResultStateEntry] = field(default_factory=list)
    trace: List[KernelResultTraceEntry] = field(default_factory=list)
    mutation_events: Dict[str, GraphMutationEvent] = field(default_factory=dict)
    determinism: Optional[KernelDeterminismProof] = None
    policy_snapshot_reference: Optional[EnvelopePolicyReference] = None

@dataclass
class MaterializedReplayView:
    run_id: str
    schema_version: str
    final_graph_state: GraphState

@dataclass(frozen=True)
class InstructionID:
    timeline_id: str
    index: int

@dataclass
class InstructionMetadata:
    actor_id: str
    timestamp: int
    semantic_tag: str = "default"
    confidence: float = 1.0

@dataclass
class TimelineMetadata:
    creator_id: str
    reason: str

@dataclass
class InstructionRecord:
    instruction: GraphMutation
    state_hash: str
    metadata: InstructionMetadata = field(default_factory=lambda: InstructionMetadata("system", 0))

@dataclass
class Timeline:
    id: str
    parent: Optional[str]
    fork_index: Optional[int]
    instructions: List[InstructionRecord] = field(default_factory=list)
    metadata: TimelineMetadata = field(default_factory=lambda: TimelineMetadata("system", "genesis"))

@dataclass
class Snapshot:
    timeline_id: str
    instruction_index: int
    state: GraphState

@dataclass
class ReplayValidationResult:
    is_valid: bool
    divergence_reason: Optional[str] = None
    divergence_element_index: Optional[int] = None
