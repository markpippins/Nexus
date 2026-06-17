"""
Manual Pipeline Triage Tool

Identifies the earliest layer where pipeline output diverges from expectations.
Does not fix anything — just answers: "Where did reality first diverge from the model?"

Pipeline checkpoints:
    Transcript
        ↓
    normalized_messages  (PARSE)
        ↓
    graph                (GRAPH_BUILDER)
        ↓
    trajectories         (TRAJECTORY)
        ↓
    semantic_projection  (PROJECTION)
        ↓
    graph_state          (REPLAY)
        ↓
    ccnf_hash            (CCNF)
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional, Set, Tuple

# ═══════════════════════════════════════════════════════════════════
# Constants
# ═══════════════════════════════════════════════════════════════════

LAYER_ORDER = [
    "normalized_messages",
    "graph",
    "trajectories",
    "semantic_projection",
    "graph_state",
    "ccnf_hash",
]

LAYER_CATEGORY = {
    "normalized_messages": "PARSE",
    "graph": "GRAPH_BUILDER",
    "trajectories": "TRAJECTORY",
    "semantic_projection": "PROJECTION",
    "graph_state": "REPLAY",
    "ccnf_hash": "CCNF",
}

# Higher weight = earlier layer failure is more significant
LAYER_CONFIDENCE_WEIGHTS = {
    "normalized_messages": 0.95,
    "graph": 0.92,
    "trajectories": 0.88,
    "semantic_projection": 0.85,
    "graph_state": 0.80,
    "ccnf_hash": 0.75,
}

KNOWN_DRIFTS_PATH = os.path.join(os.path.dirname(__file__), "ci", "known_drifts.yaml")


# ═══════════════════════════════════════════════════════════════════
# Step 1: Pipeline Snapshot
# ═══════════════════════════════════════════════════════════════════

@dataclass
class PipelineSnapshot:
    """Captures pipeline state at all major boundaries for one transcript run."""
    transcript_id: str
    normalized_messages: Any = None
    graph: Any = None
    trajectories: Any = None
    semantic_projection: Any = None
    graph_state: Any = None
    ccnf_hash: str = ""


def capture_snapshot(
    transcript_id: str,
    normalized_messages=None,
    graph=None,
    semantic_projection=None,
    graph_state=None,
    ccnf_hash="",
) -> PipelineSnapshot:
    """Create a pipeline snapshot from available objects.

    Any slot may be None if that layer hasn't been reached yet.
    """
    trajectories = None
    if graph is not None:
        trajectories = getattr(graph, "reconstructed_trajectories", None)

    return PipelineSnapshot(
        transcript_id=transcript_id,
        normalized_messages=normalized_messages,
        graph=graph,
        trajectories=trajectories,
        semantic_projection=semantic_projection,
        graph_state=graph_state,
        ccnf_hash=ccnf_hash,
    )


# ═══════════════════════════════════════════════════════════════════
# Step 2: Layer Fingerprints
# ═══════════════════════════════════════════════════════════════════

def fingerprint_messages(messages) -> Dict[str, Any]:
    """Stable summary of the normalized messages layer."""
    if messages is None:
        return {"status": "not_reached"}
    if isinstance(messages, list):
        speakers = sorted(set(
            getattr(m, "speaker", "unknown") for m in messages
        )) if messages else []
        return {
            "message_count": len(messages),
            "speakers": speakers,
            "first_turn": getattr(messages[0], "turn_index", 0) if messages else None,
            "last_turn": getattr(messages[-1], "turn_index", 0) if messages else None,
        }
    return {"status": "unknown_format", "type": type(messages).__name__}


def fingerprint_graph(graph) -> Dict[str, Any]:
    """Stable summary of the ConversationGraph layer."""
    if graph is None:
        return {"status": "not_reached"}
    return {
        "nodes": len(getattr(graph, "messages", {})),
        "edges": len(getattr(graph, "relationships", [])),
        "concepts": len(getattr(graph, "concepts", {})),
        "trajectories": len(getattr(graph, "trajectories", {})),
        "questions": len(getattr(graph, "questions", {})),
        "observations": len(getattr(graph, "observations", {})),
    }


def fingerprint_trajectories(trajectories) -> Dict[str, Any]:
    """Stable summary of the reconstructed trajectories layer."""
    if trajectories is None:
        return {"status": "not_reached"}
    if isinstance(trajectories, dict):
        states: Dict[str, int] = {}
        for tid, traj in trajectories.items():
            state = getattr(traj, "state", "unknown") or "unknown"
            states[state] = states.get(state, 0) + 1
        return {
            "trajectory_count": len(trajectories),
            "states": states,
        }
    return {"status": "unknown_format", "type": type(trajectories).__name__}


def fingerprint_projection(projection) -> Dict[str, Any]:
    """Stable summary of the SemanticProjection layer."""
    if projection is None:
        return {"status": "not_reached"}
    resolved = getattr(projection, "resolved_concepts", None)
    edges = getattr(projection, "resolves_edges", None)
    return {
        "resolved_concepts": len(resolved) if resolved else 0,
        "resolve_edges": len(edges) if edges else 0,
    }


def fingerprint_graph_state(graph_state) -> Dict[str, Any]:
    """Stable summary of the GraphState layer."""
    if graph_state is None:
        return {"status": "not_reached"}
    nodes = getattr(graph_state, "nodes", {})
    edges = getattr(graph_state, "edges", {})
    hash_val = ""
    if hasattr(graph_state, "ccnf_hash"):
        hash_val = graph_state.ccnf_hash()
    elif hasattr(graph_state, "compute_hash"):
        hash_val = graph_state.compute_hash()
    return {
        "node_count": len(nodes) if nodes else 0,
        "edge_count": len(edges) if edges else 0,
        "hash": hash_val,
    }


def fingerprint_ccnf(ccnf_hash: str) -> Dict[str, Any]:
    """Stable summary of the CCNF hash layer."""
    if not ccnf_hash:
        return {"status": "not_reached"}
    return {
        "hash": ccnf_hash,
        "hash_prefix": ccnf_hash[:8] if len(ccnf_hash) >= 8 else ccnf_hash,
    }


FINGERPRINT_FUNCTIONS = {
    "normalized_messages": fingerprint_messages,
    "graph": fingerprint_graph,
    "trajectories": fingerprint_trajectories,
    "semantic_projection": fingerprint_projection,
    "graph_state": fingerprint_graph_state,
    "ccnf_hash": fingerprint_ccnf,
}


def fingerprint_snapshot(snapshot: PipelineSnapshot) -> Dict[str, Dict[str, Any]]:
    """Produce fingerprints for all layers in a snapshot."""
    return {
        layer: FINGERPRINT_FUNCTIONS[layer](getattr(snapshot, layer))
        for layer in LAYER_ORDER
    }


# ═══════════════════════════════════════════════════════════════════
# Step 3: Layer Comparators
# ═══════════════════════════════════════════════════════════════════

@dataclass
class LayerDiff:
    """Result of comparing one layer's fingerprints between expected and actual."""
    layer: str
    identical: bool
    score: float
    details: Dict[str, Any] = field(default_factory=dict)


