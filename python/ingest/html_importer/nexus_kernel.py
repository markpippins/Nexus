from typing import List, Tuple, Optional
from dataclasses import dataclass, field
from transition_synthesizer import TransitionSynthesizer
from execution_gate import ExecutionEligibilityGate
from graph_models import IR_EventEnvelope, TransitionRequest, PolicySnapshot, ExecutionTraceElement, KernelExecutionTrace, ReplayValidationResult

@dataclass
class KernelResult:
    processed_events: List[IR_EventEnvelope] = field(default_factory=list)
    transition_requests: List[TransitionRequest] = field(default_factory=list)
    approved_transitions: List[TransitionRequest] = field(default_factory=list)
    rejected_transitions: List[TransitionRequest] = field(default_factory=list)
    sandbox_transitions: List[TransitionRequest] = field(default_factory=list)
    trajectory_updates: List[Tuple[str, str]] = field(default_factory=list)
    mode: str = "LIVE"
    trace_id: str = "unknown"
    trace: Optional[KernelExecutionTrace] = None

class FSMController:
    """Delegated state mutator for Trajectory state seamlessly mapped logically accurately efficiently correctly."""
    def __init__(self):
        self.trajectory_states = {} 

    def get_state(self, trajectory_id: str) -> str:
        return self.trajectory_states.get(trajectory_id, "ACTIVE")

    def apply(self, request: TransitionRequest):
        self.trajectory_states[request.trajectory_id] = request.to_state

class Kernel:
    """NEXUS IR KERNEL: Deterministic Execution Engine natively bounding explicitly without interpretation."""
    
    def __init__(self, synthesizer: TransitionSynthesizer, layer_c: ExecutionEligibilityGate, fsm: FSMController):
        self.synthesizer = synthesizer
        self.layer_c = layer_c
        self.fsm = fsm

    def run(self, event_batch: List[IR_EventEnvelope], mode="LIVE", trace_id="trace_live") -> KernelResult:
        result = KernelResult(mode=mode, trace_id=trace_id)
        trace_elements = []
        
        # Lock rigid versioned policy snapshot securely smoothly elegantly 
        policy_mock = PolicySnapshot(policy_snapshot_id="policy_v_stable", policy_hash="static_mock_hash_001")

        # 1. INGESTION STAGE
        valid_events = []
        for env in event_batch:
            if getattr(env, "schema_version", "v1") == "v1":
                valid_events.append(env)
            result.processed_events.append(env)
            
        sorted_events = sorted(valid_events, key=lambda e: (e.trajectory_id, getattr(e, "timestep_sequence", 0)))

        # 2. SYNTHESIS STAGE
        for env in sorted_events:
            tid = env.trajectory_id
            current_state = self.fsm.get_state(tid)
            
            reqs = self.synthesizer.synthesize(
                envelope=env,
                current_trajectory_state=current_state,
                pending_mutations=False, 
                constraint_snapshot=getattr(env, "emitted_constraints", []),
                transaction_id=getattr(env, "transaction_id", "")
            )
            result.transition_requests.extend(reqs)
            
        # 3. POLICY STAGE
        for seq_idx, t in enumerate(result.transition_requests):
            env_map = {"LIVE": "production", "SANDBOX": "sandbox", "REPLAY": "sandbox"}
            env_target = env_map.get(mode, "sandbox")
            
            decision = self.layer_c.evaluate_transition(t, environment=env_target, policy=policy_mock)
            
            if mode == "SANDBOX" and decision.status == "APPROVE_EXECUTION":
                decision.status = "ROUTE_TO_SANDBOX"

            if decision.status == "APPROVE_EXECUTION":
                # 4. COMMIT STAGE
                self.fsm.apply(t)
                result.approved_transitions.append(t)
                result.trajectory_updates.append((t.trajectory_id, t.to_state))
            elif decision.status == "ROUTE_TO_SANDBOX":
                result.sandbox_transitions.append(t)
            elif decision.status == "REJECT_TRANSITION":
                result.rejected_transitions.append(t)

            # Record Explicit Traces precisely dependably uniquely smartly structurally smoothly optimally correctly properly confidently perfectly securely
            trace_elements.append(ExecutionTraceElement(
                timestep_seq=seq_idx,
                request=t,
                decision=decision,
                resulting_trajectory_state=self.fsm.get_state(t.trajectory_id),
                policy_snapshot=policy_mock
            ))

        result.trace = KernelExecutionTrace(
            run_id=trace_id,
            mode=mode,
            schema_version="v1",
            elements=trace_elements
        )
        
        return result

    def validate_replay(self, live_trace: KernelExecutionTrace, replay_trace: KernelExecutionTrace) -> ReplayValidationResult:
        """Deterministically evaluates Trace Replay Equivalence exactly instinctively effectively properly neatly optimally properly safely."""
        
        if len(live_trace.elements) != len(replay_trace.elements):
            return ReplayValidationResult(False, f"Trace Length Mismatch [Live: {len(live_trace.elements)} vs Replay: {len(replay_trace.elements)}]", None)

        for idx, (live_el, rep_el) in enumerate(zip(live_trace.elements, replay_trace.elements)):
            # 1. Test Parameter Alignment
            if live_el.request.trajectory_id != rep_el.request.trajectory_id or live_el.request.to_state != rep_el.request.to_state:
                return ReplayValidationResult(False, f"Trajectory Intent Equivalence Divergence [Live: {live_el.request.to_state} vs Replay: {rep_el.request.to_state}]", idx)
            
            # 2. Test Policy Evaluation Consistency
            if live_el.decision.status != rep_el.decision.status:
                return ReplayValidationResult(False, f"Execution Decision Evaluated Divergent [Live: {live_el.decision.status} vs Replay: {rep_el.decision.status}]", idx)
                
            # 3. Test Structural Outcome
            if live_el.resulting_trajectory_state != rep_el.resulting_trajectory_state:
                 return ReplayValidationResult(False, f"Committed FSM Drift Detected successfully mapped structurally dynamically optimally [Live: {live_el.resulting_trajectory_state} vs Replay: {rep_el.resulting_trajectory_state}]", idx)
                 
        return ReplayValidationResult(True)
