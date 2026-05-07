import pytest
from ingestion_compiler import (
    TranscriptSegment, RawTranscript, ISGRule, ISGEngine, IngestionCompiler
)
from observation_engine import (
    CausalEdge, MergedClosureDAG, ObservationSynthesizer, OQLEngine
)
from graph_models import InstructionRecord

class MiniReplayEngine:
    """Minimal shim to convert Envelopes into a DAG for the test harness."""
    @staticmethod
    def replay(envelopes) -> MergedClosureDAG:
        nodes = {}
        edges = set()
        
        # We will build a simple DAG. For demonstration, we'll link them sequentially.
        # In a real system, ReplayEngine calculates dependencies from explicit read/write sets.
        prev_id = None
        
        for env in envelopes:
            node_id = env.envelope_id
            nodes[node_id] = InstructionRecord(instruction=None, state_hash="hash")
            
            if prev_id:
                edges.add(CausalEdge(source_id=prev_id, target_id=node_id, reason="temporal_fallback"))
            
            prev_id = node_id
            
        return MergedClosureDAG(nexus_version="1.0.0", version="v1", nodes=nodes, edges=edges)

def test_end_to_end_pipeline():
    # 1. Define ISG Rules (Layer XII.5)
    rules = [
        ISGRule(id="rule_assent", match_type="contains", pattern="Yes", label="assent", strength="strong"),
        ISGRule(id="rule_partial", match_type="prefix", pattern="Maybe", label="partial_assent", strength="weak")
    ]
    isg_engine = ISGEngine(version="v1.0", rules=rules)
    
    # 2. Build Raw Transcript
    transcript = RawTranscript(
        session_id="session_alpha",
        segments=[
            TranscriptSegment(segment_id="seq_1", speaker="system", text="Initialize the deployment module?"),
            TranscriptSegment(segment_id="seq_2", speaker="user", text="Yes, let's do it.")
        ]
    )
    
    # 3. Ingest and Compile (Layer XII)
    compiler = IngestionCompiler(isg_engine=isg_engine)
    envelopes = compiler.compile(transcript)
    
    assert len(envelopes) == 2
    sys_event = envelopes[0]
    user_event = envelopes[1]
    
    # Verify ISG Enrichment correctly tagged the user's assent without changing structural truth
    assert sys_event.inputs["isg"].assent_flag is False
    assert user_event.inputs["isg"].assent_flag is True
    assert "assent" in user_event.inputs["isg"].labels
    
    # Verify Structural Determinism
    assert sys_event.execution_universe.universe_id == "session_alpha"
    assert user_event.provenance.origin_archetype == "TRANSCRIPT_INGESTION"
    
    # 4. Replay into DAG (Simulated Layer II & V)
    dag = MiniReplayEngine.replay(envelopes)
    
    assert len(dag.nodes) == 2
    assert len(dag.edges) == 1
    
    # 5. Execute Topological Queries (Layer VI & VII)
    synth = ObservationSynthesizer(dag)
    oql = OQLEngine(dag, synth)
    
    sys_id = sys_event.envelope_id
    user_id = user_event.envelope_id
    
    # Query: Causal Past of the User Event
    # Should include both the System Event (prompt) and the User Event (response)
    past_view = oql.causal_past(user_id)
    assert past_view.causal_cut_valid is True
    assert sys_id in past_view.observed_nodes
    assert user_id in past_view.observed_nodes
    
    # Query: Causal Diffing
    # Diffing the causal past of the System vs User
    sys_past = oql.causal_past(sys_id)
    diff_graph = oql.causal_diff(sys_past, past_view)
    
    # The diff should isolate the divergence point. 
    # Because past_view is exactly sys_past + user_event + causal_edge,
    # The symmetric difference is `user_event`. 
    # The causal boundary node extracted is `sys_event` (lowest shared ancestor pointing into divergence).
    assert user_id in diff_graph.nodes
    assert sys_id in diff_graph.nodes
    assert len(diff_graph.edges) == 1 # The edge from sys_id -> user_id

    # Output Success (for visibility in CLI)
    print("End-to-end Pipeline Test Passed!")
