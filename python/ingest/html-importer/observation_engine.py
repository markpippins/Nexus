from dataclasses import dataclass, field
from typing import Set, List, Optional, Dict, Any
from graph_models import InstructionRecord

@dataclass(frozen=True)
class CausalEdge:
    source_id: str
    target_id: str
    reason: str = "dependency"

@dataclass
class MergedClosureDAG:
    """The non-collapsible DAG produced by the Concept Merge Engine."""
    nexus_version: str
    version: str
    nodes: Dict[str, InstructionRecord]
    edges: Set[CausalEdge]
    
    def get_inbound_edges(self, node_id: str) -> List[CausalEdge]:
        return [e for e in self.edges if e.target_id == node_id]

    def get_outbound_edges(self, node_id: str) -> List[CausalEdge]:
        return [e for e in self.edges if e.source_id == node_id]

@dataclass
class ObservationView:
    """Layer VI Output Object."""
    nexus_version: str
    dag_version: str
    frontier_id: str
    observed_nodes: Set[str] # IDs of InstructionRecord
    observed_edges: Set[CausalEdge]
    causal_cut_valid: bool
    annotation_overlay: Optional[Any] = None

class ObservationSynthesizer:
    """Layer VI Boundary Enforcer."""
    def __init__(self, dag: MergedClosureDAG):
        self.dag = dag

    def validate_causal_cut(self, observed_nodes: Set[str]) -> bool:
        """
        Validates if the provided set of nodes forms a valid downward-closed causal cut.
        ∀ edge (a → b): if b ∈ OF then a ∈ OF
        """
        for node_id in observed_nodes:
            inbound = self.dag.get_inbound_edges(node_id)
            for edge in inbound:
                if edge.source_id not in observed_nodes:
                    return False
        return True

    def synthesize_view(self, frontier_id: str, target_nodes: Set[str]) -> ObservationView:
        """
        Computes the minimal downward closure to form a valid ObservationView from target nodes.
        """
        closure = set(target_nodes)
        queue = list(target_nodes)
        
        while queue:
            curr = queue.pop(0)
            for edge in self.dag.get_inbound_edges(curr):
                if edge.source_id not in closure:
                    closure.add(edge.source_id)
                    queue.append(edge.source_id)
                    
        edges = {e for e in self.dag.edges if e.source_id in closure and e.target_id in closure}
        
        return ObservationView(
            nexus_version=self.dag.nexus_version,
            dag_version=self.dag.version,
            frontier_id=frontier_id,
            observed_nodes=closure,
            observed_edges=edges,
            causal_cut_valid=True,
            annotation_overlay=None
        )

@dataclass
class DivergenceGraph:
    """Bounded, disconnected subgraph isolating a sequence divergence."""
    nodes: Set[str]
    edges: Set[CausalEdge]

