from typing import List, Dict, Set
import sys, os
_SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "python"))
if _SHARED not in sys.path:
    sys.path.insert(0, _SHARED)
from nats_envelope.envelope import CanonicalEnvelope

# Defined in SCCM (System Capability Contract Matrix)
ALLOWED_WRITES = {
    "fs-crawler": {
        "FileObservation",
        "DirectoryObservation",
        "FileDeleted",
        "ObservationEdgeHint",
        "MetadataSpanEmitted",
    },
    "topology": {
        "TopologySignal",
    },
    "identity": {
        "IdentityCandidate",
        "Entity",
        "EntityDrift",
    },
    "losm": {
        "RequirementCandidate",
    },
}

# Blindness constraints (Forbidden fields or patterns per layer)
BLINDNESS = {
    "identity": ["span", "text", "embedding"], # Identity must not see semantic content
    "losm": ["inode", "device_id"] # LOSM should not care about physical invariants
}

class ContractValidator:
    @staticmethod
    def validate_emission(event: CanonicalEnvelope, publisher_layer: str = None):
        """
        Enforces SCCM write scopes and blindness constraints. 
        Ensures the origin_layer is authorized to emit the specific event_type.
        """
        layer = event.origin_component
        event_type = event.event_type

        # 1. Enforce that the publisher is authorized for this layer
        if publisher_layer and layer != publisher_layer:
            raise ValueError(
                f"Contract Violation: Publisher tied to '{publisher_layer}' "
                f"cannot emit events for origin_component '{layer}'."
            )

        # 2. Enforce layer-to-event authorization (Write Scope)
        if layer not in ALLOWED_WRITES:
            raise ValueError(f"Unknown origin layer: {layer}")

        if event_type not in ALLOWED_WRITES[layer]:
            raise ValueError(
                f"Contract Violation: Layer '{layer}' is not authorized "
                f"to emit '{event_type}' events."
            )
        
        # 3. Enforce Blindness Constraints (Cognitive Privilege Boundary)
        # Check if the emitting layer accidentally leaked forbidden info into the payload
        if layer in BLINDNESS:
            forbidden_keys = BLINDNESS[layer]
            payload_str = str(event.payload).lower()
            for key in forbidden_keys:
                if key in payload_str:
                     raise ValueError(
                        f"Contract Violation: Layer '{layer}' violated blindness "
                        f"constraint for key '{key}' in payload."
                    )

        return True
