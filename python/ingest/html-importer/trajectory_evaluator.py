from graph_models import ConversationGraph, ReconstructedTrajectory

class TrajectoryEvaluator:
    """Phase 4.5: Validates and scores reconstructed trajectories attached to the Graph."""
    
    def evaluate(self, graph: ConversationGraph):
        for traj in graph.reconstructed_trajectories.values():
            confidence = self._score(traj)
            traj.confidence = confidence
            traj.classification = self._classify(confidence)
            
    def _score(self, traj: ReconstructedTrajectory) -> float:
        # Base instantiation
        score = 0.1
        
        # Length footprint
        score += min(len(traj.messages), 4) * 0.1
        
        # Resilience Bonus
        score += len(traj.reattachments) * 0.15
        
        # Stability check
        if traj.state == "stable":
            score += 0.2
            
        # Fragmentation penalty
        score -= len(traj.interruptions) * 0.05
        
        return max(0.0, min(1.0, score))

    def _classify(self, confidence: float) -> str:
        if confidence < 0.3:
            return "Transient"
        elif confidence < 0.6:
            return "Developing"
        elif confidence < 0.8:
            return "Established"
        return "Core Thread"
