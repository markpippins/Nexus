from typing import Dict, List
from graph_models import IR_EventEnvelope, SemanticReplayResult
from transition_synthesizer import TransitionSynthesizer
from execution_gate import ExecutionEligibilityGate
from semantic_projection import SemanticProjectionBuilder
from constraint_view import ConstraintExtractor

# NOTE: EnvelopeInterpreter_V1 removed in Phase 3 cleanup.
# Only projection-based trajectory interpretation is retained.

class ReplayEngine:
    """Orchestrates Chronological Kernel loops cleanly natively efficiently."""
    def __init__(self):
        self.synthesizer = TransitionSynthesizer()
        self.gate = ExecutionEligibilityGate()
        
    def replay(self, run_id: str, target_schema: str, event_stream: List[IR_EventEnvelope]) -> SemanticReplayResult:
        sorted_stream = sorted(event_stream, key=lambda e: (e.trajectory_id, e.timestep_sequence))
        
        trajectory_states: Dict[str, str] = {}
        
        # Sequentially map Explicit Transition Architectures natively seamlessly logically dynamically
        for env in sorted_stream:
            tid = env.trajectory_id
            if tid not in trajectory_states:
                trajectory_states[tid] = "ACTIVE"
                
            # Step 1: Synthesize transitions deterministically cleanly mapped!
            proposals = self.synthesizer.synthesize(
                envelope=env,
                current_trajectory_state=trajectory_states[tid],
                pending_mutations=False, # Handled explicitly organically mapped internally smoothly.
                constraint_snapshot=ConstraintExtractor.from_stream(sorted_stream, tid),
                transaction_id=getattr(env, "transaction_id", "")
            )
            
            # Step 2: Layer C strictly determines transition eligibility mathematically securely!
            for req in proposals:
                decision = self.gate.evaluate_transition(request=req, environment="production")
                
                # Step 3: FSM structurally effectively gracefully sequentially mutates precisely correctly!
                if decision.status == "APPROVE_EXECUTION":
                    trajectory_states[tid] = req.to_state
        
        projection = SemanticProjectionBuilder.from_envelopes(sorted_stream)
        return SemanticReplayResult(
            run_id=run_id,
            schema_version=target_schema,
            semantic_projection=projection,
            trajectory_states=trajectory_states
        )
