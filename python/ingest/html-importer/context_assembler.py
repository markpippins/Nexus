from typing import Tuple
from workspace import Workspace, WorkingSet, ConflictSet

class ContextAssembler:
    """Phase 6a: Compression interaction executing decoupled projections scaling Execution versus Belief logic natively."""
    
    def __init__(self, workspace: Workspace):
        self.workspace = workspace

    def assemble(self) -> Tuple[WorkingSet, ConflictSet]:
        """Calculates isolated boundaries maintaining structural invariance natively mapping outputs without overlapping parameters."""
        
        working_set = WorkingSet(workspace_id=self.workspace.id)
        conflict_set = ConflictSet(workspace_id=self.workspace.id)
        
        for graph_id, graph in self.workspace.conversations.items():
            
            # 1. Project WorkingSet -> SemanticProjection (Deterministic Execution Substrate)
            # Consume semantic projection (replaces closure-based replay)
            if graph.semantic_results:
                latest_run_id = list(graph.semantic_results.keys())[-1]
                semantic_result = graph.semantic_results[latest_run_id]
                projection = semantic_result.semantic_projection
                working_set.resolved_concepts.update(projection.resolved_concepts)
                working_set.resolves_edges.extend(projection.resolves_edges)
                    
            # 2. Project ConflictSet -> Observations and Questions Only (Epistemic Reasoning Substrate)
            for obs in graph.observations.values():
                conflict_set.observations.append(obs)
                if obs.content.relation == "CONTRADICTS":
                   conflict_set.contradicted_concepts.update(obs.content.concept_ids)
            
            for q in graph.questions.values():
                if q.status != "RESOLVED":
                    conflict_set.unresolved_questions.append(q.id)

        return working_set, conflict_set