def _compute_similarity(expected: dict, actual: dict) -> float:
    """Compute a similarity score between two fingerprint dicts (0.0–1.0).

    Simple heuristic: 1.0 if identical keys/values, else ratio of matching fields.
    """
    if expected == actual:
        return 1.0

    all_keys = set(expected.keys()) | set(actual.keys())
    if not all_keys:
        return 1.0

    matches = 0
    for key in all_keys:
        ev = expected.get(key)
        av = actual.get(key)
        if ev is not None and av is not None and ev == av:
            matches += 1
    return matches / len(all_keys)


def _compute_diff_details(expected: dict, actual: dict) -> Dict[str, Any]:
    """Identify specific fields that differ between two fingerprint dicts."""
    details = {}
    all_keys = set(expected.keys()) | set(actual.keys())
    for key in sorted(all_keys):
        ev = expected.get(key)
        av = actual.get(key)
        if ev != av:
            details[key] = {
                "expected": ev,
                "actual": av,
            }
    return details


def _exclude_known_drift_fields(
    expected_fp: Dict[str, Any],
    actual_fp: Dict[str, Any],
    layer_drifts: List[Dict],
) -> int:
    """Identify known-drift fields and remove them from both fingerprints.

    A known drift is when a field differs between expected and actual,
    and the expected value matches the documented drift value.
    Returns the number of fields excluded.
    """
    excluded = 0
    for drift in layer_drifts:
        field = drift.get("field")
        expected_val = drift.get("expected")
        if field in expected_fp and field in actual_fp:
            if expected_fp[field] == expected_val and expected_fp[field] != actual_fp[field]:
                # This field is a known drift — mark it for exclusion
                # by setting both to the same sentinel so comparison passes
                expected_fp.pop(field, None)
                actual_fp.pop(field, None)
                excluded += 1
    return excluded


