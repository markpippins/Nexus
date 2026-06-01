from typing import List, Dict, Any
from graph_models import IR_EventEnvelope, ReconstructedClosureSet, SemanticReplayResult
from transition_synthesizer import TransitionSynthesizer
from execution_gate import ExecutionEligibilityGate
from semantic_projection import SemanticProjectionBuilder
from constraint_view import ConstraintExtractor

class EnvelopeInterpreter_V1:
    """Pure interpretation logic defining schema_v1 execution footprint natively safely decoupled."""
    
    def interpret(self, envelopes: List[IR_EventEnvelope]) -> Dict[str, ReconstructedClosureSet]:
        closures: Dict[str, ReconstructedClosureSet] = {}
        
        for env in envelopes:
            if env.schema_version != "v1":
                continue 
            
            if env.trajectory_id not in closures:
                closures[env.trajectory_id] = ReconstructedClosureSet(trajectory_id=env.trajectory_id)
                
            closure = closures[env.trajectory_id]
            
            for node in env.added_nodes:
                closure.resolved_concepts.add(node)
                
            for node in env.removed_nodes:
                if node in closure.resolved_concepts:
                    closure.resolved_concepts.remove(node)
                    
            for edge in env.emitted_edges:
                closure.resolves_edges.append(edge)
                
            for constraint in env.emitted_constraints:
                closure.constraints.append(constraint)

        return closures

class SchemaRegistry:
    def __init__(self):
        self.interpreters = {
            "v1": EnvelopeInterpreter_V1()
        }
        
    def get_interpreter(self, schema_version: str):
        if schema_version not in self.interpreters:
             raise KeyError(f"No configured interpreter matches defined boundary {schema_version}")
        return self.interpreters[schema_version]

class ReplayEngine:
    """Orchestrates Chronological Kernel loops cleanly natively efficiently."""
    def __init__(self, registry: SchemaRegistry = None):
        self.registry = registry or SchemaRegistry()
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
