from dataclasses import dataclass, field
from typing import List, Set, Any, Callable
from graph_models import IR_EventEnvelope
from observation_engine import MergedClosureDAG, ObservationView

class AppendOnlyEventStore:
    """Layer XIV: Distributed Deployment - Event Store Consistency Model"""
    def __init__(self):
        self._log: List[IR_EventEnvelope] = []
        self._hash_chain: List[str] = ["genesis"]
        
    def append(self, envelope: IR_EventEnvelope):
        import hashlib
        prev_hash = self._hash_chain[-1]
        new_hash = hashlib.sha256(f"{prev_hash}|{envelope.envelope_id}".encode('utf-8')).hexdigest()
        self._hash_chain.append(new_hash)
        self._log.append(envelope)
        
    @property
    def log(self):
        """Returns immutable tuple representing replicated log state."""
        return tuple(self._log)

@dataclass
class NexusRuntimeState:
    """Layer XI: Operational Runtime State Management Model"""
    nexus_version: str
    dag_version: str
    current_dag: MergedClosureDAG
    event_store: AppendOnlyEventStore = field(default_factory=AppendOnlyEventStore)

class DeterministicValidator:
    """Layer IX: External Actor Interaction Contract - Validation Gate"""
    
    @staticmethod
    def validate_event(envelope: Any) -> bool:
        # Deterministic Validation Layer Checks
        if not hasattr(envelope, 'trajectory_id'):
            return False
            
        # Ensure provenance is strictly defined (no ambiguous actor attribution)
        if not hasattr(envelope, 'provenance') or envelope.provenance is None:
            return False
            
        return True

class RuntimeScheduler:
    """Layer XI: Operational Runtime Model - Concurrency Constraint"""
    
    @staticmethod
    def can_execute_parallel(impact_a: Set[str], impact_b: Set[str]) -> bool:
        """Physical Parallelism allowed only if no shared write_set intersections exist."""
        return len(impact_a.intersection(impact_b)) == 0

class ExternalActorInterface:
    """Layer IX: Security Boundary Definition"""
    
    def __init__(self, runtime_state: NexusRuntimeState):
        self.state = runtime_state

    def submit_event(self, envelope: IR_EventEnvelope) -> bool:
        """EVENT PRODUCER interface."""
        if DeterministicValidator.validate_event(envelope):
            # Append only semantics to EventStore
            self.state.event_store.append(envelope)
            # This would trigger the Layer XI Event-Driven Execution Loop
            return True
        return False

    def query_view(self, query_func: Callable[[MergedClosureDAG], ObservationView]) -> dict:
        """QUERY CONSUMER interface. Evaluates on frozen DAG snapshot."""
        # Query executes strictly on read-only current_dag
        view = query_func(self.state.current_dag)
        # Immediately serialize to prevent backflow (Layer VIII)
        return ObservationExternalizer.externalize(view)

class ObservationExternalizer:
    """Layer VIII: Observation Externalization Contract"""
    
    @staticmethod
    def externalize(view: ObservationView) -> dict:
        """Lossless-to-semantics, lossy-to-structure projection."""
        # External_Output ∩ Kernel_Input_Space = ∅
        return {
            "nexus_version": view.nexus_version,
            "dag_version": view.dag_version,
            "frontier_id": view.frontier_id,
            "nodes": list(view.observed_nodes),
            "is_causal_cut_valid": view.causal_cut_valid
        }
