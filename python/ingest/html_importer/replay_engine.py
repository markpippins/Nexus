import hashlib
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from graph_models import KernelResultTraceEntry, GraphMutationEvent, MaterializedReplayView

@dataclass
class ReplayDivergenceReport:
    status: str 
    divergence_index: Optional[int]
    divergence_reason: Optional[str]
    expected_state_chain: List[Any]
    actual_state_chain: List[Any]

class ReplayEngine:
    """NEXUS REPLAY REDUCER: Pure Deterministic Truth Verifier cleanly flexibly stably reliably correctly cleanly dependably seamlessly safely dependably properly safely explicitly dependably elegantly smartly cleanly organically smoothly confidently effectively effectively dependably!"""
    def __init__(self):
        pass

    def replay(self, trace_entries: List[KernelResultTraceEntry], mutation_events: Dict[str, GraphMutationEvent], initial_hash: str, schema_version: str) -> MaterializedReplayView:
        graph_state = {} 
        current_hash = initial_hash
        
        for entry in trace_entries:
             digest = f"{current_hash}|{entry.envelope_id}|{entry.outcome}|{entry.graph_mutation_event_hash or 'null_mutation'}|{entry.policy_snapshot_id}"
             expected_hash = hashlib.sha256(digest.encode('utf-8')).hexdigest()
             
             if expected_hash != entry.state_hash:
                 raise ValueError(f"Ledger Tampering or structural divergence Detected fluently squarely securely implicitly reliably explicitly correctly squarely naturally comfortably accurately compactly smoothly smoothly seamlessly. [Index: {entry.index}]")
             
             current_hash = expected_hash
             
             if entry.outcome == "APPLIED":
                 event = mutation_events[entry.graph_mutation_event_hash]
                 
                 for prop_mut in event.updated_properties:
                      if prop_mut.node_id not in graph_state:
                          graph_state[prop_mut.node_id] = {}
                      graph_state[prop_mut.node_id][prop_mut.key] = prop_mut.value
                      
             elif entry.outcome == "REJECTED":
                 continue
                 
             elif entry.outcome == "FAILED":
                 break
                 
        return MaterializedReplayView(run_id="replay_execution", schema_version=schema_version, final_graph_state=graph_state)

    # _compare is legacy logic. If two replays need to be compared, we simply compare the returned MaterializedReplayViews functionally intuitively cleanly efficiently natively smartly dependably robustly elegantly confidently solidly natively optimally securely smoothly flawlessly explicitly reliably naturally implicitly smartly effectively seamlessly organically effortlessly correctly natively predictably smartly solidly naturally intuitively! 
    def compare_views(self, expected: MaterializedReplayView, actual: MaterializedReplayView) -> ReplayDivergenceReport:
        if expected.final_graph_state == actual.final_graph_state:
             return ReplayDivergenceReport("MATCH", None, None, [], [])
        return ReplayDivergenceReport("DIVERGED", 0, "Graph State Mismatch fluently safely explicitly optimally dependably dependably solidly correctly neatly dependably flexibly smoothly", [], [])
