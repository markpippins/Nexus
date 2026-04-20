from typing import List, Dict, Set
from graph_models import ConversationGraph, ReconstructedTrajectory

class TrajectoryReconstructor:
    """Phase 4: Generates Derived Cognitive Threads over Validated ConversationGraphs."""
    
    def __init__(self, graph: ConversationGraph):
        self.graph = graph
        self._msg_concepts: Dict[str, Set[str]] = {}
        self._responds_to: Dict[str, str] = {}
        
    def _precompute(self):
        # 1. Evaluate Concept footprint for every message node deterministically
        for msg_id, msg in self.graph.messages.items():
            found = set()
            for cid, concept in self.graph.concepts.items():
                if concept.name.lower() in msg.text.lower():
                    found.add(cid)
            self._msg_concepts[msg_id] = found

        # 2. Extract Response structural topology
        for r in self.graph.relationships:
            if r.relation_type == "RESPONDS_TO":
                self._responds_to[r.source_id] = r.target_id

    def reconstruct(self) -> ConversationGraph:
        self._precompute()
        sorted_msgs = sorted(self.graph.messages.values(), key=lambda x: x.sequence_position)
        
        active_traj = None
        
        # Build lookup for deterministic seeds
        seed_by_anchor = {t.anchorMessage: t for t in self.graph.trajectories.values()}
        
        for msg in sorted_msgs:
            msg_concepts = self._msg_concepts[msg.id]
            
            # Rule: Trajectory Expansion Base Allocation
            if msg.id in seed_by_anchor:
                # Instantiate new trajectory
                seed = seed_by_anchor[msg.id]
                traj = ReconstructedTrajectory(
                    id=f"rec_{seed.id}",
                    seed_id=seed.id,
                    state="active",
                    confidence=seed.confidence
                )
                traj.messages.append(msg.id)
                traj.concepts_seed = msg_concepts.copy()
                traj.concepts_active = msg_concepts.copy()
                
                self.graph.reconstructed_trajectories[traj.id] = traj
                active_traj = traj
                continue
                
            # Rule: Trajectory Conservation (Pre-ambles map to synthesis threads)
            if active_traj is None:
                active_traj = ReconstructedTrajectory(
                    id="rec_default_baseline",
                    seed_id="default_seed",
                    state="active",
                    confidence=1.0
                )
                self.graph.reconstructed_trajectories[active_traj.id] = active_traj
                
            # Reattachment Pass (Dual Strategy: Structural Response Pointer + Semantic Overlap)
            structural_return = self._responds_to.get(msg.id) in active_traj.messages
            semantic_overlap = bool(msg_concepts & active_traj.concepts_seed) or bool(msg_concepts & active_traj.concepts_active)
            
            if active_traj.state == "interrupted" and (structural_return and semantic_overlap):
                active_traj.reattachments.append(msg.id)
                active_traj.transition("resumed", msg.id, "RESPONDS_TO Continuity + Semantic Overlap")
                active_traj.concepts_active.update(msg_concepts)
                continue
                
            # Interruption Pass (Structural + Keyword weight drop)
            has_keywords = any(kw in msg.text.lower() for kw in ["nevermind", "anyway", "by the way", "hold on", "switching topics"])
            
            # Primary signal: Total void of concept overlap AND no structural return AND NOT just following a clean resume
            is_coherent_continuation = active_traj.state in ["resumed", "active", "stable"] and not has_keywords
            
            if not semantic_overlap and not is_coherent_continuation:
                active_traj.interruptions.append(msg.id)
                reason_str = "Forced Keyword Interrupt" if has_keywords else "Concept Void / Structural Drift"
                active_traj.transition("interrupted", msg.id, reason_str)
            elif has_keywords:
                 active_traj.interruptions.append(msg.id)
                 active_traj.transition("interrupted", msg.id, "Forced Keyword Interrupt")
            else:
                # Normal Sequence Integration
                active_traj.messages.append(msg.id)
                active_traj.concepts_active.update(msg_concepts)
                
                # State Stability Transitions
                if active_traj.state == "resumed":
                    active_traj.transition("active", msg.id, "1 Coherent step following Resumed")
                
                if active_traj.state == "active" and active_traj.has_interrupted:
                    active_traj.transition("stable", msg.id, "Interruption survival cycle completed")
                    
        return self.graph
