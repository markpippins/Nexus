"""TemporalAnnotator — enriches a StateDAG with causal semantics.

Takes a StateDAG (read-only) and produces a CausalGraph by promoting
each StateVersion edge into a typed CausalEdge.  This is enrichment,
not retrofit — SM-IR is never modified.
"""

from __future__ import annotations

from .state_dag import StateDAG
from .causal_edge import CausalGraph, CausalEdge


class TemporalAnnotator:
    """Enriches a StateDAG into a typed CausalGraph.

    Usage::

        dag = StateReplayEngine().replay(events)
        graph = TemporalAnnotator().annotate(dag)
        print(graph.is_dag())  # True
    """

    def annotate(self, dag: StateDAG) -> CausalGraph:
        """Enrich a StateDAG with causal semantics.

        Walks the DAG's versions, promotes each NBK-style parent→child
        relationship into a typed CausalEdge, and builds the full
        CausalGraph.

        Does NOT modify the StateDAG — returns a separate CausalGraph.
        """
        graph = CausalGraph()

        for version_id in dag._versions:
            version = dag.get_version(version_id)
            if not version:
                continue

            for parent_id in version.causal_parents:
                parent = dag.get_version(parent_id)
                if not parent:
                    continue

                edge = CausalEdge.from_state_versions(parent, version)
                graph.add_edge(edge)

        return graph
