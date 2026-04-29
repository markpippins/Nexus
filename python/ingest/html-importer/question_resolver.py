from graph_models import ConversationGraph, PartialResolution, Relationship

class QuestionResolver:
    """Phase 4.7: Formally resolves QuestionNodes mapping deterministically generated mathematical subgraphs identifying native constraints."""

    def __init__(self, graph: ConversationGraph):
        self.graph = graph

    def resolve(self) -> ConversationGraph:
        """Determines logic matching evaluating explicitly native predicate bounds without NLP interpretations."""
        
        for q_id, q in self.graph.questions.items():
            P = set(q.binding.required_concept_ids)
            best_S = set()
            best_traj = None
            
            for traj in self.graph.reconstructed_trajectories.values():
                if traj.state == "stable":
                    # ClosureSet(T) maps to concepts inside STABLE trajectories
                    CLOSURE_SET = set(traj.concepts_active)
                    S = P.intersection(CLOSURE_SET)
                    
                    if len(S) > len(best_S):
                        best_S = S
                        best_traj = traj

            if not P:
                q.status = "OPEN"
                continue

            if best_S == P:
                q.status = "RESOLVED"
                # Structurally enforce resolution natively generating RESOLVES
                root_cid = list(P)[0]
                edge = Relationship(
                    source_id=q_id,
                    target_id=root_cid,
                    relation_type="RESOLVES",
                    confidence=1.0
                )
                self.graph.relationships.append(edge)
                
                if best_traj.event_envelopes:
                    best_traj.event_envelopes[-1].emitted_edges.append(edge)
                    
            elif best_S:
                q.status = "PARTIALLY_RESOLVED"
                # Store partial structures identifying incomplete subsets isolating missing logic
                pr = PartialResolution(
                    question_id=q_id,
                    satisfied_predicates=list(best_S),
                    missing_predicates=list(P.difference(best_S)),
                    candidate_subgraph_roots=list(best_S)
                )
                self.graph.artifacts[f"pr_{q_id}"] = pr
                if best_traj.event_envelopes:
                    best_traj.event_envelopes[-1].partial_resolutions.append(pr)
            else:
                q.status = "OPEN"

        return self.graph
