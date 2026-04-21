from typing import List
from graph_models import MaterializedReplayView, IR_EventEnvelope
from dataclasses import dataclass

@dataclass
class ExecutionDecision:
    authorized: bool
    status: str 
    reasoning: List[str]

class ExecutionEligibilityGate:
    """LAYER C: Policy evaluation bounding Final Mile strictly filtering cleanly extracting structure explicitly preventing semantic execution assumptions securely."""

    def evaluate(self, view: MaterializedReplayView, envelopes: List[IR_EventEnvelope], environment: str) -> ExecutionDecision:
        reasons = []
        has_delegated_request = False
        has_hypothetical_frame = False
        
        # Determine strict schema support
        for env in envelopes:
            if env.schema_version not in ["v1"]:
                return ExecutionDecision(False, "ROUTE_TO_SANDBOX", ["Unrecognized schema_version fallback triggered safely."])
                
            # Iterate semantic metadata limits
            for label in env.semantic_labels:
                if label.archetype == "DELEGATED_REQUEST" and label.confidence > 0.8:
                    has_delegated_request = True
                if label.archetype == "HYPOTHETICAL_FRAME":
                    has_hypothetical_frame = True
                    
        # RULE 4: Hypothetical Frame Exclusion
        if has_hypothetical_frame:
            return ExecutionDecision(False, "REJECT_EXECUTION", ["Explicitly blocking execution derived from imagined / what-if simulations securely."])
            
        # RULE 1: Delegated Request Validation
        if not has_delegated_request:
            return ExecutionDecision(False, "REJECT_EXECUTION", ["Missing valid 'Delegated Request' semantic archetype authorization securely."])
            
        # RULE 2: No Unresolved Critical Constraints
        critical_types = ["LEGAL", "SAFETY", "SYSTEM POLICY"]
        has_unresolved_critical = False
        for closure in view.closures.values():
            for c in closure.constraints:
                if c.state == "OPEN" and c.constraint_type in critical_types:
                    has_unresolved_critical = True
                    reasons.append(f"Critical Constraint {c.id} of type {c.constraint_type} explicitly blocks execution sequences securely.")
                    
        if has_unresolved_critical:
             return ExecutionDecision(False, "ROUTE_TO_SANDBOX", reasons)
             
        # RULE 3: Environment Binding Required
        if environment not in ["production", "sandbox", "staging"]:
            environment = "sandbox" # Default sandbox isolation securely
            
        if environment != "production":
             # Even if technically safe, environments natively gate outputs safely
             return ExecutionDecision(True, "ROUTE_TO_SANDBOX", ["Sandbox or staging limits effectively routed securely."])
            
        return ExecutionDecision(True, "APPROVE_EXECUTION", ["All constraints mathematically satisfied correctly safely."])
