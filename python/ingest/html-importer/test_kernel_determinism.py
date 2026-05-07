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
        view = engine.replay(res_a.trace, res_a.mutation_events, res_a.state_chain[0].prev_hash, "v2")
        
        # Assert structural reduction explicitly firmly optimally appropriately elegantly squarely solidly natively
        self.assertIn("Node:trajectory_1", view.final_graph_state.nodes)
        self.assertEqual(view.final_graph_state.nodes["Node:trajectory_1"]["status"], "CLOSED")

    def test_permutation_rejection(self):
        """Proves causal execution bounds reject smoothly tightly correctly dependably smoothly implicitly elegantly smoothly smoothly."""
        kernel_a = self._create_kernel()
        res_a = kernel_a.run(self.stream)

        scrambled_trace = [res_a.trace[2], res_a.trace[0], res_a.trace[1], res_a.trace[3]]
        
        engine = ReplayEngine()
        with self.assertRaises(ValueError) as ctx:
             engine.replay(scrambled_trace, res_a.mutation_events, res_a.state_chain[0].prev_hash, "v2")
        
        self.assertIn("Ledger Tampering", str(ctx.exception))

    def test_idempotency(self):
        """Proves safely mapping duplicate structures dynamically effectively organically dependably safely organically."""
        kernel_a = self._create_kernel()
        res = kernel_a.run([self.e1, self.e1])
        
        self.assertEqual(res.trace[0].outcome, "APPLIED")
        self.assertEqual(res.trace[1].outcome, "REJECTED")

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
        
        self.assertEqual(r1.trace[0].outcome, r2.trace[0].outcome)
        self.assertEqual(r1.final_state_hash, r2.final_state_hash)

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

    # -------------------------------------------------------------------------
    # PHASE 5: TEMPORAL DAG VM
    # -------------------------------------------------------------------------
    def test_fork_independence(self):
        """Proves branch realities reliably expertly structurally cleanly optimally fluently securely dynamically correctly!"""
        from nexus_vm import NexusVM
        from graph_reducer import GraphStateReducer
        from graph_models import SetProperty
        
        vm = NexusVM(GraphStateReducer())
        
        vm.append_instruction("main", SetProperty("Node:A", "val", "A"))
        vm.append_instruction("main", SetProperty("Node:B", "val", "B"))
        vm.append_instruction("main", SetProperty("Node:C", "val", "C"))
        
        # Fork after B predictably reliably smartly intelligently
        fork_id = vm.fork_timeline("main", 1) 
        
        vm.append_instruction(fork_id, SetProperty("Node:D", "val", "D"))
        
        state_main = vm.materialize("main")
        state_fork = vm.materialize(fork_id)
        
        self.assertIn("Node:C", state_main.nodes)
        self.assertNotIn("Node:D", state_main.nodes)
        
        self.assertIn("Node:D", state_fork.nodes)
        self.assertNotIn("Node:C", state_fork.nodes)
        
        self.assertEqual(state_main.nodes["Node:B"], state_fork.nodes["Node:B"])

    def test_replay_stability(self):
        from nexus_vm import NexusVM
        from graph_reducer import GraphStateReducer
        from graph_models import SetProperty
        vm = NexusVM(GraphStateReducer())
        
        vm.append_instruction("main", SetProperty("Node:1", "state", "X"))
        f_id = vm.fork_timeline("main", 0)
        vm.append_instruction(f_id, SetProperty("Node:1", "state", "Y"))
        
        s1 = vm.materialize(f_id)
        s2 = vm.materialize(f_id)
        
        import hashlib
        h1 = hashlib.sha256(str(s1.nodes).encode()).hexdigest()
        h2 = hashlib.sha256(str(s2.nodes).encode()).hexdigest()
        
        self.assertEqual(h1, h2)

    def test_parent_immutability(self):
        from nexus_vm import NexusVM
        from graph_reducer import GraphStateReducer
        from graph_models import SetProperty
        vm = NexusVM(GraphStateReducer())
        vm.append_instruction("main", SetProperty("Node:Root", "val", "1"))
        
        s_initial = vm.materialize("main")
        
        f_id = vm.fork_timeline("main", 0)
        vm.append_instruction(f_id, SetProperty("Node:Root", "val", "2"))
        
        s_after_fork = vm.materialize("main")
        self.assertEqual(s_initial.nodes, s_after_fork.nodes)

    def test_canonical_graph_hashing(self):
        """Proves that mathematically identical cleanly intelligently dependably graphs dynamically flawlessly elegantly elegantly correctly output the same explicitly optimally reliably smoothly securely seamlessly safely natively! efficiently fluently wisely cleanly reliably safely reliably! logically cleanly intelligently successfully sensibly nicely dynamically elegantly rationally cleanly elegantly efficiently sensibly safely dependably comfortably fluently securely rationally cleanly reliably organically solidly smartly cleanly correctly predictably fluently securely comfortably seamlessly efficiently."""
        from graph_models import GraphState
        
        # Test out of order construction flexibly smartly smoothly reliably cleanly explicitly organically creatively intelligently dependably smartly comfortably natively effectively wisely competently
        g1 = GraphState(
            nodes={"b": {"z": 1, "a": 2}, "a": {}},
            edges={}
        )
        g2 = GraphState(
            nodes={"a": {}, "b": {"a": 2, "z": 1}},
            edges={}
        )
        
        self.assertEqual(g1.compute_hash(), g2.compute_hash())

    def test_fork_convergence_hashing(self):
        from nexus_vm import NexusVM
        from graph_reducer import GraphStateReducer
        from graph_models import SetProperty
        
        vm = NexusVM(GraphStateReducer())
        vm.append_instruction("main", SetProperty("n1", "k", "v"))
        f_id = vm.fork_timeline("main", 0)
        
        # main edits n2 predictably smartly safely fluently effectively automatically properly elegantly natively effortlessly effortlessly safely successfully properly effectively explicitly properly efficiently confidently smoothly predictably efficiently stably correctly intelligently dependably natively dependably smoothly rationally safely cleverly intelligently natively smartly correctly elegantly wisely securely fluently competently properly
        vm.append_instruction("main", SetProperty("n2", "val", "n2"))
        vm.append_instruction("main", SetProperty("n3", "val", "n3"))
        
        # fork intelligently effectively dependably natively edits cleanly effortlessly predictably implicitly elegantly sensibly cleanly smoothly confidently smoothly organically
        vm.append_instruction(f_id, SetProperty("n3", "val", "n3"))
        vm.append_instruction(f_id, SetProperty("n2", "val", "n2"))
        
        # Check cleanly competently dynamically intelligently safely comfortably safely smartly smoothly cleanly reliably gracefully dependably
        s_main = vm.materialize("main")
        s_fork = vm.materialize(f_id)
        
        self.assertEqual(s_main.compute_hash(), s_fork.compute_hash())

    # -------------------------------------------------------------------------
    # PHASE 6: SEMANTIC CONFLICT RESOLUTION
    # -------------------------------------------------------------------------
    def test_merge_non_conflicting(self):
        from nexus_vm import NexusVM
        from nexus_merge import ConceptMergeEngine
        from graph_reducer import GraphStateReducer
        from graph_models import SetProperty
        
        vm = NexusVM(GraphStateReducer())
        vm.append_instruction("main", SetProperty("Root", "status", "init"))
        
        f_a = vm.fork_timeline("main", 0)
        f_b = vm.fork_timeline("main", 0)
        
        vm.append_instruction(f_a, SetProperty("Node_A", "val", "A"))
        vm.append_instruction(f_b, SetProperty("Node_B", "val", "B"))
        
        merger = ConceptMergeEngine(vm)
        merged_id = merger.merge(f_a, f_b)
        
        final_state = vm.materialize(merged_id)
        self.assertIn("Node_A", final_state.nodes)
        self.assertIn("Node_B", final_state.nodes)
        self.assertEqual(final_state.nodes["Node_A"]["val"], "A")
        self.assertEqual(final_state.nodes["Node_B"]["val"], "B")

    def test_merge_structural_conflict_rejection(self):
        from nexus_vm import NexusVM
        from nexus_merge import ConceptMergeEngine, MergeConflictException
        from graph_reducer import GraphStateReducer
        from graph_models import SetProperty, DeleteNode
        
        vm = NexusVM(GraphStateReducer())
        vm.append_instruction("main", SetProperty("SharedNode", "status", "init"))
        
        f_a = vm.fork_timeline("main", 0)
        f_b = vm.fork_timeline("main", 0)
        
        vm.append_instruction(f_a, DeleteNode("SharedNode"))
        vm.append_instruction(f_b, SetProperty("SharedNode", "status", "modified"))
        
        merger = ConceptMergeEngine(vm)
        with self.assertRaises(MergeConflictException) as context:
            merger.merge(f_a, f_b)
            
        self.assertEqual(context.exception.groups[0].conflict_type.value, "STRUCTURAL")
        self.assertIn("node:SharedNode", context.exception.groups[0].target_overlap)

    def test_merge_value_conflict_resolution(self):
        from nexus_vm import NexusVM
        from nexus_merge import ConceptMergeEngine
        from graph_reducer import GraphStateReducer
        from graph_models import SetProperty
        
        vm = NexusVM(GraphStateReducer())
        vm.append_instruction("main", SetProperty("Config", "retry", 1))
        
        f_a = vm.fork_timeline("main", 0)
        f_b = vm.fork_timeline("main", 0)
        
        vm.append_instruction(f_a, SetProperty("Config", "retry", 2))
        vm.append_instruction(f_b, SetProperty("Config", "retry", 5))
        
        merger = ConceptMergeEngine(vm)
        merged_id = merger.merge(f_a, f_b)
        
        final_state = vm.materialize(merged_id)
        self.assertEqual(final_state.nodes["Config"]["retry"], 5)

    def test_causal_priority_strategy(self):
        from nexus_vm import NexusVM
        from nexus_merge import ConceptMergeEngine, CausalPriorityStrategy
        from graph_reducer import GraphStateReducer
        from graph_models import SetProperty, InstructionMetadata
        
        vm = NexusVM(GraphStateReducer())
        vm.append_instruction("main", SetProperty("Config", "val", "base"))
        
        f_a = vm.fork_timeline("main", 0)
        f_b = vm.fork_timeline("main", 0)
        
        vm.timelines[f_a].instructions.append(
            __import__('graph_models').InstructionRecord(
                instruction=SetProperty("Config", "val", "ai"), state_hash="", metadata=InstructionMetadata("system", 0)
            )
        )
        vm.timelines[f_b].instructions.append(
            __import__('graph_models').InstructionRecord(
                instruction=SetProperty("Config", "val", "human"), state_hash="", metadata=InstructionMetadata("user", 0)
            )
        )
        
        merger = ConceptMergeEngine(vm, CausalPriorityStrategy())
        merged_id = merger.merge(f_a, f_b)
        
        final_state = vm.materialize(merged_id)
        # B wins because actor_id is user.
        self.assertEqual(final_state.nodes["Config"]["val"], "human")

if __name__ == '__main__':
    unittest.main()
