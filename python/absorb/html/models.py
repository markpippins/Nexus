from dataclasses import dataclass, asdict, field
from typing import Any, Dict, List, Literal, Optional


# ── Span types (post-CCNF-correction: zero-normalization ingress layer) ──────

SpanType = Literal[
    "STRUCTURAL",
    "DISCOURSE",
    "EVENT_CANDIDATE",
    "NOISE",
]


@dataclass
class Span:
    """Pre-CEI, pre-CCNF, fully loss-aware atomic unit of ingested text.

    Invariants:
      - ``text`` is a raw substring of the original message — never normalized.
      - No whitespace normalization. No markdown stripping.
      - Spans are non-destructive projections of the source.
      - Spans are allowed to overlap ONLY if explicitly supported (default: no).
    """

    id: str

    # Exact slice of the original message (DO NOT normalize).
    text: str
    start: int
    end: int

    span_type: SpanType
    confidence: float  # classifier confidence [0.0 – 1.0]

    # Optional markdown semantics (preserves structural role).
    markdown_role: Optional[str] = None  # e.g. "header", "list_item", "code_block"

    # Optional discourse tagging (only meaningful when span_type == DISCOURSE).
    discourse_role: Optional[str] = None  # e.g. "hedge", "framing", "emphasis", "meta"

    # Event extraction hint (pre-CCNF — the *only* spans eligible for CCNF).
    event_candidate: bool = False

    features: Dict[str, Any] = field(default_factory=dict)
    provenance: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ParserEnvelope:
    """Unit handed to INTAKE / CEI builder.

    Preserves full raw text, span decomposition, parser metadata, and
    optional early event extraction hints (NOT CCNF-normalized yet).

    Critical boundary rule:
      - Span layer: **zero normalization**.
      - Envelope layer: **zero CCNF**.
      - CCNF layer: **event-only projection downstream**.
    """

    message_id: str

    # Original untouched input.
    raw_text: str

    spans: List[Span]

    # Optional pre-CEI grouping hints (span ids).
    structural_spans: List[str] = field(default_factory=list)
    discourse_spans: List[str] = field(default_factory=list)
    event_spans: List[str] = field(default_factory=list)

    metadata: Dict[str, Any] = field(default_factory=dict)
    provenance: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    # ── Derived convenience accessors ──────────────────────────────────────

    @property
    def structural_text(self) -> str:
        """Reconstituted structural-only text (e.g. markdown islands)."""
        return "\n".join(
            s.text for s in self.spans
            if s.span_type == "STRUCTURAL" and s.id in set(self.structural_spans)
        )

    @property
    def discourse_text(self) -> str:
        """Reconstituted discourse-only text (intent modulation signals)."""
        return "\n".join(
            s.text for s in self.spans
            if s.span_type == "DISCOURSE" and s.id in set(self.discourse_spans)
        )

    @property
    def event_text(self) -> str:
        """Reconstituted event-candidate text (eligible for CCNF downstream)."""
        return "\n".join(
            s.text for s in self.spans
            if s.span_type == "EVENT_CANDIDATE" and s.id in set(self.event_spans)
        )


# ── Span observability: distribution stats and drift comparison ─────────────

@dataclass
class SpanDistribution:
    """Distribution statistics for a set of spans produced by one message.

    Used for logging and early drift detection before CEI formation.
    Tracks the classifier bias (DISCOURSE-vs-EVENT ratio), confidence
    spread, and paragraph-to-span entropy.
    """

    message_id: str
    parser_version: str

    total_spans: int
    structural_count: int
    discourse_count: int
    event_count: int
    noise_count: int

    discourse_pct: float
    event_pct: float
    structural_pct: float

    # Ratio of DISCOURSE to EVENT_CANDIDATE spans (bias indicator).
    # > 1.0 means the classifier favors DISCOURSE.
    discourse_event_ratio: float

    # Mean classifier confidence across all spans.
    mean_confidence: float

    # Paragraph-to-span entropy: how many spans per paragraph.
    # Low entropy = coarse segmentation (risk of intra-paragraph mixing).
    paragraph_count: int
    span_to_paragraph_ratio: float

    # Per-role breakdowns.
    discourse_roles: dict[str, int] = field(default_factory=dict)
    markdown_roles: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    def summary(self) -> str:
        """One-line human-readable distribution summary for logging."""
        return (
            f"[span-dist] {self.message_id} | "
            f"total={self.total_spans} "
            f"S={self.structural_pct:.0f}% "
            f"D={self.discourse_pct:.0f}% "
            f"E={self.event_pct:.0f}% "
            f"N={self.noise_count} | "
            f"D/E={self.discourse_event_ratio:.1f} "
            f"conf={self.mean_confidence:.2f} "
            f"spans/para={self.span_to_paragraph_ratio:.1f} "
            f"ver={self.parser_version}"
        )


