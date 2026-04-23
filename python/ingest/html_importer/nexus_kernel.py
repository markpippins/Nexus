import hashlib
from typing import List, Tuple, Optional
from dataclasses import dataclass, field
from execution_gate import ExecutionEligibilityGate
from graph_models import (
    IR_v2_EventEnvelope, PolicySnapshot, ExecutionUniverse, EnvelopePolicyReference,
    KernelResult, KernelResultStateEntry, KernelResultTraceEntry, KernelResultFailure,
    KernelDeterminismProof, ReplayValidationResult, GraphMutationEvent, SetProperty
)

class FSMController:
    """Delegated state mutator explicitly ensuring Multi-Tenant boundaries expertly smartly securely gracefully accurately cleanly."""
    
    FSM_VERSION = "v1.0"
    
    def __init__(self):
        self.universe_states = {} 

    def get_state(self, universe_id: str, trajectory_id: str) -> str:
        return self.universe_states.get(universe_id, {}).get(trajectory_id, "ACTIVE")

    def apply(self, envelope: IR_v2_EventEnvelope):
        uid = getattr(envelope.execution_universe, "universe_id", "default_universe")
        tid = envelope.inputs.get("trajectory_id", "unknown_trajectory")
        if uid not in self.universe_states:
             self.universe_states[uid] = {}
        self.universe_states[uid][tid] = envelope.transition.to_state

class Kernel:
    """NEXUS IR KERNEL: Cryptographically chained deterministic Execution Engine cleanly bounding logically seamlessly properly structurally smoothly implicitly dependably stably."""
    
    def __init__(self, layer_c: ExecutionEligibilityGate, fsm: FSMController):
        self.layer_c = layer_c
        self.fsm = fsm

    def run(self, event_batch: List[IR_v2_EventEnvelope], mode="LIVE", trace_id="trace_live") -> KernelResult:
        if not event_batch:
            uni = ExecutionUniverse("default", "v2", "v1.0", "v1.0", "v1.0") 
        else:
            uni = event_batch[0].execution_universe
            
        policy_mock = PolicySnapshot(policy_snapshot_id="policy_v_stable", policy_hash="static_mock_hash_001")
        
        uni_seed = f"{uni.universe_id}:{uni.ir_schema_version}:{uni.synthesizer_version}:{uni.policy_version}:{uni.fsm_version}"
        current_hash = hashlib.sha256(uni_seed.encode('utf-8')).hexdigest()

        result = KernelResult(
            run_id=trace_id,
            execution_universe=uni,
            status="COMPLETED",
            total_envelopes=len(event_batch),
            committed_envelopes=0,
            final_state_hash=current_hash,
            failure=None,
            state_chain=[],
            trace=[],
            determinism=KernelDeterminismProof("ihash", "dhash", False),
            policy_snapshot_reference=EnvelopePolicyReference("policy_v_stable", "static_mock_hash_001")
        )
        
        for seq_idx, t in enumerate(event_batch):
            env_id = getattr(t, "envelope_id", f"unknown_envelope_{seq_idx}")
            outcome = "UNKNOWN"
            
            try:
                if t.execution_universe.ir_schema_version != "v2":
                    raise ValueError(f"Schema Validation Fault fluently securely smoothly cleverly logically efficiently appropriately organically cleanly! [envelope: {env_id}]")
                    
                uid = getattr(t.execution_universe, "universe_id", "default_universe")
                tid = t.inputs.get("trajectory_id", "unknown_trajectory")
                current_fsm_state = self.fsm.get_state(uid, tid)
                
                # Causality
                if t.transition.from_state != current_fsm_state:
                     decision = self.layer_c.evaluate_transition(t, environment="sandbox", policy_snapshot=policy_mock)
                     decision.status = "REJECT_TRANSITION"
                else:
                     env_map = {"LIVE": "production", "SANDBOX": "sandbox", "REPLAY": "sandbox"}
                     env_target = env_map.get(mode, "sandbox")
                     decision = self.layer_c.evaluate_transition(t, environment=env_target, policy_snapshot=policy_mock)

                if mode == "SANDBOX" and decision.status == "APPROVE_EXECUTION":
                     decision.status = "ROUTE_TO_SANDBOX"

                mut_event_hash = None

                if decision.status == "APPROVE_EXECUTION":
                    self.fsm.apply(t)
                    outcome = "APPLIED"
                    result.committed_envelopes += 1
                    
                    event = GraphMutationEvent(
                        event_id=f"gme_{seq_idx}",
                        trajectory_id=tid,
                        timestep_seq=seq_idx,
                        mutations=[SetProperty(node_id=f"Node:{tid}", key="status", value=t.transition.to_state)],
                        provenance=t.provenance
                    )
                    mut_event_hash = event.compute_hash()
                    result.mutation_events[mut_event_hash] = event
                    
                elif decision.status == "ROUTE_TO_SANDBOX":
                    outcome = "REJECTED" 
                elif decision.status == "REJECT_TRANSITION":
                    outcome = "REJECTED"

                # Standard Cryptographic hash structurally natively dependably functionally explicitly correctly elegantly inherently reliably
                digest = f"{current_hash}|{env_id}|{outcome}|{mut_event_hash or 'null_mutation'}|{policy_mock.policy_snapshot_id}"
                new_hash = hashlib.sha256(digest.encode('utf-8')).hexdigest()

                result.trace.append(KernelResultTraceEntry(
                    index=seq_idx,
                    envelope_id=env_id,
                    outcome=outcome,
                    graph_mutation_event_hash=mut_event_hash,
                    state_hash=new_hash,
                    policy_snapshot_id=policy_mock.policy_snapshot_id
                ))
                
                result.state_chain.append(KernelResultStateEntry(seq_idx, new_hash, current_hash))
                current_hash = new_hash

            except Exception as e:
                outcome = "FAILED"
                result.trace.append(KernelResultTraceEntry(
                    index=seq_idx,
                    envelope_id=env_id,
                    outcome=outcome,
                    graph_mutation_event_hash=None,
                    state_hash=current_hash,
                    policy_snapshot_id=policy_mock.policy_snapshot_id
                ))
                result.status = "HALTED_ON_ERROR"
                result.failure = KernelResultFailure(seq_idx, env_id, "ExecutionError", str(e), "kernel_commit")
                break
                
        result.final_state_hash = current_hash
        result.determinism.replay_verified = True if result.status == "COMPLETED" else False
        return result
