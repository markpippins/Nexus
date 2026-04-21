from typing import Dict, List
from graph_models import ConversationGraph, IR_Diff, Observation, ObservationContent

class DiffEngine:
    """Phase 4.5: Extracts explicit Structural Deltas sequentially over Materialized IR Snapshots."""

    def __init__(self, graph: ConversationGraph):
        self.graph = graph

    def compute_diffs(self) -> ConversationGraph:
        """Derives IR_Diff records per-trajectory implicitly decoupling epistemology from inference."""
        
        for traj in self.graph.reconstructed_trajectories.values():
            if len(traj.snapshots) < 2:
                continue
                
            historical_tracker = set()
                
            for i in range(1, len(traj.snapshots)):
                prev = traj.snapshots[i-1]
                curr = traj.snapshots[i]
                
                added = []
                modified = []
                deprecated = []
                reintroduced = []
                
                prev_cids = set(prev.concepts_active.keys())
                curr_cids = set(curr.concepts_active.keys())
                
                # Check Additions
                for cid in curr_cids.difference(prev_cids):
                    if cid in historical_tracker:
                        reintroduced.append(cid)
                    else:
                        added.append(cid)
                        historical_tracker.add(cid)
                        
                # Check Removals
                for cid in prev_cids.difference(curr_cids):
                    deprecated.append(cid)
                    
                # Check Modifications (Scope drift)
                for cid in prev_cids.intersection(curr_cids):
                    if prev.concepts_active[cid] != curr.concepts_active[cid]:
                        modified.append(cid)
                        
                if added or modified or deprecated or reintroduced:
                    delta = IR_EventEnvelope(
                        trajectory_id=traj.id,
                        timestep_msg_id=curr.timestep_message_id,
                        added_nodes=added,
                        modified_nodes=modified,
                        removed_nodes=deprecated,
                        reintroduced_nodes=reintroduced
                    )
                    traj.event_envelopes.append(delta)
                    
        return self.graph