@dataclass
class SpanDiff:
    """Difference between two sets of spans from different parser versions.

    Used for early drift detection: re-run the same raw_text through
    two parser versions and compare.
    """

    message_id: str
    version_a: str
    version_b: str

    # Span count deltas.
    total_delta: int
    structural_delta: int
    discourse_delta: int
    event_delta: int

    # How many spans changed type between versions.
    type_switches: int

    # How many spans changed boundaries (start/end positions).
    boundary_changes: int

    # Detailed per-span differences.
    added_span_ids: list[str] = field(default_factory=list)
    removed_span_ids: list[str] = field(default_factory=list)
    switched_spans: list[dict[str, str]] = field(default_factory=list)

    def is_stable(self) -> bool:
        """Return True if the classifier output is stable across versions."""
        return self.type_switches == 0 and self.event_delta == 0

    def to_dict(self) -> dict:
        return asdict(self)

    def summary(self) -> str:
        """One-line human-readable drift summary."""
        stable = "STABLE" if self.is_stable() else "DRIFT"
        return (
            f"[span-drift] {self.message_id} "
            f"{self.version_a}→{self.version_b} | "
            f"{stable} | "
            f"Δtotal={self.total_delta:+d} "
            f"Δstruct={self.structural_delta:+d} "
            f"Δdisc={self.discourse_delta:+d} "
            f"Δevent={self.event_delta:+d} "
            f"switches={self.type_switches} "
            f"boundary={self.boundary_changes}"
        )


TimestampConfidence = Literal["high", "medium", "low", "none"]
TimestampSource = Literal["dom", "embedded_json", "file_metadata", "synthetic"]


@dataclass
class TimestampInfo:
    """Timestamp provenance for a normalized message."""

    value: str | None = None
    confidence: TimestampConfidence = "none"
    source: TimestampSource = "synthetic"
    raw_value: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    def __str__(self) -> str:
        if self.value:
            return f"{self.value} ({self.confidence}, from {self.source})"
        return "no timestamp"


@dataclass
class ImageReference:
    """A reference to an image associated with a normalized message.

    Attributes:
        name: Human-readable filename (e.g. "image-1.jpg", "image-2.png").
              Sequential numbering per source file, starting at 1.
        saved: Whether the image file has been manually saved to the
               images/ folder for this source file.
        original_src: The original src attribute or data URI from the HTML.
    """

    name: str
    saved: bool = False
    original_src: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)

    def __str__(self) -> str:
        status = "saved" if self.saved else "missing"
        return f"[{status}] {self.name}"


@dataclass
class ConversationMetadata:
    """Conversation-level metadata extracted once per HTML file."""

    conversation_id: str | None = None
    title: str | None = None
    create_time: str | None = None
    update_time: str | None = None
    model: str | None = None
    export_source: str | None = None
    presentation_artifacts_removed: bool = True
    ccnf_normalized: bool = True

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class NormalizedMessage:
    """A normalized chat message extracted from an HTML transcript."""

    message_id: str
    speaker: str          # "user" or "assistant"
    timestamp: TimestampInfo
    text: str
    turn_index: int       # 0-based turn number (user+assistant pair share same turn)
    raw_html_ref: str     # A reference/selector into the source HTML for traceability
    image_references: list[ImageReference] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d

    DISPLAY_LIMIT = 120
    REF_LIMIT = 80

    def __str__(self) -> str:
        ts = str(self.timestamp)
        text = self.text
        if len(text) > self.DISPLAY_LIMIT:
            text = text[: self.DISPLAY_LIMIT] + "..."
        ref = self.raw_html_ref
        if len(ref) > self.REF_LIMIT:
            ref = ref[: self.REF_LIMIT] + "..."
        lines = (
            f"[Turn {self.turn_index}] {self.speaker} ({ts})\n"
            f"  ID: {self.message_id}\n"
            f"  Ref: {ref}\n"
            f"  Text: {text}"
        )
        if self.image_references:
            img_lines = "\n".join(f"  Image: {img}" for img in self.image_references)
            lines += f"\n  Images:\n{img_lines}"
        return lines
