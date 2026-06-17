import re
from typing import List, Dict
import collections

from models import NormalizedMessage
from graph_models import ConversationGraph, MessageNode, Relationship, Concept, Trajectory

class GraphBuilder:
    def __init__(self, graph_id: str):
        self.graph = ConversationGraph(id=graph_id)
        self._raw_messages: List[NormalizedMessage] = []

    def ingest_messages(self, messages: List[NormalizedMessage]) -> 'GraphBuilder':
        """Pass 1: Deterministic insertion of nodes into Object Registries."""
        self._raw_messages.extend(messages)
        for i, msg in enumerate(messages):
            node = MessageNode(
                id=msg.message_id, 
                text=msg.text,
                speaker=msg.speaker,
                turn_index=msg.turn_index,
                sequence_position=i
            )
            self.graph.messages[node.id] = node
        return self

    def build_relationships(self) -> 'GraphBuilder':
        """Pass 2: Lightweight Relationship Inference."""
        last_user_msg_id = None

        # Pass 2a: Sequential & Turn Relationships
        for i, msg in enumerate(self._raw_messages):
            # A. Sequential NEXT
            if i < len(self._raw_messages) - 1:
                next_msg = self._raw_messages[i+1]
                self.graph.relationships.append(Relationship(
                    source_id=msg.message_id, 
                    target_id=next_msg.message_id,
                    relation_type="NEXT", 
                    confidence=1.0
                ))
            
            # Anchor tracking for B.
            if msg.speaker == "user":
                last_user_msg_id = msg.message_id
            
            # B. Speaker Transitions (Anchored)
            if msg.speaker == "assistant" and last_user_msg_id is not None:
                self.graph.relationships.append(Relationship(
                    source_id=msg.message_id, 
                    target_id=last_user_msg_id,
                    relation_type="RESPONDS_TO", 
                    confidence=1.0
                ))

        # Pass 2b: Concept Extraction (Minimal Noise)
        self._extract_concepts()
        
        # Pass 2c: Structural Query Binding Extraction (Unanswered obligations)
        self._extract_questions()
        
        return self

    def _extract_questions(self):
        """Phase 2c: Map textual query bounds into rigid Structural Obligations using raw nodes strictly."""
        from graph_models import QuestionNode, QuestionBinding
        
        q_idx = 1
        for msg in self._raw_messages:
            if "?" in msg.text:
                # Find concepts directly tied
                matched_cids = []
                for cid, c in self.graph.concepts.items():
                    if c.name.lower() in msg.text.lower():
                        matched_cids.append(cid)
                        
                q_id = f"q_{q_idx}"
                q_idx += 1
                self.graph.questions[q_id] = QuestionNode(
                    id=q_id,
                    scope_id=self.graph.id,
                    source_trajectory_id=None,
                    binding=QuestionBinding(required_concept_ids=matched_cids),
                    status="OPEN"
                )

    def _extract_concepts(self):
        """Minimal stub generator. Extracts repeated quotes and repeated capitalized terms."""
        candidate_counts = collections.Counter()
        
        # Regex for text in double quotes
        quote_pattern = re.compile(r'"([^"]+)"')
        # Regex for Title Case phrases (2 or more capitalized words)
        title_case_pattern = re.compile(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b')

        for msg in self._raw_messages:
            # 1. Phrases in double quotes
            quotes = quote_pattern.findall(msg.text)
            for q in quotes:
                clean_q = q.strip()
                if len(clean_q) > 2:
                    candidate_counts[clean_q] += 1

            # 2. Track Title Case occurrences (ignoring those already in quotes to prevent double counting per message)
            title_cases = title_case_pattern.findall(msg.text)
            for tc in title_cases:
                clean_tc = tc.strip()
                if not any(clean_tc in q for q in quotes): 
                    candidate_counts[clean_tc] += 1

        # Promote to concepts only if count >= 2
        concept_idx = 1
        
        for term, count in candidate_counts.items():
            if count >= 2:
                cid = f"concept_{concept_idx}"
                self.graph.concepts[cid] = Concept(id=cid, name=term, scope_id=self.graph.id)
                concept_idx += 1


    def extract_trajectories(self) -> 'GraphBuilder':
        """Pass 3: Look for Goal-action phrasing and seed Trajectories."""
        goal_patterns = [
            r"we should (build|design|create)",
            r"let's (build|design|create|try|start)",
            r"i want to (build|create|design)",
            r"(the goal|objective) is",
            r"what we're trying to do is"
        ]
        
        traj_idx = 1
        for msg in self._raw_messages:
            text_lower = msg.text.lower()
            if any(re.search(p, text_lower) for p in goal_patterns):
                traj_id = f"traj_{traj_idx}"
                self.graph.trajectories[traj_id] = Trajectory(
                    id=traj_id, 
                    anchorMessage=msg.message_id, 
                    state="active", 
                    confidence=0.3
                )
                traj_idx += 1
                
        return self

    def finalize(self) -> ConversationGraph:
        """Return the complete graph state."""
        return self.graph
