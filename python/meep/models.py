"""Core data types for the MEEP pipeline.

All types that cross station boundaries are defined here.
No additional fields may be added without violating the collapse roadmap
Phase 0 freeze boundary.

These types form the contract between all 6 pipeline stations:
  1. IRL classifier   → IRLResult
  2. IR resolver      → IRSelection
  3. Spec compiler    → WorkRequestGraph
  4. Lowering pass    → ExecutionGraph
  5. Scheduler        → CEREvent / CERLog
  6. Replay engine    → ExecutionState
"""

from dataclasses import dataclass, field
from typing import Literal


# ── Station 1 + 2: IRL / IR ───────────────────────────────────────────

@dataclass
class IRLResult:
    """Probabilistic classification output from the IRL classifier.

    The classifier maps a raw prompt to a probability distribution over
    frozen InteractionArchetypes.  IRL never decides structure — it only
    proposes probability mass over IR types.
    """
    probabilities: dict[str, float]  # archetype → confidence [0.0, 1.0]
    raw_input: str
    classifier_version: str = "heuristic-v1"


@dataclass
class IRSelection:
    """Deterministic selection from IRL probabilities.

    Produced by argmax over IRL probabilities.  If the max probability
    falls below the confidence threshold, the selection is REJECT.
    """
    archetype: str
    confidence: float
    alternatives: list[str] = field(default_factory=list)


# ── Station 3: Spec Compiler ─────────────────────────────────────────

@dataclass
class WorkNode:
    """A single unit of work in a WorkRequestGraph."""
    id: str
    label: str
    archetype: str
    inputs: list[str] = field(default_factory=list)
    outputs: list[str] = field(default_factory=list)


@dataclass
class WorkEdge:
    """A dependency or trigger relationship between WorkNodes."""
    source_id: str
    target_id: str
    relation: str  # "depends_on" | "triggers" | "produces"


@dataclass
class WorkRequestGraph:
    """A directed acyclic graph of work produced by the spec compiler.

    Represents the structured decomposition of a prompt into units of
    work before the freeze boundary.
    """
    nodes: list[WorkNode] = field(default_factory=list)
    edges: list[WorkEdge] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


# ── Station 4: Lowering Pass / Freeze Boundary ────────────────────────

@dataclass
class ExecNode:
    """A frozen execution node in the lowered ExecutionGraph.

    After the freeze boundary, the handler and config are immutable.
    """
    id: str
    label: str
    handler: str  # references a registered handler function name
    config: dict = field(default_factory=dict)


class FrozenGraphError(Exception):
    """Raised when attempting to modify an ExecutionGraph after freezing."""


@dataclass
class ExecutionGraph:
    """An immutable, frozen execution graph.

    Once lowered from a WorkRequestGraph, this graph cannot be modified.
    The topological order is computed and frozen at the boundary.

    Freeze enforcement:
        ``_freeze()`` sets the internal ``_frozen`` flag.  Once frozen,
        any attempt to modify a field raises ``FrozenGraphError``.
        The ``content_hash()`` method provides a stable fingerprint that
        changes if any content field is modified.
    """
    nodes: list[ExecNode] = field(default_factory=list)
    edges: list[tuple[str, str]] = field(default_factory=list)
    topological_order: list[str] = field(default_factory=list)
    schema_version: str = "v1"
    frozen_at: str = ""  # ISO 8601 UTC timestamp
    _frozen: bool = field(default=False, repr=False)

    def _freeze(self) -> None:
        """Lock this graph — no further modifications allowed.

        Converts mutable list fields to tuples so that in-place mutations
        (``.append()``, ``.clear()``, etc.) raise ``AttributeError``.
        Field reassignment raises ``FrozenGraphError`` via ``__setattr__``.
        """
        object.__setattr__(self, "nodes", tuple(self.nodes))
        object.__setattr__(self, "edges", tuple(self.edges))
        object.__setattr__(self, "topological_order", tuple(self.topological_order))
        object.__setattr__(self, "_frozen", True)

    def __setattr__(self, name: str, value: object) -> None:
        if self._frozen and name != "_frozen":
            raise FrozenGraphError(
                f"Cannot modify frozen ExecutionGraph ({name!r})"
            )
        super().__setattr__(name, value)  # dataclass resolves to object.__setattr__

    def content_hash(self) -> str:
        """Compute a SHA-256 fingerprint of the graph's content fields.

        Returns the same hash for identical content; a different hash if
        any content field changes.
        """
        import hashlib, json
        content = json.dumps({
            "nodes": [
                {"id": n.id, "label": n.label, "handler": n.handler, "config": n.config}
                for n in self.nodes
            ],
            "edges": self.edges,
            "topological_order": self.topological_order,
            "schema_version": self.schema_version,
            "frozen_at": self.frozen_at,
        }, sort_keys=True)
        return hashlib.sha256(content.encode("utf-8")).hexdigest()


