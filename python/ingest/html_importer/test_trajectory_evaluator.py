import unittest
from graph_models import ConversationGraph, ReconstructedTrajectory
from trajectory_evaluator import TrajectoryEvaluator

class TestTrajectoryEvaluator(unittest.TestCase):
    def setUp(self):
        self.graph = ConversationGraph("test")
        
    def test_transient_classification(self):
        traj = ReconstructedTrajectory("r1", "t1", messages=["msg_1"], interruptions=["msg_2", "msg_3"])
        self.graph.reconstructed_trajectories["r1"] = traj
        
        TrajectoryEvaluator().evaluate(self.graph)
        t = self.graph.reconstructed_trajectories["r1"]
        
        # 0.1 Base + 0.1 (1 msg) - 0.10 (2 interruptions) == 0.1
        self.assertEqual(t.classification, "Transient")
        self.assertAlmostEqual(t.confidence, 0.1)

    def test_stable_core_thread(self):
        traj = ReconstructedTrajectory(
            id="r2", 
            seed_id="t2", 
            messages=["m1", "m2", "m3", "m4", "m5"],
            reattachments=["m3", "m5"],
            state="stable"
        )
        self.graph.reconstructed_trajectories["r2"] = traj
        
        TrajectoryEvaluator().evaluate(self.graph)
        t = self.graph.reconstructed_trajectories["r2"]
        
        # 0.1 Base + 0.4 (4+ msgs) + 0.3 (2 reattachments) + 0.2 (stable) = 1.0!
        self.assertEqual(t.classification, "Core Thread")
        self.assertEqual(t.confidence, 1.0)

if __name__ == '__main__':
    unittest.main()
