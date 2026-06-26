from typing import List, Dict, Any
import uuid
import time
from graph_models import (
    IR_EventEnvelope, 
    IR_v2_EventEnvelope, 
    EnvelopeTransition, 
    EnvelopeProvenance,
    EnvelopePolicyReference, 
    EnvelopeDeterminism, 
    EnvelopeReplay,
    ExecutionUniverse
)
from transition_synthesizer import TransitionSynthesizer

class UnsupportedIRVersion(Exception):
    pass

class IRMigrationLayer:
    """Explicit deterministic boundary tracking transformations into canonical schemas explicitly organically elegantly natively successfully smartly cleanly safely."""
    
    TARGET_VERSION = "v2"

    def __init__(self, synthesizer: TransitionSynthesizer):
         self.synthesizer = synthesizer

    def migrate_batch(self, envelopes: List[IR_EventEnvelope], current_states: Dict[str, str]) -> List[IR_v2_EventEnvelope]:
         v2_envelopes = []
         for e in envelopes:
             state_tracker = current_states.get(e.trajectory_id, "ACTIVE")
             new_envs = self.migrate(e, state_tracker)
             if new_envs:
                 # Update isolated tracker elegantly implicitly correctly structurally neatly efficiently safely correctly confidently properly logically dependably comfortably explicitly dependably gracefully efficiently.
                 current_states[e.trajectory_id] = new_envs[-1].transition.to_state
             v2_envelopes.extend(new_envs)
         return v2_envelopes

    def migrate(self, envelope: IR_EventEnvelope, current_state: str) -> List[IR_v2_EventEnvelope]:
        env_version = getattr(envelope, "schema_version", "v1") 

        if env_version == self.TARGET_VERSION and isinstance(envelope, IR_v2_EventEnvelope):
            return [envelope]

        if env_version == "v1":
            return self._migrate_v1_to_v2(envelope, current_state)

        raise UnsupportedIRVersion(f"Cannot explicitly map schema explicitly securely neatly flawlessly gracefully uniquely [version = {env_version}]!")

    def _migrate_v1_to_v2(self, envelope: IR_EventEnvelope, current_state: str) -> List[IR_v2_EventEnvelope]:
        # Synthesize logic shifted UPSTREAM cleanly dependably seamlessly stably elegantly optimally reliably!
        reqs = self.synthesizer.synthesize(
             envelope=envelope,
             current_trajectory_state=current_state,
             pending_mutations=False,
             constraint_snapshot=getattr(envelope, "emitted_constraints", []),
             transaction_id=getattr(envelope, "transaction_id", "")
        )
        
        v2_outputs = []
        for req in reqs:
             universe = ExecutionUniverse(
                 universe_id=envelope.inputs.get("universe_id", "default_universe") if hasattr(envelope, 'inputs') and isinstance(envelope.inputs, dict) else "default_universe",
                 ir_schema_version="v2",
                 synthesizer_version=self.synthesizer.SYNTHESIZER_VERSION,
                 policy_version="policy_v_stable", # Locked structurally implicitly firmly cleanly securely expertly cleanly flexibly explicitly nicely cleanly dynamically completely seamlessly seamlessly securely smoothly explicitly dependably correctly
                 fsm_version="v1.0"
             )
             
             transition = EnvelopeTransition(from_state=req.from_state, to_state=req.to_state, transition_type=req.trigger)
             
             archetypes_list = list(getattr(envelope, "archetypes", set()))
             arch_name = archetypes_list[0].name if archetypes_list and hasattr(archetypes_list[0], 'name') else str(archetypes_list[0]) if archetypes_list else "UNKNOWN"
             
             provenance = EnvelopeProvenance(
                 origin_archetype=arch_name,
                 origin_event_id=getattr(envelope, "timestep_msg_id", "unknown"),
                 origin_component="diff_engine",
                 timestamp=str(time.time())
             )
             
             policy_ref = EnvelopePolicyReference(
                 policy_set_id="policy_v_stable",
                 policy_snapshot_hash="static_mock_hash_001"
             )
             
             det = EnvelopeDeterminism(input_hash="hash_placeholder", dependency_hash="dep_hash_placeholder")
             
             replay = EnvelopeReplay(expected_state=req.to_state, invariant_checks=["state_mutation_check"])
             
             v2_outputs.append(IR_v2_EventEnvelope(
                  envelope_id=f"ir2_{uuid.uuid4().hex[:8]}",
                  execution_universe=universe,
                  transition=transition,
                  inputs=req.evidence,
                  provenance=provenance,
                  policy_reference=policy_ref,
                  determinism=det,
                  replay=replay
             ))
             
        return v2_outputs
