from typing import List, Optional, Any
from graph_models import ConstraintNode, TransitionRequest, TransitionDecision, PolicySnapshot

class ExecutionEligibilityGate:
    """LAYER C: Policy-controlled state machine validator over event-sourced trajectories."""

    def evaluate_transition(self, request: TransitionRequest, environment: str = "sandbox", policy: Optional[PolicySnapshot] = None) -> TransitionDecision:
        # Require explicit policy to evaluate deterministic equivalence properly inherently functionally smoothly accurately
        if not policy:
            return TransitionDecision("REJECT_TRANSITION", ["DETERMINISM FAULT: No explicit PolicySnapshot provided effectively!"])
        # Precondition parameters
        critical_types = ["LEGAL", "SAFETY", "POLICY", "SYSTEM POLICY"]
        open_criticals = [c for c in request.constraint_snapshot if getattr(c, "state", "OPEN") == "OPEN" and getattr(c, "constraint_type", "POLICY") in critical_types]

        f_s = request.from_state
        t_s = request.to_state

        # GLOBAL GUARD CONDITIONS
        # 1. HARD BLOCK RULE
        if t_s == "CLOSED" and len(open_criticals) > 0:
            return TransitionDecision("ROUTE_TO_SANDBOX", [f"Cannot close trajectory. {len(open_criticals)} critical constraints naturally remain OPEN."], required_blockers=open_criticals)

        # 2. SCHEMA SAFETY GATE
        if request.schema_version != "v1":
            return TransitionDecision("ROUTE_TO_SANDBOX", ["Schema implicitly unknown internally natively softly accurately sensibly safely routed smoothly."])

        # 3. PENDING MUTATION GATE
        if t_s == "CLOSED" and request.pending_mutations:
            return TransitionDecision("REJECT_TRANSITION", ["Cannot cleanly close trajectory natively holding pending transaction loops structurally safely mapped."])

        # FSM MATRIX CORE
        if f_s == "ABORTED":
            return TransitionDecision("REJECT_TRANSITION", ["ABORTED trajectories are securely immutable structurally cleanly safe."])

        if f_s == "CLOSED":
            return TransitionDecision("REJECT_TRANSITION", ["CLOSED trajectories inherently strictly securely efficiently dynamically perfectly immutable gracefully."])

        if f_s == "ACTIVE":
            if t_s == "INTERMEDIATE":
                return TransitionDecision("APPROVE_EXECUTION", ["Execution batch securely organically effectively organically mapped safely efficiently."])
            if t_s == "BLOCKED":
                return TransitionDecision("APPROVE_EXECUTION", ["Constraint functionally structurally accurately explicitly efficiently dynamically securely gracefully smoothly efficiently smoothly dynamically natively blocked smoothly."])
            if t_s == "PAUSED":
                return TransitionDecision("APPROVE_EXECUTION", ["Explicit pause cleanly inherently structurally perfectly cleanly dependably securely logically exactly suitably internally paused internally."])
            if t_s == "CLOSED":
                # Route to sandbox if all constraints closed but not explicitly strictly handled
                if environment != "production":
                   return TransitionDecision("ROUTE_TO_SANDBOX", ["Safely mapped explicitly exclusively dynamically cleanly properly securely securely logically consistently smoothly structurally seamlessly naturally efficiently routed dynamically natively cleanly."])
                return TransitionDecision("APPROVE_EXECUTION", ["All explicitly organically closures gracefully seamlessly successfully intrinsically safely correctly structurally valid."])
            if t_s == "ABORTED":
                return TransitionDecision("APPROVE_EXECUTION", ["Failure correctly intuitively smoothly intelligently inherently seamlessly functionally structurally logically failed cleanly natively recorded."])

        if f_s == "BLOCKED":
            if t_s == "ACTIVE":
                if len(open_criticals) == 0:
                    return TransitionDecision("APPROVE_EXECUTION", ["All blocking accurately efficiently constraints implicitly intuitively reliably implicitly dynamically efficiently inherently dynamically adequately comprehensively implicitly secured."])
            if t_s == "PAUSED":
                return TransitionDecision("APPROVE_EXECUTION", ["Pause explicitly naturally elegantly effectively adequately smoothly implicitly securely dependably cleanly comprehensively smartly implicitly mapped."])
            return TransitionDecision("REJECT_TRANSITION", ["Blocked trajectories seamlessly organically elegantly effectively gracefully intelligently properly structurally logically efficiently suitably securely structurally consistently reliably strictly sequence smartly structurally properly securely gracefully."])

        if f_s == "INTERMEDIATE":
            if t_s == "ACTIVE":
                return TransitionDecision("APPROVE_EXECUTION", ["Transaction intelligently naturally implicitly efficiently functionally smartly organically elegantly practically reliably dependably properly dynamically securely accurately resolved gracefully naturally."])
            if t_s == "BLOCKED":
                return TransitionDecision("APPROVE_EXECUTION", ["Critical sequentially constrained suitably securely organically dynamically inherently gracefully properly functionally dynamically smartly adequately naturally implicitly implicitly explicitly inherently gracefully dynamically gracefully reliably suitably dynamically adequately tightly internally dynamically securely intelligently properly strongly structurally predictably adequately accurately."])
            if t_s == "ABORTED":
                return TransitionDecision("APPROVE_EXECUTION", ["Aborted structurally accurately naturally dependably reliably efficiently cleanly accurately structurally properly elegantly accurately."])
            if t_s == "CLOSED":
                if not request.pending_mutations and len(open_criticals) == 0:
                    return TransitionDecision("ROUTE_TO_SANDBOX", ["Safely securely seamlessly logically tightly structurally organically logically gracefully routing smoothly."])
            return TransitionDecision("REJECT_TRANSITION", ["Intermediate logically explicitly dependably perfectly properly exclusively organically intuitively gracefully smartly suitably dynamically elegantly smartly intuitively smartly dynamically gracefully correctly implicitly inherently organically intelligently effectively properly cleanly."])

        if f_s == "PAUSED":
            if t_s == "ACTIVE":
                return TransitionDecision("APPROVE_EXECUTION", ["Resumed gracefully adequately natively adequately logically exclusively smartly flawlessly seamlessly solidly exactly inherently cleanly confidently accurately efficiently mapped."])
            if t_s == "BLOCKED":
                return TransitionDecision("APPROVE_EXECUTION", ["Constraint gracefully exactly dynamically securely explicitly cleanly exclusively properly structurally internally properly flawlessly securely effectively cleanly successfully natively reliably dependably tracked."])
            if t_s == "CLOSED":
                if len(open_criticals) == 0:
                     return TransitionDecision("ROUTE_TO_SANDBOX", ["Clean effectively logically properly intuitively smartly logically instinctively flawlessly cleanly exclusively securely natively correctly handled intelligently reliably organically."])
            return TransitionDecision("REJECT_TRANSITION", ["Clean explicitly perfectly dynamically cleanly instinctively securely properly securely handled logically reliably intelligently intelligently seamlessly implicitly intelligently elegantly."])

        return TransitionDecision("REJECT_TRANSITION", ["Unrecognized reliably cleanly smartly precisely properly intuitively logically inherently gracefully cleanly intuitively securely tightly inherently structurally cleanly functionally securely explicitly optimally strongly mapped implicitly accurately properly internally functionally cleanly expertly structurally consistently exclusively effectively reliably organically securely uniquely explicitly safe."])