# ── Station 5: Scheduler / CER Writer ────────────────────────────────

CEREventType = Literal["NODE_START", "NODE_COMPLETE", "NODE_FAIL", "NODE_SKIP"]


@dataclass
class CEREvent:
    """A single event in the append-only CER event log.

    Each event includes a hash chain link (prev_event_hash) for tamper
    evidence.  Events are never modified, deleted, or reordered after
    being appended to the log.
    """
    event_id: str
    timestamp: str  # ISO 8601 UTC
    execution_id: str
    node_id: str
    event_type: CEREventType
    payload: dict = field(default_factory=dict)
    prev_event_hash: str = ""


class CERLog:
    """Append-only event log with hash chain integrity.

    The only allowed mutation is append().  Once appended, events are
    immutable.  The log enforces continuous hash chaining.
    """

    def __init__(self) -> None:
        self._events: list[CEREvent] = []
        self._last_hash: str = "genesis"

    @property
    def events(self) -> tuple[CEREvent, ...]:
        """Return an immutable view of the event log."""
        return tuple(self._events)

    def append(self, event: CEREvent) -> None:
        """Append a CER event to the log.

        Sets the event's prev_event_hash to the current chain head,
        then computes the new hash from the event content.
        """
        event.prev_event_hash = self._last_hash
        import hashlib, json

        content = json.dumps({
            "event_id": event.event_id,
            "timestamp": event.timestamp,
            "execution_id": event.execution_id,
            "node_id": event.node_id,
            "event_type": event.event_type,
            "payload": event.payload,
            "prev_event_hash": event.prev_event_hash,
        }, sort_keys=True)
        self._last_hash = hashlib.sha256(content.encode("utf-8")).hexdigest()
        self._events.append(event)

    @property
    def tail_hash(self) -> str:
        """The hash of the most recently appended event."""
        return self._last_hash

    def __len__(self) -> int:
        return len(self._events)


# ── Station 6: Replay Engine ─────────────────────────────────────────

NodeState = Literal["PENDING", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"]


@dataclass
class ExecutionState:
    """Reconstructed execution state from replaying a CER event log.

    Produced by the replay engine — a pure-function reducer that walks
    events in order and reconstructs state without side effects.
    """
    node_states: dict[str, NodeState] = field(default_factory=dict)
    completed_nodes: list[str] = field(default_factory=list)
    failed_nodes: list[str] = field(default_factory=list)
    event_count: int = 0
    is_complete: bool = False


# ── Frozen archetype set (Phase 0 — no additions) ────────────────────

ARCHETYPES: tuple[str, ...] = (
    "CONSTRUCTION",
    "EXECUTION",
    "REFLECTION",
    "RECONCILIATION",
    "REVISION",
    "COUNTERFACTUAL",
    "AUDIT",
    "COMPRESSION",
    "CONSTRAINT_INJECTION",
    "DEFAULT",
    "REJECT",
)

REJECT_ARCHETYPE = "REJECT"
DEFAULT_ARCHETYPE = "DEFAULT"

# Minimum confidence threshold for IR selection
MIN_CONFIDENCE_THRESHOLD = 0.4
