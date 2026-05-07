import unittest
from graph_models import ConversationGraph, ReconstructedTrajectory, MessageNode
from models import TimestampInfo
from trajectory_evaluation import TrajectoryEvaluator

class TestTrajectoryEvaluator(unittest.TestCase):
    def setUp(self):
        self.graph = ConversationGraph("test")
        
    def test_stable_resolved_classification(self):
        # 1. Stable Thread Test
        traj = ReconstructedTrajectory(
            id="r1", 
            seed_id="t1", 
            messages=["m1", "m2", "m3", "m4"],
            interruptions=["m_int"],
            reattachments=["m3"],
            state="stable" # Stabilized structurally via phase 4
        )
        self.graph.reconstructed_trajectories["r1"] = traj
        self.graph.messages["m1"] = MessageNode(id="m1", text="1", sequence_position=0)
        self.graph.messages["m4"] = MessageNode(id="m4", text="4", sequence_position=3)
        
        # Test Evaluation
        evals = TrajectoryEvaluator(self.graph).evaluate()
        e = evals["r1"]
        
        # Assert: classification == RESOLVED
        self.assertEqual(e.classification, "RESOLVED")
        
        # Assert: stability_score > 0.7
        # Formula yields: base 0.5 + stable 0.2 + 1 reattachment * 0.1 = 0.8
        self.assertGreater(e.stability_score, 0.7)

    def test_abandoned_classification(self):
        # 2. Abandoned Thread Test
        traj = ReconstructedTrajectory(
            id="r2", 
            seed_id="t2", 
            messages=["m1", "m2"],
            interruptions=["m3"],
            reattachments=[],
            state="interrupted"
        )
        self.graph.reconstructed_trajectories["r2"] = traj
        
        evals = TrajectoryEvaluator(self.graph).evaluate()
        e = evals["r2"]
        
        self.assertEqual(e.classification, "ABANDONED")

    def test_exploration_classification(self):
        # 3. Short Exploration Test (3-message trajectory)
        traj = ReconstructedTrajectory(
            id="r3", 
            seed_id="t3", 
            messages=["m1", "m2", "m3"],
            interruptions=[],
            reattachments=[],
            state="active"
        )
        self.graph.reconstructed_trajectories["r3"] = traj
        
        evals = TrajectoryEvaluator(self.graph).evaluate()
        e = evals["r3"]
        
        self.assertEqual(e.classification, "EXPLORATION")
        
    def test_deterministic_consistency(self):
        # 4. Determinism Test
        traj = ReconstructedTrajectory(
            id="r4", 
            seed_id="t4", 
            messages=["m1", "m2", "m3", "m4", "m5", "m6"],
            state="active"
        )
        self.graph.reconstructed_trajectories["r4"] = traj
        
        eval_one = TrajectoryEvaluator(self.graph).evaluate()["r4"]
        eval_two = TrajectoryEvaluator(self.graph).evaluate()["r4"]
        
        self.assertEqual(eval_one, eval_two)
        self.assertEqual(eval_one.classification, "WORKING_THREAD")

if __name__ == '__main__':
    unittest.main()
