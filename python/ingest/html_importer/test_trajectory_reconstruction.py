import unittest
from graph_models import ConversationGraph, MessageNode, Trajectory, Concept, Relationship
from trajectory_reconstructor import TrajectoryReconstructor

class TestTrajectoryReconstructor(unittest.TestCase):
    def setUp(self):
        self.graph = ConversationGraph(id="test_reconstructor")
        
        # Populate sequence
        self.msg1 = MessageNode(id="msg_1", text="Let's build a compiler. A Nexus compiler.", sequence_position=0)
        self.msg2 = MessageNode(id="msg_2", text="Okay, building a Nexus compiler. What first?", sequence_position=1)
        self.msg3 = MessageNode(id="msg_3", text="Wait, by the way, how is the weather?", sequence_position=2) # Interruption!
        self.msg4 = MessageNode(id="msg_4", text="Back to the compiler, we need a lexer.", sequence_position=3) # Reattachment!
        self.msg5 = MessageNode(id="msg_5", text="Great, implementing the lexer now.", sequence_position=4) # Resumed -> Active -> Stable evaluation
        
        self.graph.messages = {m.id: m for m in [self.msg1, self.msg2, self.msg3, self.msg4, self.msg5]}
        
        self.graph.concepts["cid_1"] = Concept(id="cid_1", name="compiler")
        
        # Trajectory Seed at msg_1
        self.graph.trajectories["t1"] = Trajectory("t1", "msg_1", "active", 0.5)
        
        # Relationships
        self.graph.relationships.append(Relationship("msg_2", "msg_1", "RESPONDS_TO", 1.0))
        self.graph.relationships.append(Relationship("msg_4", "msg_2", "RESPONDS_TO", 1.0)) # Bypasses msg_3! structurally returning

    def test_reconstruction_pipeline(self):
        reconstructor = TrajectoryReconstructor(self.graph)
        graph = reconstructor.reconstruct()
        
        self.assertEqual(len(graph.reconstructed_trajectories), 1)
        t = list(graph.reconstructed_trajectories.values())[0]
        
        # Conservation verification (sum of messages, interruptions, reattachments is 5)
        total_nodes = len(t.messages) + len(t.interruptions) + len(t.reattachments)
        self.assertEqual(total_nodes, 5)
        
        # Placements
        self.assertIn("msg_1", t.messages)
        self.assertIn("msg_2", t.messages)
        self.assertIn("msg_3", t.interruptions)
        self.assertIn("msg_4", t.reattachments)
        self.assertIn("msg_5", t.messages)
        
        # State verification
        self.assertEqual(t.state, "stable")
        
        # Extract transitions layout
        transitions = [e.to_state for e in t.state_transitions]
        self.assertEqual(transitions, ["interrupted", "resumed", "active", "stable"])
        
        # Test trace logs specifically
        self.assertEqual(t.state_transitions[0].from_state, "active")
        self.assertEqual(t.state_transitions[0].reason, "Forced Keyword Interrupt")
        self.assertEqual(t.state_transitions[0].message_id, "msg_3")

if __name__ == '__main__':
    unittest.main()
