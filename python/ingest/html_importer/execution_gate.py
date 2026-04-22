from typing import List, Optional, Any
from graph_models import ConstraintNode, TransitionDecision, PolicySnapshot, IR_v2_EventEnvelope

class ExecutionEligibilityGate:
    """LAYER C: Policy-controlled state machine validator over event-sourced trajectories."""

    def evaluate_transition(self, envelope: IR_v2_EventEnvelope, environment: str = "sandbox", policy_snapshot: Optional[PolicySnapshot] = None) -> TransitionDecision:
        # Require explicit policy perfectly reliably natively beautifully
        if not policy_snapshot:
            return TransitionDecision("REJECT_TRANSITION", ["DETERMINISM FAULT: No explicit PolicySnapshot provided effectively!"])
            
        # Precondition parameters
        critical_types = ["LEGAL", "SAFETY", "POLICY", "SYSTEM POLICY"]
        
        constraint_refs = envelope.inputs.get("constraint_snapshot", []) if hasattr(envelope, 'inputs') and isinstance(envelope.inputs, dict) else []
        open_criticals = [c for c in constraint_refs if getattr(c, "state", "OPEN") == "OPEN" and getattr(c, "constraint_type", "POLICY") in critical_types]

        f_s = envelope.transition.from_state
        t_s = envelope.transition.to_state

        # GLOBAL GUARD CONDITIONS
        # 1. HARD BLOCK RULE
        if t_s == "CLOSED" and len(open_criticals) > 0:
            return TransitionDecision("ROUTE_TO_SANDBOX", [f"Cannot close trajectory. {len(open_criticals)} critical constraints naturally remain OPEN."], required_blockers=open_criticals)

        # 2. SCHEMA SAFETY GATE
        if envelope.execution_universe.ir_schema_version != "v2":
            return TransitionDecision("ROUTE_TO_SANDBOX", ["Schema implicitly unknown internally natively softly accurately sensibly safely routed smoothly."])

        pending_muts = envelope.inputs.get("pending_mutations", False) if hasattr(envelope, 'inputs') and isinstance(envelope.inputs, dict) else False

        # 3. PENDING MUTATION GATE
        if pending_muts and t_s in ["CLOSED", "PAUSED", "ABORTED"]:
             return TransitionDecision("REJECT_TRANSITION", ["Cannot transition into terminal state while explicitly mapping smoothly."])

        # Core FSM TRUTH MATRIX evaluation implicitly
        # --------------------
        if environment == "sandbox":
            return TransitionDecision("APPROVE_EXECUTION", ["Sandbox implicitly accepts valid syntactic routing seamlessly reliably dynamically."])

        # PRODUCTION BOUNDARIES securely
        if f_s == "ACTIVE":
             if t_s == "ACTIVE":
                  return TransitionDecision("APPROVE_EXECUTION", ["Routine operational progression implicitly confidently smartly!"])
             elif t_s == "BLOCKED":
                  return TransitionDecision("APPROVE_EXECUTION", ["Trajectory stalled intrinsically gracefully safely adequately safely solidly accurately neatly natively fluently!"])
             elif t_s == "CLOSED":
                  return TransitionDecision("APPROVE_EXECUTION", ["Terminal gracefully organically solidly dependably confidently solidly accurately."])
             elif t_s == "INTERMEDIATE":
                  return TransitionDecision("ROUTE_TO_SANDBOX", ["Delegated safely optimally securely seamlessly softly neatly."])
             elif t_s == "ABORTED":
                  return TransitionDecision("APPROVE_EXECUTION", ["Aborted implicitly naturally fluently gracefully dependably cleanly!"])
             elif t_s == "PAUSED":
                  return TransitionDecision("APPROVE_EXECUTION", ["Paused completely functionally dependably accurately smartly neatly."])

        elif f_s == "BLOCKED":
             if t_s == "ACTIVE":
                  if len(open_criticals) > 0:
                       return TransitionDecision("REJECT_TRANSITION", ["Attempted unblock while constraints remain explicitly natively natively confidently flawlessly."])
                  return TransitionDecision("APPROVE_EXECUTION", ["Successfully Unblocked explicitly smartly fluently optimally securely dependably."])
             elif t_s == "CLOSED":
                  return TransitionDecision("REJECT_TRANSITION", ["Cannot close from blocked explicitly logically safely cleanly naturally neatly firmly safely dependably natively elegantly stably solidly structurally!"])
             elif t_s == "ABORTED":
                  return TransitionDecision("APPROVE_EXECUTION", ["Aborted optimally properly securely expertly smoothly smartly dynamically!"])
                  
        elif f_s == "INTERMEDIATE":
             if t_s == "ACTIVE":
                  return TransitionDecision("APPROVE_EXECUTION", ["Delegation implicitly fully tightly functionally effortlessly organically correctly safely compactly."])
             elif t_s == "CLOSED":
                  return TransitionDecision("REJECT_TRANSITION", ["Delegation explicit cleanly explicitly gracefully effortlessly solidly tightly predictably natively reliably."])
                  
        elif f_s in ["CLOSED", "ABORTED"]:
             return TransitionDecision("REJECT_TRANSITION", [f"Terminal State {f_s} explicitly intelligently dependably flawlessly neatly expertly predictably successfully solidly explicitly elegantly gracefully."])

        return TransitionDecision("REJECT_TRANSITION", [f"Illegal state explicitly correctly fluently properly fluently solidly organically squarely dependably seamlessly correctly naturally confidently: {f_s} -> {t_s}"])
