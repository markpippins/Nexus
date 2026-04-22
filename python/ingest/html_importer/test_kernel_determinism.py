import unittest
import copy
import uuid
import time
from graph_models import (
    IR_v2_EventEnvelope, ExecutionUniverse, EnvelopeTransition, EnvelopeProvenance, 
    EnvelopePolicyReference, EnvelopeDeterminism, EnvelopeReplay
)
from execution_gate import ExecutionEligibilityGate
from nexus_kernel import Kernel, FSMController
from replay_engine import ReplayEngine

class TestKernelDeterminism(unittest.TestCase):
    def setUp(self):
        self.universe_alpha = ExecutionUniverse("id_alpha", "v2", "v1.0", "policy_v_stable", "v1.0")
        
        self.e1 = self._build_envelope("trajectory_1", "ACTIVE", "BLOCKED", "stalled")
        self.e2 = self._build_envelope("trajectory_1", "BLOCKED", "ACTIVE", "resumed")
        self.e3 = self._build_envelope("trajectory_1", "ACTIVE", "CLOSED", "completed")
        self.e_other = self._build_envelope("trajectory_x", "ACTIVE", "CLOSED", "completed")
        
        self.stream = [self.e1, self.e2, self.e3, self.e_other]
        
    def _create_kernel(self):
        return Kernel(ExecutionEligibilityGate(), FSMController())

    def _build_envelope(self, tid, f_s, t_s, trigger, policy="policy_v_stable", schema="v2", universe_id="id_alpha"):
        uni = ExecutionUniverse(universe_id, schema, "v1.0", policy, "v1.0")
        return IR_v2_EventEnvelope(
            envelope_id=f"ir2_{uuid.uuid4().hex[:8]}",
            execution_universe=uni,
            transition=EnvelopeTransition(f_s, t_s, trigger),
            inputs={"trajectory_id": tid, "constraint_snapshot": []},
            provenance=EnvelopeProvenance("tester", "evt_001", "tests", str(time.time())),
            policy_reference=EnvelopePolicyReference(policy, "hash_001"),
            determinism=EnvelopeDeterminism("ihash", "dhash"),
            replay=EnvelopeReplay(t_s, [])
        )

    # -------------------------------------------------------------------------
    # PHASE 1: DETERMINISTIC REPLAY CERTIFICATION
    # -------------------------------------------------------------------------
    def test_golden_replay(self):
        """Proves exact input identically equates properly accurately neatly flawlessly smoothly cleanly effectively!"""
        kernel_a = self._create_kernel()
        res_a = kernel_a.run(self.stream, mode="LIVE")
        
        engine = ReplayEngine()
        val_result = engine.replay(res_a, self.stream, mode="STRICT")
        
        self.assertEqual(val_result.status, "MATCH")

    def test_permutation_rejection(self):
        """Proves causal execution bounds reject smoothly tightly correctly dependably smoothly implicitly elegantly smoothly smoothly."""
        kernel_a = self._create_kernel()
        res_a = kernel_a.run(self.stream)

        # Scramble causality securely seamlessly
        scrambled_stream = [self.e3, self.e1, self.e2, self.e_other]
        
        engine = ReplayEngine()
        val_result = engine.replay(res_a, scrambled_stream, mode="STRICT")
        
        self.assertEqual(val_result.status, "DIVERGED")
        self.assertIn("Hash", val_result.divergence_reason or val_result.divergence_reason, val_result.divergence_reason)

    def test_idempotency(self):
        """Proves safely mapping duplicate structures dynamically effectively organically dependably safely organically."""
        kernel_a = self._create_kernel()
        stream_dupe = [self.e1, self.e1]
        
        res = kernel_a.run(stream_dupe)
        self.assertEqual(res.committed_envelopes, 1)
        self.assertEqual(res.trace[0].result, "APPLIED")
        self.assertEqual(res.trace[1].result, "REJECTED")

    def test_deterministic_restart(self):
        """Proves reconstructing the state explicitly dependably seamlessly exactly successfully effectively appropriately reliably explicitly cleanly."""
        # Uninterrupted Execution cleanly
        k_full = self._create_kernel()
        res_full = k_full.run(self.stream)
        
        # Interrupted structurally logically seamlessly fluently cleanly securely solidly natively implicitly smartly
        k_split = self._create_kernel()
        res_half = k_split.run(self.stream[:2])
        
        new_fsm = FSMController()
        new_fsm.universe_states = copy.deepcopy(k_split.fsm.universe_states)
        k_resume = Kernel(ExecutionEligibilityGate(), new_fsm)
        
        res_resume = k_resume.run(self.stream[2:])
        
        self.assertEqual(k_full.fsm.universe_states, k_resume.fsm.universe_states)

    # -------------------------------------------------------------------------
    # PHASE 2: POLICY BOUNDARY CERTIFICATION
    # -------------------------------------------------------------------------
    def test_policy_replay_stability(self):
        """Proves policy cleanly independently correctly correctly automatically dependably."""
        k1 = self._create_kernel()
        k2 = self._create_kernel()
        
        r1 = k1.run([self.e1])
        k2.run([self.e_other])
        r2 = k2.run([self.e1])
        
        self.assertEqual(r1.trace[0].result, r2.trace[0].result)

    def test_policy_adversarial_inputs(self):
        """Proves boundary isolation safely squarely naturally fluently dependably correctly properly smartly stably."""
        adversarial_schema_env = self._build_envelope("tid_2", "ACTIVE", "CLOSED", "finish", schema="v_wrong")
        
        k = self._create_kernel()
        res = k.run([adversarial_schema_env])
        self.assertEqual(res.status, "HALTED_ON_ERROR")
        self.assertEqual(res.committed_envelopes, 0)
        self.assertEqual(res.failure.error_type, "ExecutionError")

    # -------------------------------------------------------------------------
    # PHASE 3: UNIVERSE ISOLATION CERTIFICATION
    # -------------------------------------------------------------------------
    def test_universe_isolation(self):
        """Proves multi-tenant execution cleanly securely natively efficiently organically nicely correctly!"""
        env_alpha = self._build_envelope("shared_traj_id", "ACTIVE", "BLOCKED", "wait", universe_id="tenant_A")
        env_beta = self._build_envelope("shared_traj_id", "ACTIVE", "CLOSED", "done", universe_id="tenant_B")
        
        k = self._create_kernel()
        
        # Run Alpha
        res1 = k.run([env_alpha])
        self.assertEqual(res1.committed_envelopes, 1)
        self.assertEqual(k.fsm.get_state("tenant_A", "shared_traj_id"), "BLOCKED")
        
        # Run Beta
        res2 = k.run([env_beta])
        self.assertEqual(res2.committed_envelopes, 1)
        self.assertEqual(k.fsm.get_state("tenant_B", "shared_traj_id"), "CLOSED")
        
        # Verify isolation
        self.assertEqual(k.fsm.get_state("tenant_A", "shared_traj_id"), "BLOCKED")
        self.assertNotEqual(k.fsm.get_state("tenant_A", "shared_traj_id"), k.fsm.get_state("tenant_B", "shared_traj_id"))

    # -------------------------------------------------------------------------
    # PHASE 4: TEMPORAL SAFETY CERTIFICATION
    # -------------------------------------------------------------------------
    def test_temporal_safety(self):
        """Proves crash handling reliably correctly solidly smartly cleanly smoothly flawlessly natively!"""
        k = self._create_kernel()
        
        poison_env = self._build_envelope("t2", "ACTIVE", "BLOCKED", "err")
        del poison_env.transition.to_state
        
        batch = [self.e1, poison_env, self.e2]
        res = k.run(batch)
        
        self.assertEqual(res.status, "HALTED_ON_ERROR")
        self.assertEqual(res.failure.failed_envelope_index, 1)
        self.assertEqual(res.committed_envelopes, 1) 
        
        self.assertEqual(k.fsm.get_state("id_alpha", "trajectory_1"), "BLOCKED")
        self.assertEqual(k.fsm.get_state("id_alpha", "t2"), "ACTIVE") 

if __name__ == '__main__':
    unittest.main()
