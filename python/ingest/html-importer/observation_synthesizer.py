from graph_models import ConversationGraph, Observation, ObservationContent

class ObservationSynthesizer:
    """Phase 6: Emits and Consolidates Non-executable epistemic Observations over deterministically parsed IR_Diff boundaries."""
    
    def __init__(self, graph: ConversationGraph):
        self.graph = graph
        self.obs_counter = 1

    def evaluate_diffs(self) -> ConversationGraph:
        """Step A: Observation Emission purely via Structural Transitions."""
        
        for traj in self.graph.reconstructed_trajectories.values():
            for diff in traj.event_envelopes:
                
                # Extract Additions -> SUPPORTS
                if diff.added_nodes:
                    scope = self._derive_majority_scope(diff.added_nodes)
                    self._emit(traj.id, scope, diff.added_nodes, "SUPPORTS", diff.timestep_msg_id, diff)
                
                # Extract Modifications -> REFINES
                if diff.modified_nodes:
                    scope = self._derive_majority_scope(diff.modified_nodes)
                    self._emit(traj.id, scope, diff.modified_nodes, "REFINES", diff.timestep_msg_id, diff)
                    
                # Extract Reintroductions -> REINTRODUCES
                if diff.reintroduced_nodes:
                    scope = self._derive_majority_scope(diff.reintroduced_nodes)
                    self._emit(traj.id, scope, diff.reintroduced_nodes, "REINTRODUCES", diff.timestep_msg_id, diff)
                    
                # Extract Removals -> CONTRADICTS
                if diff.removed_nodes:
                    scope = self._derive_majority_scope(diff.removed_nodes)
                    self._emit(traj.id, scope, diff.removed_nodes, "CONTRADICTS", diff.timestep_msg_id, diff)

        # Step B: Compute Polarity natively looking up structural consensus explicitly
        self._compute_polarities()
        
        # Step B.5: Emit deterministic Epistemic Observances from native unresolved IR bounds
        for q in self.graph.questions.values():
            if q.status != "RESOLVED":
                obs = Observation(
                    id=f"obs_{self.obs_counter}",
                    type="UNRESOLVED_QUERY",
                    source_trajectory_id=q.source_trajectory_id or "none",
                    scope_id=q.scope_id,
                    content=q.id,
                    polarity="neutral",
                    confidence=1.0
                )
                self.graph.observations[obs.id] = obs
                self.obs_counter += 1
                
                if q.source_trajectory_id and q.source_trajectory_id in self.graph.reconstructed_trajectories:
                    traj = self.graph.reconstructed_trajectories[q.source_trajectory_id]
                    if traj.event_envelopes:
                        traj.event_envelopes[-1].emitted_questions.append(obs)
                
        return self.graph

    def _derive_majority_scope(self, concept_ids: list[str]) -> str:
        """Extract primary scope reference protecting the graph boundary."""
        if not concept_ids:
            return self.graph.id
        # Simplification: use the scope of the first targeted concept, mapping exactly to trajectory logic boundaries
        c = self.graph.concepts.get(concept_ids[0])
        return c.scope_id if c and c.scope_id else self.graph.id

    def _emit(self, traj_id: str, scope_id: str, cids: list[str], relation: str, msg_id: str, diff):
        obs = Observation(
            id=f"obs_{self.obs_counter}",
            source_trajectory_id=traj_id,
            scope_id=scope_id,
            content=ObservationContent(
                concept_ids=cids.copy(),
                relation=relation,
                evidence_pointer=msg_id
            ),
            polarity="neutral", # defaults until Step B sync
            confidence=0.8 # Fixed base scalar mapping deterministic diff extraction
        )
        self.graph.observations[obs.id] = obs
        self.obs_counter += 1
        if diff:
            diff.emitted_observations.append(obs)

    def _compute_polarities(self):
        """Cross-diff analysis assigning 'supporting' or 'contradicting' matching isolated logic checks."""
        for obs in self.graph.observations.values():
            if obs.content.relation == "SUPPORTS" or obs.content.relation == "REINTRODUCES":
                obs.polarity = "supporting"
            elif obs.content.relation == "CONTRADICTS":
                obs.polarity = "contradicting"
            else:
                obs.polarity = "neutral"