class OQLEngine:
    """Layer VII Topological Query Interface."""
    def __init__(self, dag: MergedClosureDAG, synthesizer: ObservationSynthesizer):
        self.dag = dag
        self.synth = synthesizer

    # --- Frontier Algebra ---
    
    def union(self, of_a: ObservationView, of_b: ObservationView) -> ObservationView:
        """Computes the minimal valid history satisfying both observation bounds."""
        merged_nodes = of_a.observed_nodes | of_b.observed_nodes
        # Synthesize ensures properties hold, but mathematical union of ideals is an ideal.
        return self.synth.synthesize_view(f"union_{of_a.frontier_id}_{of_b.frontier_id}", merged_nodes)

    def intersection(self, of_a: ObservationView, of_b: ObservationView) -> ObservationView:
        """Extracts the exact maximal common causal prefix."""
        intersected_nodes = of_a.observed_nodes & of_b.observed_nodes
        # Mathematical intersection of ideals is an ideal.
        edges = {e for e in self.dag.edges if e.source_id in intersected_nodes and e.target_id in intersected_nodes}
        return ObservationView(
            nexus_version=self.dag.nexus_version,
            dag_version=self.dag.version,
            frontier_id=f"intersection_{of_a.frontier_id}_{of_b.frontier_id}",
            observed_nodes=intersected_nodes,
            observed_edges=edges,
            causal_cut_valid=True
        )

    def causal_diff(self, of_a: ObservationView, of_b: ObservationView) -> DivergenceGraph:
        """Symmetric difference isolating exactly where the topologies diverge, including causal boundary nodes."""
        diff_nodes = of_a.observed_nodes ^ of_b.observed_nodes
        intersection_nodes = of_a.observed_nodes & of_b.observed_nodes
        
        # Boundary nodes are the shared ancestors that directly point into the divergence
        boundary_nodes = set()
        for node_id in intersection_nodes:
            outbound = self.dag.get_outbound_edges(node_id)
            if any(edge.target_id in diff_nodes for edge in outbound):
                boundary_nodes.add(node_id)
                
        subgraph_nodes = diff_nodes | boundary_nodes
        diff_edges = {e for e in self.dag.edges if e.source_id in subgraph_nodes and e.target_id in subgraph_nodes}
        
        return DivergenceGraph(nodes=subgraph_nodes, edges=diff_edges)

    # --- Geometric Primitives ---

    def causal_past(self, node_id: str) -> ObservationView:
        """Computes the downward closure of a node."""
        return self.synth.synthesize_view(f"past_{node_id}", {node_id})

    def causal_future(self, node_id: str, boundary: ObservationView) -> Set[str]:
        """Finds all topological descendants of `n` strictly within the provided frontier."""
        if node_id not in boundary.observed_nodes:
            return set()
            
        future = set()
        queue = [node_id]
        
        while queue:
            curr = queue.pop(0)
            for edge in self.dag.get_outbound_edges(curr):
                if edge.target_id in boundary.observed_nodes and edge.target_id not in future:
                    future.add(edge.target_id)
                    queue.append(edge.target_id)
                    
        return future

    def is_concurrent(self, node_a: str, node_b: str) -> bool:
        """Mathematical verification of structural parallelism."""
        past_a = self.causal_past(node_a).observed_nodes
        past_b = self.causal_past(node_b).observed_nodes
        return (node_a not in past_b) and (node_b not in past_a)

    def find_lca(self, of_a: ObservationView, of_b: ObservationView) -> Set[str]:
        """Identifies the topological Lowest Common Ancestor state block structural branching points."""
        intersection_of = self.intersection(of_a, of_b)
        lca_nodes = set()
        for node_id in intersection_of.observed_nodes:
            outbound = [e.target_id for e in self.dag.get_outbound_edges(node_id) if e.target_id in intersection_of.observed_nodes]
            if not outbound:
                lca_nodes.add(node_id)
        return lca_nodes

@dataclass
class CachedResult:
    nexus_version: str
    dag_version: str
    dependency_footprint: Set[str]
    result: Any

class IncrementalEvaluator:
    """Layer VII Extension: Incremental OQL Evaluation Model."""
    def __init__(self):
        self.cache: Dict[str, CachedResult] = {}

    def evaluate(self, query_id: str, query_func: Any, dag: MergedClosureDAG, delta_nodes: Set[str] = None) -> Any:
        if query_id in self.cache:
            cached = self.cache[query_id]
            if cached.nexus_version == dag.nexus_version and cached.dag_version == dag.version:
                return cached.result
            
            # Cache Safety Rule: Check dependency footprint against ΔG
            if cached.nexus_version == dag.nexus_version and delta_nodes is not None and not cached.dependency_footprint.intersection(delta_nodes):
                # Frontier Stability: Unaffected by delta, upgrade version without full recompute
                self.cache[query_id] = CachedResult(dag.nexus_version, dag.version, cached.dependency_footprint, cached.result)
                return cached.result

        # Full recompute fallback
        result, footprint = query_func(dag)
        self.cache[query_id] = CachedResult(dag.nexus_version, dag.version, footprint, result)
        return result

class OQLComposer:
    """Layer VII Extension: Composition Semantics."""
    
    @staticmethod
    def pipe(q1_func, q2_func):
        """Eval(Q2 constrained_by Eval(Q1, G), G)"""
        def combined(dag: MergedClosureDAG):
            q1_res, q1_footprint = q1_func(dag)
            # q2_func must accept constraint_frontier
            q2_res, q2_footprint = q2_func(dag, constraint_frontier=q1_res)
            return q2_res, q1_footprint | q2_footprint
        return combined

    @staticmethod
    def sequential(q1_func, q2_func):
        """Independent parallel evaluation returning a tuple."""
        def combined(dag: MergedClosureDAG):
            q1_res, q1_footprint = q1_func(dag)
            q2_res, q2_footprint = q2_func(dag)
            return (q1_res, q2_res), q1_footprint | q2_footprint
        return combined
