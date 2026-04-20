import unittest
from graph_validator import GraphValidator
from graph_models import ConversationGraph, MessageNode, Relationship, Trajectory, Concept

class TestGraphValidator(unittest.TestCase):
    def setUp(self):
        self.graph = ConversationGraph(id="test")
        
        # Proper setup
        self.msg1 = MessageNode(id="msg_1", text="Hello", speaker="user", sequence_position=0, turn_index=0)
        self.msg2 = MessageNode(id="msg_2", text="Hi", speaker="assistant", sequence_position=1, turn_index=0)
        self.msg3 = MessageNode(id="msg_3", text="Next?", speaker="user", sequence_position=2, turn_index=1)
        
        self.graph.messages["msg_1"] = self.msg1
        self.graph.messages["msg_2"] = self.msg2
        self.graph.messages["msg_3"] = self.msg3

    def test_valid_graph_passes(self):
        self.graph.relationships.append(Relationship("msg_1", "msg_2", "NEXT", 1.0))
        self.graph.relationships.append(Relationship("msg_2", "msg_1", "RESPONDS_TO", 1.0))
        
        validator = GraphValidator(self.graph)
        self.assertTrue(validator.validate())

    def test_invalid_source_relationship(self):
        self.graph.relationships.append(Relationship("msg_ghost", "msg_1", "NEXT", 1.0))
        validator = GraphValidator(self.graph)
        self.assertFalse(validator.validate())
        self.assertIn("INVALID_SOURCE: msg_ghost", validator.errors)

    def test_next_edge_ordering_fails(self):
        # msg_2 sequence_position is 1, msg_1 is 0. So NEXT from msg_2 to msg_1 is backwards!
        self.graph.relationships.append(Relationship("msg_2", "msg_1", "NEXT", 1.0))
        validator = GraphValidator(self.graph)
        self.assertFalse(validator.validate())
        self.assertIn("NEXT_SEQUENCE_MISMATCH: msg_2 -> msg_1", validator.errors)

    def test_next_turn_regression_fails(self):
        bad_msg = MessageNode(id="msg_4", text="Bad", sequence_position=3, turn_index=-1)
        self.graph.messages["msg_4"] = bad_msg
        self.graph.relationships.append(Relationship("msg_3", "msg_4", "NEXT", 1.0))
        
        validator = GraphValidator(self.graph)
        self.assertFalse(validator.validate())
        self.assertTrue(any("NEXT_TURN_REGRESSION" in err for err in validator.errors))

    def test_responds_to_mismatch(self):
        # Response mapping to an assistant instead of user
        self.graph.relationships.append(Relationship("msg_3", "msg_2", "RESPONDS_TO", 1.0))
        validator = GraphValidator(self.graph)
        self.assertFalse(validator.validate())
        self.assertIn("RESPONDS_TO_MISMATCH: msg_3 -> assistant cannot point to assistant (msg_2)", validator.errors)

    def test_orphan_trajectory(self):
        self.graph.trajectories["t1"] = Trajectory(id="t1", anchorMessage="msg_missing", state="active", confidence=0.5)
        validator = GraphValidator(self.graph)
        self.assertFalse(validator.validate())
        self.assertIn("ORPHAN_TRAJECTORY_ANCHOR: t1 references missing msg_missing", validator.errors)

if __name__ == '__main__':
    unittest.main()
