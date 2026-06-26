"""nats — shared NATS integration package for nexus subsystems.

Provides:
  - CanonicalEnvelope: the shared event envelope for all NATS-published events
  - Classification: governance-oriented sensitivity tags

Used by:
  - voyager (fs_crawler_v2/publisher.py)
  - cascade (nats_publisher.py, envelope_adapter.py)
  - vision (future)
  - conduit (future)
"""

from nats_envelope.envelope import CanonicalEnvelope, Classification

__all__ = ["CanonicalEnvelope", "Classification"]
