import unittest
from graph_builder import GraphBuilder
from models import NormalizedMessage, TimestampInfo

class TestGraphBuilder(unittest.TestCase):
    def setUp(self):
        self.ts = TimestampInfo(value="2023-01-01T12:00:00Z")
        self.messages = [
            NormalizedMessage("msg_1", "user", self.ts, "Hello there, what is \"Nexus IR\"?", 0, "ref1"),
            NormalizedMessage("msg_2", "assistant", self.ts, "Hello! I am an AI. We should design a compiler.", 0, "ref2"),
            NormalizedMessage("msg_3", "assistant", self.ts, "Also, I want to create a pipeline.", 1, "ref3"),
            NormalizedMessage("msg_4", "user", self.ts, "Great, let's build the \"Nexus Compiler\".", 2, "ref4"),
            NormalizedMessage("msg_5", "assistant", self.ts, "Sure! Let's start with \"Nexus IR\".", 2, "ref5")
        ]
        
    def test_graph_conservation(self):
        builder = GraphBuilder("test_graph")
        builder.ingest_messages(self.messages)
        graph = builder.finalize()
        
        # Test Identity Stability and Conservation
        self.assertEqual(len(graph.messages), len(self.messages))
        self.assertEqual(set(graph.messages.keys()), set(m.message_id for m in self.messages))

    def test_relationships(self):
        builder = GraphBuilder("test_graph")
        graph = builder.ingest_messages(self.messages).build_relationships().finalize()
        
        # 4 NEXT relationships, 3 RESPONDS_TO (msg_2->msg_1, msg_3->msg_1, msg_5->msg_4)
        next_rels = [r for r in graph.relationships if r.relation_type == "NEXT"]
        responds_rels = [r for r in graph.relationships if r.relation_type == "RESPONDS_TO"]
        
        self.assertEqual(len(next_rels), 4)
        self.assertEqual(len(responds_rels), 3)

        # Check anchors
        self.assertTrue(any(r.source_id == "msg_2" and r.target_id == "msg_1" for r in responds_rels))
        self.assertTrue(any(r.source_id == "msg_3" and r.target_id == "msg_1" for r in responds_rels))
        self.assertTrue(any(r.source_id == "msg_5" and r.target_id == "msg_4" for r in responds_rels))

    def test_concept_extraction(self):
        builder = GraphBuilder("test_graph")
        graph = builder.ingest_messages(self.messages).build_relationships().finalize()
        
        concepts = [c.name for c in graph.concepts.values()]
        # "Nexus IR" is duplicated so it should be exactly 2
        # "Nexus Compiler" is no longer duplicated so it should NOT be extracted under rule >=2
        self.assertIn("Nexus IR", concepts)
        self.assertNotIn("Nexus Compiler", concepts)

    def test_trajectory_seeds(self):
        builder = GraphBuilder("test_graph")
        graph = builder.ingest_messages(self.messages).extract_trajectories().finalize()
        
        # msg_2 -> "We should design"
        # msg_3 -> "I want to create"
        # msg_4 -> "let's build"
        # msg_5 -> "Let's start"
        self.assertEqual(len(graph.trajectories), 4)
        anchors = [t.anchorMessage for t in graph.trajectories.values()]
        self.assertIn("msg_2", anchors)
        self.assertIn("msg_3", anchors)
        self.assertIn("msg_4", anchors)
        self.assertIn("msg_5", anchors)

if __name__ == '__main__':
    unittest.main()
