import pytest
from observation_engine import (
    CausalEdge, MergedClosureDAG, ObservationSynthesizer, 
    OQLEngine, ObservationView, InstructionRecord
)

def build_test_dag():
    """
    Constructs a simple DAG:
    Root
      ├── A1 ── A2
      └── B1 ── B2
    And a cross-edge from A1 to B2 (implying B2 depends on A1)
    """
    nodes = {
        "Root": "dummy",
        "A1": "dummy",
        "A2": "dummy",
        "B1": "dummy",
        "B2": "dummy",
    }
    edges = {
        CausalEdge("Root", "A1"),
        CausalEdge("Root", "B1"),
        CausalEdge("A1", "A2"),
        CausalEdge("B1", "B2"),
        CausalEdge("A1", "B2")  # Cross-dependency!
    }
    return MergedClosureDAG(nexus_version="1.0.0", version="v1", nodes=nodes, edges=edges)

def test_observation_synthesizer_validation():
    dag = build_test_dag()
    synth = ObservationSynthesizer(dag)
    
    # Valid closure: Root -> A1 -> A2
    valid = synth.validate_causal_cut({"Root", "A1", "A2"})
    assert valid is True
    
    # Invalid closure: Missing Root dependency for A1
    invalid = synth.validate_causal_cut({"A1", "A2"})
    assert invalid is False

def test_observation_synthesizer_downward_closure():
    dag = build_test_dag()
    synth = ObservationSynthesizer(dag)
    
    # If we want to observe B2, we MUST pull in B1, A1, and Root.
    view = synth.synthesize_view("test", {"B2"})
    assert view.causal_cut_valid is True
    assert view.observed_nodes == {"Root", "A1", "B1", "B2"}
    
    # A2 should not be pulled in, it's parallel to B2.
    assert "A2" not in view.observed_nodes

def test_oql_is_concurrent():
    dag = build_test_dag()
    synth = ObservationSynthesizer(dag)
    oql = OQLEngine(dag, synth)
    
    # A2 and B1 should be concurrent.
    assert oql.is_concurrent("A2", "B1") is True
    
    # A1 and A2 are not concurrent (A1 precedes A2).
    assert oql.is_concurrent("A1", "A2") is False
    
    # A1 and B2 are not concurrent because of the cross-edge.
    assert oql.is_concurrent("A1", "B2") is False

def test_oql_frontier_algebra():
    dag = build_test_dag()
    synth = ObservationSynthesizer(dag)
    oql = OQLEngine(dag, synth)
    
    of_a2 = oql.causal_past("A2") # Contains Root, A1, A2
    of_b2 = oql.causal_past("B2") # Contains Root, A1, B1, B2
    
    # Union should contain everything
    union_of = oql.union(of_a2, of_b2)
    assert union_of.observed_nodes == {"Root", "A1", "A2", "B1", "B2"}
    
    # Intersection should be the common prefix (Root, A1)
    intersect_of = oql.intersection(of_a2, of_b2)
    assert intersect_of.observed_nodes == {"Root", "A1"}
    
    # Causal Diff should isolate the divergence branches
    diff_graph = oql.causal_diff(of_a2, of_b2)
    assert diff_graph.nodes == {"Root", "A1", "A2", "B1", "B2"}

def test_oql_lca():
    dag = build_test_dag()
    synth = ObservationSynthesizer(dag)
    oql = OQLEngine(dag, synth)
    
    of_a2 = oql.causal_past("A2")
    of_b2 = oql.causal_past("B2")
    
    lca_nodes = oql.find_lca(of_a2, of_b2)
    # The common prefix is {Root, A1}. The leaf of this intersection is A1.
    assert lca_nodes == {"A1"}
