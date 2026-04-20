from typing import List
from graph_models import ConversationGraph

class GraphValidator:
    """Pass 3.5: Deterministic Graph Validation Compiler Layer."""
    def __init__(self, graph: ConversationGraph):
        self.graph = graph
        self.errors: List[str] = []
        self.warnings: List[str] = []

    def validate(self) -> bool:
        """Run all invariant passes. Return True if 0 errors."""
        self.validate_identity()
        self.validate_relationships()
        self.validate_next_edges()
        self.validate_responds_to_edges()
        self.validate_trajectories()
        self.validate_concepts()
        return len(self.errors) == 0

    def validate_identity(self):
        """Rule 1: Identity Integrity Check"""
        message_ids = set(self.graph.messages.keys())
        if len(message_ids) != len(self.graph.messages):
            self.errors.append("DUPLICATE_MESSAGE_IDS")
        if len(message_ids) == 0:
            self.errors.append("EMPTY_GRAPH")

    def validate_relationships(self):
        """Rule 2: Relationship Validity Check"""
        for r in self.graph.relationships:
            if r.source_id not in self.graph.messages:
                self.errors.append(f"INVALID_SOURCE: {r.source_id}")
            if r.target_id not in self.graph.messages:
                self.errors.append(f"INVALID_TARGET: {r.target_id}")

    def validate_next_edges(self):
        """Rule 3: NEXT Relationship Ordering Check"""
        for r in self.graph.relationships:
            if r.relation_type == "NEXT":
                if r.source_id in self.graph.messages and r.target_id in self.graph.messages:
                    src = self.graph.messages[r.source_id]
                    tgt = self.graph.messages[r.target_id]
                    # Hard Guarantee
                    if tgt.sequence_position <= src.sequence_position:
                        self.errors.append(f"NEXT_SEQUENCE_MISMATCH: {src.id} -> {tgt.id}")
                    # Soft Guarantee
                    if tgt.turn_index < src.turn_index:
                        self.errors.append(f"NEXT_TURN_REGRESSION: {src.id} ({src.turn_index}) -> {tgt.id} ({tgt.turn_index})")

    def validate_responds_to_edges(self):
        """Rule 4: RESPONDS_TO Sanity Check"""
        for r in self.graph.relationships:
            if r.relation_type == "RESPONDS_TO":
                if r.target_id in self.graph.messages:
                    tgt = self.graph.messages[r.target_id]
                    if tgt.speaker != "user":
                        self.errors.append(f"RESPONDS_TO_MISMATCH: {r.source_id} -> assistant cannot point to {tgt.speaker} ({tgt.id})")

    def validate_trajectories(self):
        """Rule 5: Trajectory Seed Validation"""
        for t in self.graph.trajectories.values():
            if t.anchorMessage not in self.graph.messages:
                self.errors.append(f"ORPHAN_TRAJECTORY_ANCHOR: {t.id} references missing {t.anchorMessage}")
            if not (0 <= t.confidence <= 1):
                self.errors.append(f"INVALID_CONFIDENCE: {t.id} has {t.confidence}")

    def validate_concepts(self):
        """Rule 6: Concept Stub Validation"""
        for c in self.graph.concepts.values():
            if not isinstance(c.name, str) or len(c.name.strip()) == 0:
                self.errors.append(f"INVALID_CONCEPT_NAME: {c.id}")
