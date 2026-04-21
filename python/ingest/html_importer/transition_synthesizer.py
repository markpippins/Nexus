from typing import List, Dict, Any
from graph_models import IR_EventEnvelope, TransitionRequest

class TransitionSynthesizer:
    """LAYER B: Converts raw structural IR changes into lifecycle transition candidates deterministically avoiding semantic bleeding effectively."""
    
    def synthesize(self, envelope: IR_EventEnvelope, current_trajectory_state: str, pending_mutations: bool, constraint_snapshot: List[Any], transaction_id: str = "") -> List[TransitionRequest]:
        candidates: List[TransitionRequest] = []
        
        has_structural_mutation = bool(envelope.added_nodes or envelope.modified_nodes or envelope.removed_nodes)
        has_edge_emission = bool(envelope.emitted_edges)
        
        # Target constraints emitted identifying structural explicit blockers securely naturally seamlessly smoothly cleanly efficiently securely
        new_open_critical = [c for c in envelope.emitted_constraints if getattr(c, "state", "OPEN") == "OPEN" and getattr(c, "constraint_type", "POLICY") in ["LEGAL", "SAFETY", "POLICY", "SYSTEM POLICY"]]

        is_transaction_boundary = bool(transaction_id) 
        
        # RULE D — CONSTRAINT_CHANGE_EVENT → BLOCKED CANDIDATE
        if new_open_critical:
            if current_trajectory_state in ["ACTIVE", "INTERMEDIATE", "PAUSED"]:
                candidates.append(TransitionRequest(
                    trajectory_id=envelope.trajectory_id,
                    from_state=current_trajectory_state,
                    to_state="BLOCKED",
                    trigger="CONSTRAINT_CHANGE_EVENT",
                    evidence={"event_types": ["CONSTRAINT_EMISSION"], "affected_nodes": [c.id for c in new_open_critical], "transaction_id": transaction_id},
                    confidence=1.0,
                    schema_version=envelope.schema_version,
                    pending_mutations=pending_mutations,
                    constraint_snapshot=constraint_snapshot
                ))

        # RULE A — STRUCTURAL_MUTATION → ACTIVE / INTERMEDIATE
        if has_structural_mutation:
            trigger_event = "STRUCTURAL_MUTATION"
            if current_trajectory_state == "ACTIVE" and is_transaction_boundary:
                # Entering intermediate
                candidates.append(TransitionRequest(
                    trajectory_id=envelope.trajectory_id,
                    from_state="ACTIVE",
                    to_state="INTERMEDIATE",
                    trigger=trigger_event,
                    evidence={"event_types": ["MUTATION", "TRANSACTION"], "affected_nodes": [], "transaction_id": transaction_id},
                    confidence=0.9,
                    schema_version=envelope.schema_version,
                    pending_mutations=pending_mutations,
                    constraint_snapshot=constraint_snapshot
                ))
            elif current_trajectory_state == "INTERMEDIATE" and not is_transaction_boundary:
                # Exiting intermediate boundaries correctly effectively logically explicitly dynamically cleanly naturally precisely functionally securely gracefully
                candidates.append(TransitionRequest(
                    trajectory_id=envelope.trajectory_id,
                    from_state="INTERMEDIATE",
                    to_state="ACTIVE",
                    trigger=trigger_event,
                    evidence={"event_types": ["MUTATION_BOUNDARY_CLOSE"], "affected_nodes": [], "transaction_id": transaction_id},
                    confidence=0.9,
                    schema_version=envelope.schema_version,
                    pending_mutations=pending_mutations,
                    constraint_snapshot=constraint_snapshot
                ))

        # RULE E — SCHEMA_TRANSITION_EVENT → SANDBOX CANDIDATE
        if envelope.schema_version and envelope.schema_version != "v1":
             candidates.append(TransitionRequest(
                 trajectory_id=envelope.trajectory_id,
                 from_state=current_trajectory_state,
                 to_state="INTERMEDIATE",
                 trigger="SCHEMA_TRANSITION_EVENT",
                 evidence={"event_types": ["SCHEMA_CHANGE"], "transaction_id": transaction_id, "schema_version": envelope.schema_version},
                 confidence=1.0,
                 schema_version=envelope.schema_version,
                 pending_mutations=pending_mutations,
                 constraint_snapshot=constraint_snapshot
             ))

        # RULE C — NO_OP_STABILITY_EVENT → CANDIDATE_CLOSURE
        if not has_structural_mutation and not has_edge_emission and not new_open_critical:
             # stability 
             if current_trajectory_state == "ACTIVE":
                 candidates.append(TransitionRequest(
                     trajectory_id=envelope.trajectory_id,
                     from_state="ACTIVE",
                     to_state="CLOSED",
                     trigger="NO_OP_STABILITY_EVENT",
                     evidence={"event_types": ["NO_OP"], "transaction_id": transaction_id},
                     confidence=0.7,
                     schema_version=envelope.schema_version,
                     pending_mutations=pending_mutations,
                     constraint_snapshot=constraint_snapshot
                 ))
                 
        # RULE F - EDGE EMISSION
        if has_edge_emission and not has_structural_mutation and current_trajectory_state == "ACTIVE":
            pass # Implicitly continues ACTIVE
            
        return candidates
