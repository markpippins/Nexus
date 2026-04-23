from graph_models import ConversationGraph, InteractionArchetype

class InteractionClassifier:
    """Phase 6b: Deterministic post-execution Diff Annotator locking execution footprint schemas over mapped parameters."""
    
    def __init__(self, graph: ConversationGraph):
        self.graph = graph

    def classify_diffs(self) -> ConversationGraph:
        """Determines interaction subsets parsing native envelope boundaries completely decoupling execution logic."""
        
        for traj in self.graph.reconstructed_trajectories.values():
            for env in traj.event_envelopes:
                archetypes = set()
                
                # Execution happens mathematically across all explicit states tracking snapshot bounds natively
                archetypes.add(InteractionArchetype.EXECUTION)

                if env.added_nodes:
                    archetypes.add(InteractionArchetype.CONSTRUCTION)

                if env.modified_nodes:
                    archetypes.add(InteractionArchetype.REVISION)

                if env.emitted_edges:
                    archetypes.add(InteractionArchetype.RECONCILIATION)
                    
                if env.emitted_observations or env.emitted_questions:
                    archetypes.add(InteractionArchetype.REFLECTION)

                # Assign back safely validating constraints
                env.archetypes = archetypes
                
        return self.graph
