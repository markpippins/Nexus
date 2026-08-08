"""
Voyager → Semantics adapter — bridges the Voyager filesystem acquisition layer
(NATS nexus.fs.v1.* subjects) to the semantics.source_observation canonical
provenance home (T02/T03 bridge).

Subscribes to:
  - nexus.fs.v1.observation  → semantics.source_observation rows
  - nexus.fs.v1.hint         → semantics.asset_identity_claim rows
  - nexus.fs.v1.span         → metadata updates on existing observations

Runs standalone — no direct Voyager dependency. Falls back to a logger/stub
mode when NATS is unavailable so the code path stays testable.
"""
