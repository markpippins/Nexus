from typing import List, Dict, Any
from graph_models import IR_EventEnvelope, ReconstructedClosureSet, MaterializedReplayView

class EnvelopeInterpreter_V1:
    """Pure interpretation logic defining schema_v1 execution footprint natively safely decoupled."""
    
    def interpret(self, envelopes: List[IR_EventEnvelope]) -> Dict[str, ReconstructedClosureSet]:
        closures: Dict[str, ReconstructedClosureSet] = {}
        
        for env in envelopes:
            if env.schema_version != "v1":
                continue # Allows skipping versions for complex fallback routing
            
            # Retrieve or initialize Trajectory mapping constraints
            if env.trajectory_id not in closures:
                closures[env.trajectory_id] = ReconstructedClosureSet(trajectory_id=env.trajectory_id)
                
            closure = closures[env.trajectory_id]
            
            # Reduce Additions
            for node in env.added_nodes:
                closure.resolved_concepts.add(node)
                
            # Reduce Removals (Overriding logic deterministically mapping exactly)
            for node in env.removed_nodes:
                if node in closure.resolved_concepts:
                    closure.resolved_concepts.remove(node)
                    
            # Set Emitted Edges limits accumulating explicit relationships
            for edge in env.emitted_edges:
                closure.resolves_edges.append(edge)
                
            # Reduce Emitted Constraints
            for constraint in env.emitted_constraints:
                closure.constraints.append(constraint)
                
            # Logic ignores Questions, Observations, PartialResolutions matching Epistemic boundaries securely.

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
    def __init__(self, registry: SchemaRegistry = None):
        self.registry = registry or SchemaRegistry()
        
    def replay(self, run_id: str, target_schema: str, event_stream: List[IR_EventEnvelope]) -> MaterializedReplayView:
        # Sort explicitly enforcing TOC-1 Total Order Boundaries explicitly mapping structurally safely
        sorted_stream = sorted(event_stream, key=lambda e: (e.trajectory_id, e.timestep_sequence))
        
        interpreter = self.registry.get_interpreter(target_schema)
        closures = interpreter.interpret(sorted_stream)
        
        return MaterializedReplayView(
            run_id=run_id,
            schema_version=target_schema,
            closures=closures
        )
