from graph_models import ConversationGraph, Observation

class ConflictDetector:
    """Phase 4.9: Scans reconstructed explicit constraints strictly testing limits safely explicitly emitting diagnostic ! boundaries natively."""
    def __init__(self, graph: ConversationGraph):
        self.graph = graph
        self.obs_counter = getattr(self.graph, "_conflict_counter", 1)

    def detect_conflicts(self) -> ConversationGraph:
        """Emits conflict observances bounding limits across explicit mapped limits natively avoiding node creation implicitly."""
        # Find if any ConstraintNode is OPEN
        open_constraints = [c for c in self.graph.constraints.values() if c.state == "OPEN"]
        if open_constraints:
            for c in open_constraints:
                obs = Observation(
                    id=f"conflict_{self.obs_counter}",
                    source_trajectory_id="system",
                    scope_id="global",
                    content=c.id,
                    polarity="contradicting",
                    confidence=1.0,
                    type="CONSTRAINT_VIOLATION_SIGNAL" 
                )
                # Technically ! represents inconsistency amongst representations checking implicitly.
                self.graph.observations[obs.id] = obs
                self.obs_counter += 1
                
        self.graph._conflict_counter = self.obs_counter
        return self.graph