def compare_layer(
    layer: str,
    expected_fp: Dict[str, Any],
    actual_fp: Dict[str, Any],
    known_drifts: Optional[Dict] = None,
) -> LayerDiff:
    """Compare a single layer's fingerprints, checking known drifts."""
    # If either side hasn't reached this layer, treat as not comparable
    if expected_fp.get("status") == "not_reached" and actual_fp.get("status") == "not_reached":
        return LayerDiff(layer=layer, identical=True, score=1.0)
    if expected_fp.get("status") == "not_reached" or actual_fp.get("status") == "not_reached":
        return LayerDiff(
            layer=layer, identical=False, score=0.0,
            details={"one_side_not_reached": True},
        )

    # Apply known-drift exemptions before comparison
    drift_fields_excluded = 0
    if known_drifts:
        layer_drifts = known_drifts.get(layer, [])
        # Work on copies so we don't mutate the originals
        exp_copy = dict(expected_fp)
        act_copy = dict(actual_fp)
        drift_fields_excluded = _exclude_known_drift_fields(exp_copy, act_copy, layer_drifts)
        expected_fp = exp_copy
        actual_fp = act_copy

    identical = expected_fp == actual_fp
    score = 1.0 if identical else _compute_similarity(expected_fp, actual_fp)
    details = {} if identical else _compute_diff_details(expected_fp, actual_fp)

    if drift_fields_excluded:
        details["known_drift_fields_excluded"] = drift_fields_excluded

    return LayerDiff(layer=layer, identical=identical, score=score, details=details)


# ═══════════════════════════════════════════════════════════════════
# Step 4: Divergence Classification
# ═══════════════════════════════════════════════════════════════════

def _load_known_drifts(path: str = KNOWN_DRIFTS_PATH) -> Dict:
    """Load known drifts from YAML file. Returns empty dict if not found."""
    try:
        import yaml
        if os.path.exists(path):
            with open(path) as f:
                return yaml.safe_load(f) or {}
    except ImportError:
        pass
    except Exception:
        pass
    return {}


@dataclass
class TriageReport:
    """Complete triage result."""
    transcript: str = ""
    status: str = "PASS"  # PASS | FAIL
    root_cause: Dict[str, Any] = field(default_factory=dict)
    upstream: Dict[str, str] = field(default_factory=dict)
    failure: Dict[str, Any] = field(default_factory=dict)
    downstream: Dict[str, str] = field(default_factory=dict)
    all_comparisons: Dict[str, LayerDiff] = field(default_factory=dict)
    confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Serialize to a plain dict."""
        result = {
            "transcript": self.transcript,
            "status": self.status,
            "root_cause": self.root_cause,
            "upstream": dict(self.upstream),
            "failure": dict(self.failure),
            "downstream": dict(self.downstream),
            "confidence": self.confidence,
        }
        return result

    def to_yaml(self) -> str:
        """Serialize to YAML string."""
        try:
            import yaml
            return yaml.dump(self.to_dict(), default_flow_style=False, sort_keys=False)
        except ImportError:
            return json.dumps(self.to_dict(), indent=2)

    def to_text(self) -> str:
        """Human-readable text summary."""
        lines = []
        lines.append("=" * 60)
        lines.append(f"TRANSCRIPT: {self.transcript}")
        lines.append(f"STATUS: {self.status}")
        lines.append("=" * 60)
        lines.append("")

        if self.status == "FAIL":
            lines.append(f"ROOT CAUSE:")
            lines.append(f"  Layer: {self.root_cause.get('layer', 'unknown')}")
            lines.append(f"  Category: {self.root_cause.get('category', 'UNKNOWN')}")
            lines.append(f"  Confidence: {self.confidence:.2f}")
            lines.append("")

            lines.append(f"UPSTREAM:")
            for layer, result in self.upstream.items():
                lines.append(f"  {layer}: {result}")
            lines.append("")

            lines.append(f"FAILED:")
            lines.append(f"  {self.root_cause.get('layer', 'unknown')}")
            for key, val in self.failure.items():
                if isinstance(val, dict):
                    lines.append(f"    {key}:")
                    for k, v in val.items():
                        lines.append(f"      {k}: {v}")
                else:
                    lines.append(f"    {key}: {val}")
            lines.append("")

            lines.append(f"DOWNSTREAM:")
            for layer, result in self.downstream.items():
                lines.append(f"  {layer}: {result}")
        else:
            lines.append("All layers match expectations.")
            lines.append("")

        lines.append("=" * 60)
        return "\n".join(lines)


def triage(
    transcript_id: str,
    expected: PipelineSnapshot,
    actual: PipelineSnapshot,
    known_drifts_path: Optional[str] = None,
) -> TriageReport:
    """Run full triage: compare expected vs actual across all layers.

    Returns a TriageReport identifying the earliest layer where divergence
    appears, with upstream/downstream marking.
    """
    expected_fp = fingerprint_snapshot(expected)
    actual_fp = fingerprint_snapshot(actual)

    known_drifts = _load_known_drifts(known_drifts_path or KNOWN_DRIFTS_PATH)

    # Compare all layers
    comparisons: Dict[str, LayerDiff] = {}
    for layer in LAYER_ORDER:
        comparisons[layer] = compare_layer(
            layer, expected_fp[layer], actual_fp[layer], known_drifts,
        )

    # Find first failure
    first_failed = None
    upstream = {}
    failure_details = {}
    downstream = {}

    for layer in LAYER_ORDER:
        diff = comparisons[layer]
        if first_failed is None:
            if not diff.identical:
                first_failed = layer
                failure_details = diff.details
            else:
                upstream[layer] = "PASS"
        else:
            downstream[layer] = "NOT_EVALUATED"

    if first_failed is None:
        return TriageReport(
            transcript=transcript_id,
            status="PASS",
            confidence=1.0,
            all_comparisons=comparisons,
        )

    # Confidence scoring
    weight = LAYER_CONFIDENCE_WEIGHTS.get(first_failed, 0.8)

    # Downstream agreement bonus: how many later layers are structurally consistent
    downstream_layers = LAYER_ORDER[LAYER_ORDER.index(first_failed) + 1:]
    downstream_fingerprints_match = 0
    for dl in downstream_layers:
        if (
            dl in comparisons
            and expected_fp.get(dl, {}).get("status") == actual_fp.get(dl, {}).get("status")
        ):
            downstream_fingerprints_match += 1
    downstream_ratio = (
        downstream_fingerprints_match / len(downstream_layers)
        if downstream_layers
        else 0.5
    )

    confidence = weight * (0.5 + 0.5 * downstream_ratio)
    confidence = round(min(max(confidence, 0.0), 1.0), 2)

    # Build failure detail block
    fail_block = {}
    for field, detail in failure_details.items():
        fail_block[field] = detail

    return TriageReport(
        transcript=transcript_id,
        status="FAIL",
        root_cause={
            "layer": first_failed,
            "category": LAYER_CATEGORY.get(first_failed, "UNKNOWN"),
        },
        confidence=confidence,
        upstream=upstream,
        failure=fail_block,
        downstream=downstream,
        all_comparisons=comparisons,
    )


# ═══════════════════════════════════════════════════════════════════
# Snapshot Persistence
# ═══════════════════════════════════════════════════════════════════

def save_snapshot(snapshot: PipelineSnapshot, path: str):
    """Save a pipeline snapshot to JSON file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)

    # Convert to serializable dict — handle dataclass fields
    data = {"transcript_id": snapshot.transcript_id}

    if snapshot.normalized_messages is not None:
        data["normalized_messages"] = fingerprint_messages(snapshot.normalized_messages)
    if snapshot.graph is not None:
        data["graph"] = fingerprint_graph(snapshot.graph)
    if snapshot.trajectories is not None:
        data["trajectories"] = fingerprint_trajectories(snapshot.trajectories)
    if snapshot.semantic_projection is not None:
        data["semantic_projection"] = fingerprint_projection(snapshot.semantic_projection)
    if snapshot.graph_state is not None:
        data["graph_state"] = fingerprint_graph_state(snapshot.graph_state)
    if snapshot.ccnf_hash:
        data["ccnf_hash"] = fingerprint_ccnf(snapshot.ccnf_hash)

    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


