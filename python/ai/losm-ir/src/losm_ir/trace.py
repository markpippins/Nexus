import dataclasses
from typing import Any, Dict, List


@dataclasses.dataclass
class TraceOutput:
    trace_id: str
    content: str
    data: Dict[str, Any] = dataclasses.field(default_factory=dict)


def trace_hash(trace: List[dict]) -> int:
    hashed_steps = []
    for step in trace:
        step_str = str(step.get("morphism", "error")) + str(step.get("LIC_witness", {}).get("result", False))
        g_before_hash = hash(frozenset(step["G_before"]["nodes"].keys())) if step.get("G_before") else 0
        g_after_hash = hash(frozenset(step["G_after"]["nodes"].keys())) if step.get("G_after") else 0
        hashed_steps.append(hash((step_str, g_before_hash, g_after_hash)))
    return hash(tuple(hashed_steps))


class TraceFamily:
    def __init__(self, traces: List[List[dict]]):
        self.traces = traces
        self._hashed_set = frozenset(trace_hash(t) for t in traces)

    def __eq__(self, other):
        if not isinstance(other, TraceFamily):
            return False
        return self._hashed_set == other._hashed_set


__all__ = ["TraceOutput", "TraceFamily", "trace_hash"]
