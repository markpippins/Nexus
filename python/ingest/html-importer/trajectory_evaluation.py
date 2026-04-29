import math
from dataclasses import dataclass
from typing import Dict
from datetime import datetime

from graph_models import ConversationGraph, ReconstructedTrajectory

@dataclass
class TrajectoryEvaluation:
    trajectory_id: str

    message_count: int
    duration_seconds: float

    stability_score: float
    coherence_score: float
    engagement_score: float

    interruption_count: int
    reattachment_count: int

    final_state: str
    classification: str

    def to_dict(self):
        from dataclasses import asdict
        return asdict(self)

class TrajectoryEvaluator:
    """Phase 5: Validates and scores reconstructed trajectories detached from the Graph annotations."""
    
    def __init__(self, graph: ConversationGraph):
        self.graph = graph

    def evaluate(self) -> Dict[str, TrajectoryEvaluation]:
        evaluations = {}
        for traj in self.graph.reconstructed_trajectories.values():
            evaluations[traj.id] = self._evaluate_trajectory(traj)
        return evaluations

    def _evaluate_trajectory(self, traj: ReconstructedTrajectory) -> TrajectoryEvaluation:
        stability = self._compute_stability(traj)
        coherence = self._compute_coherence(traj)
        
        duration = self._duration(traj)
        engagement = self._compute_engagement(traj, duration)

        classification = self._classify(
            traj,
            stability,
            coherence,
            engagement
        )

        return TrajectoryEvaluation(
            trajectory_id=traj.id,
            message_count=len(traj.messages),
            duration_seconds=duration,
            stability_score=stability,
            coherence_score=coherence,
            engagement_score=engagement,
            interruption_count=len(traj.interruptions),
            reattachment_count=len(traj.reattachments),
            final_state=traj.state,
            classification=classification
        )

    def _duration(self, traj: ReconstructedTrajectory) -> float:
        if not traj.messages:
            return 0.0
            
        first_msg = self.graph.messages.get(traj.messages[0])
        last_msg = self.graph.messages.get(traj.messages[-1])
        
        if not first_msg or not last_msg:
            return 0.0
            
        t1_attr = getattr(first_msg, 'timestamp', None)
        t2_attr = getattr(last_msg, 'timestamp', None)
        
        t1_str = t1_attr.value if hasattr(t1_attr, 'value') else t1_attr
        t2_str = t2_attr.value if hasattr(t2_attr, 'value') else t2_attr
        
        if not t1_str or not t2_str:
            return 0.0
            
        try:
            # Replace 'Z' with +00:00 for strict ISO parser compatibility loosely. 
            t1 = datetime.fromisoformat(t1_str.replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(t2_str.replace("Z", "+00:00"))
            return max(0.0, (t2 - t1).total_seconds())
        except ValueError:
            return 0.0

    def _compute_stability(self, traj: ReconstructedTrajectory) -> float:
        base = 0.5
        if traj.state == "stable":
            base += 0.2
            
        base += len(traj.reattachments) * 0.1
        
        # Penalyze abandoned interrupts 
        abandoned_interruptions = max(0, len(traj.interruptions) - len(traj.reattachments))
        base -= abandoned_interruptions * 0.1
        
        return max(0.0, min(1.0, base))

    def _compute_coherence(self, traj: ReconstructedTrajectory) -> float:
        total = len(traj.messages) + len(traj.interruptions)
        if total == 0:
            return 0.0
        return max(0.0, min(1.0, len(traj.messages) / total))

    def _compute_engagement(self, traj: ReconstructedTrajectory, duration: float) -> float:
        """Structural engagement prioritizing length + bidirectional flow over time scaling directly."""
        score = len(traj.messages) * 0.1
        score += len(traj.reattachments) * 0.05
        
        # Apply gentle modifier if duration exists 
        if duration > 0:
            score *= min(1.5, max(1.0, math.log10(duration + 1) / 2))
            
        return max(0.0, min(1.0, score))

    def _classify(self, traj: ReconstructedTrajectory, stability: float, coherence: float, engagement: float) -> str:
        if traj.state == "stable":
            return "RESOLVED"
        elif len(traj.interruptions) > 0 and len(traj.reattachments) == 0:
            return "ABANDONED"
        elif len(traj.messages) >= 6:
            return "WORKING_THREAD"
        else:
            return "EXPLORATION"
