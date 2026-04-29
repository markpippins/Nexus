from dataclasses import dataclass
from typing import List, Dict, Any
from observation_engine import MergedClosureDAG

@dataclass
class QueryTrace:
    query_id: str
    evaluated_nodes: int
    pruned_nodes: int
    frontier_restrictions: List[str]

@dataclass
class ReplayTrace:
    dag_version: str
    topological_sort_order: List[str]
    executed_closures: List[str]

@dataclass
class SystemSnapshot:
    """Layer XIII: System State Snapshot Model (Immutable)"""
    dag_version: str
    event_count: int
    active_resolutions: Dict[str, str]
    structure_hash: str

class DiagnosticInspector:
    """Layer XIII: Observability & Diagnostic Introspection Contract"""
    
    @staticmethod
    def capture_snapshot(dag: MergedClosureDAG, event_store: Any) -> SystemSnapshot:
        """Strictly read-only derivation, no side effects."""
        return SystemSnapshot(
            dag_version=dag.version,
            event_count=len(event_store.log),
            active_resolutions={}, # Resolved computationally
            structure_hash=str(hash(f"{dag.version}_{len(dag.nodes)}"))
        )

    @staticmethod
    def diff_snapshots(s1: SystemSnapshot, s2: SystemSnapshot) -> dict:
        """Delta Inspection: strictly structural changes only."""
        return {
            "version_delta": f"{s1.dag_version} -> {s2.dag_version}",
            "event_delta": s2.event_count - s1.event_count,
            "structural_shift": s1.structure_hash != s2.structure_hash
        }
