import sys, os
_SHARED = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if _SHARED not in sys.path:
    sys.path.insert(0, _SHARED)

from nats_envelope.envelope import CanonicalEnvelope

# SCCM write scopes — physical observation layers only
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
}

# Blindness constraints (forbidden fields per layer)
BLINDNESS = {
    "identity": ["span", "text", "embedding"],
    "losm": ["inode", "device_id"],
}

class ContractValidator:
    @staticmethod
    def validate_emission(event: CanonicalEnvelope, publisher_layer: str = None):
        layer = event.origin_component
        event_type = event.event_type

        if publisher_layer and layer != publisher_layer:
            raise ValueError(
                f"Contract Violation: Publisher tied to '{publisher_layer}' "
                f"cannot emit events for origin_component '{layer}'."
            )

        if layer not in ALLOWED_WRITES:
            raise ValueError(f"Unknown origin layer: {layer}")

        if event_type not in ALLOWED_WRITES[layer]:
            raise ValueError(
                f"Contract Violation: Layer '{layer}' is not authorized "
                f"to emit '{event_type}' events."
            )
        
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