def load_snapshot(path: str) -> PipelineSnapshot:
    """Load a pipeline snapshot from JSON file.

    Note: This loads fingerprint data, not the original objects.
    For full triage, use the in-memory snapshot.
    """
    with open(path) as f:
        data = json.load(f)
    return PipelineSnapshot(transcript_id=data.get("transcript_id", ""))


def save_report(report: TriageReport, path: str):
    """Save a triage report to a YAML or JSON file."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if path.endswith(".yaml") or path.endswith(".yml"):
        with open(path, "w") as f:
            f.write(report.to_yaml())
    else:
        with open(path, "w") as f:
            json.dump(report.to_dict(), f, indent=2)


# ═══════════════════════════════════════════════════════════════════
# CLI Entry Point
# ═══════════════════════════════════════════════════════════════════

def main():
    """Minimal CLI: compare two snapshot files and print report."""
    import argparse

    parser = argparse.ArgumentParser(description="Pipeline Triage Tool")
    parser.add_argument("--expected", required=True, help="Path to expected snapshot JSON")
    parser.add_argument("--actual", required=True, help="Path to actual snapshot JSON")
    parser.add_argument("--output", "-o", help="Output path for report (default: stdout)")
    parser.add_argument("--known-drifts", help="Path to known_drifts.yaml")

    args = parser.parse_args()

    expected = load_snapshot(args.expected)
    actual = load_snapshot(args.actual)

    report = triage(
        transcript_id=expected.transcript_id or actual.transcript_id,
        expected=expected,
        actual=actual,
        known_drifts_path=args.known_drifts,
    )

    text = report.to_text()
    if args.output:
        with open(args.output, "w") as f:
            f.write(text)
        print(f"Report written to {args.output}")
    else:
        print(text)

    # Return exit code based on status
    return 0 if report.status == "PASS" else 1


if __name__ == "__main__":
    exit(main())
