"""
Generate golden_behavior_manifest.json from replay fixtures.

Runs each fixture through both the legacy closure path
(EnvelopeInterpreter_V1) and the projection path
(SemanticProjectionBuilder), computes SHA-256 hashes of the
normalized semantic state, and writes the manifest.

This manifest is the authoritative behavior signature lock
referenced in Plan 0015 Phase 1.
"""

import hashlib
import json
import sys
import os
from typing import Dict, Any

# Ensure the html-importer package is importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dual_oracle_harness import (
    DualReplayHarness,
    NormalizedSemanticState,
    normalize_closures,
    normalize_projection,
    ALL_FIXTURES,
)


def _sort_set(obj: Any) -> Any:
    """Recursively sort for deterministic serialization."""
    if isinstance(obj, set):
        return sorted(_sort_set(x) for x in obj)
    if isinstance(obj, (list, tuple)):
        return sorted(_sort_set(x) for x in obj)
    return obj


def state_to_bytes(state: NormalizedSemanticState) -> bytes:
    """Serialize a NormalizedSemanticState to deterministic bytes for hashing."""
    payload = {
        "resolved_concepts": sorted(state.resolved_concepts),
        "resolves_edges": sorted(
            [sorted(edge) for edge in state.resolves_edges]
        ),
    }
    return json.dumps(payload, sort_keys=True).encode("utf-8")


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def generate_manifest() -> Dict[str, Any]:
    harness = DualReplayHarness()
    fixtures_manifest = {}

    for fixture in ALL_FIXTURES:
        legacy_closures, projection = harness.run(fixture)

        legacy_state = normalize_closures(legacy_closures)
        projection_state = normalize_projection(projection)

        legacy_bytes = state_to_bytes(legacy_state)
        projection_bytes = state_to_bytes(projection_state)

        fixtures_manifest[fixture.name] = {
            "closure_resolved_concepts_hash": sha256(
                json.dumps(sorted(legacy_state.resolved_concepts)).encode()
            ),
            "closure_resolves_edges_hash": sha256(
                json.dumps(sorted(str(e) for e in legacy_state.resolves_edges)).encode()
            ),
            "projection_resolved_concepts_hash": sha256(
                json.dumps(sorted(projection_state.resolved_concepts)).encode()
            ),
            "projection_resolves_edges_hash": sha256(
                json.dumps(sorted(str(e) for e in projection_state.resolves_edges)).encode()
            ),
            "full_closure_hash": sha256(legacy_bytes),
            "full_projection_hash": sha256(projection_bytes),
        }

    return {
        "manifest_version": "1.0.0",
        "plan_reference": "0015-closure-deletion-playbook",
        "description": "Golden behavior signatures for closure-to-projection equivalence verification (Plan 0015 Phase 1)",
        "fixtures": fixtures_manifest,
    }


def main():
    manifest = generate_manifest()
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golden_behavior_manifest.json")
    with open(output_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
    print(f"Wrote golden_behavior_manifest.json with {len(manifest['fixtures'])} fixtures")


if __name__ == "__main__":
    main()
