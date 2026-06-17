import os
import re
import sys
import unicodedata
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path

from models import (
    NormalizedMessage, TimestampInfo, ConversationMetadata,
    Span, SpanType, ParserEnvelope,
    SpanDistribution, SpanDiff,
)


class BaseParser(ABC):
    """Abstract base class for HTML chat transcript parsers.

    Subclass this to add support for a new chat source (ChatGPT, Copilot, etc.).
    Each subclass must implement `can_handle`, `parse`, and `extract_metadata`.
    """

    @abstractmethod
    def can_handle(self, doc, source_path: Path) -> bool:
        """Return True if this parser can handle the given document.

        Args:
            doc: A DoclingDocument (or None for non-DocLing sources like raw markdown).
            source_path: Path to the source file.
        """
        ...

    @abstractmethod
    def parse(self, doc, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        """Extract NormalizedMessages from the parsed document.

        Args:
            doc: A DoclingDocument (or None for non-DocLing sources).
            source_path: Path to the source file.
            metadata: ConversationMetadata already extracted for this file.
        """
        ...

    @abstractmethod
    def extract_metadata(self, doc, source_path: Path) -> ConversationMetadata:
        """Extract conversation-level metadata from the document (called once per file)."""
        ...

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Human-readable name for this parser (e.g. 'ChatGPT', 'Copilot')."""
        ...

    # ------------------------------------------------------------------
    # Envelope pipeline (span-based, zero-normalization ingress)
    # ------------------------------------------------------------------

    # ── Span segmenter: markdown structure patterns ─────────────────────────

    # Code fence: ``` or ~~~
    _CODE_FENCE = re.compile(r"^```|^~~~", re.MULTILINE)

    # ATX header: leading # (1-6)
    _MARKDOWN_HEADER = re.compile(r"^#{1,6}\s", re.MULTILINE)

    # Unordered list item: -, *, +
    _MARKDOWN_LIST = re.compile(r"^\s*[-*+]\s", re.MULTILINE)

    # Ordered list item: 1. 2. etc.
    _MARKDOWN_OLIST = re.compile(r"^\s*\d+[\.\)]\s", re.MULTILINE)

    # Blockquote: >
    _BLOCKQUOTE = re.compile(r"^>\s?", re.MULTILINE)

    # Horizontal rule: ---, ***, ___
    _HR_PATTERN = re.compile(r"^[-*_]{3,}\s*$", re.MULTILINE)

    # ── Discourse patterns (intent modulation signals) ──────────────────────

    _DISCOURSE_HEDGE = re.compile(
        r"\b(I think|I believe|it seems|maybe|perhaps|possibly|"
        r"I'm not sure|I guess|probably|likely)\b",
        re.IGNORECASE,
    )

    _DISCOURSE_FRAMING = re.compile(
        r"^(here's|here is|what happened|the idea is|the key|"
        r"let me|I'll|I will|I want to|we'll|we will|before we|now)",
        re.IGNORECASE,
    )

    _DISCOURSE_EMPHASIS = re.compile(
        r"\b(this is important|crucially|the key|critical|essential|"
        r"note that|importantly|significantly)\b",
        re.IGNORECASE,
    )

    _DISCOURSE_META = re.compile(
        r"\b(to clarify|in other words|that is|i\.e\.|e\.g\.|"
        r"specifically|in particular|for example|for instance)\b",
        re.IGNORECASE,
    )

    # ── Classifier-helpers (deterministic-first) ──────────────────────────

    @staticmethod
    def _classify_discourse_role(text: str) -> str | None:
        """Tag a text span with its discourse role, if any."""
        if BaseParser._DISCOURSE_HEDGE.search(text):
            return "hedge"
        if BaseParser._DISCOURSE_EMPHASIS.search(text):
            return "emphasis"
        if BaseParser._DISCOURSE_FRAMING.search(text):
            return "framing"
        if BaseParser._DISCOURSE_META.search(text):
            return "meta"
        return None

    @staticmethod
    def _classify_markdown_role(text: str) -> str | None:
        """Tag a text span with its markdown structural role, if any."""
        if BaseParser._CODE_FENCE.search(text):
            return "code_block"
        if BaseParser._MARKDOWN_HEADER.search(text):
            return "header"
        if BaseParser._MARKDOWN_LIST.search(text):
            return "list_item"
        if BaseParser._MARKDOWN_OLIST.search(text):
            return "ordered_list_item"
        if BaseParser._BLOCKQUOTE.search(text):
            return "blockquote"
        if BaseParser._HR_PATTERN.match(text.strip()):
            return "horizontal_rule"
        return None

    @staticmethod
    def _classify_span_type(
        text: str,
        has_markdown: bool,
        has_discourse: bool,
    ) -> SpanType:
        """Classify a text segment into a SpanType.

        Priority: STRUCTURAL > EVENT_CANDIDATE > DISCOURSE > NOISE.
        A segment that carries markdown structure is always STRUCTURAL.
        Default fallback is DISCOURSE: most conversational text is discourse,
        not events. EVENT_CANDIDATE is reserved for text that is likely
        a fact, assertion, or state transition.
        """
        if has_markdown:
            return "STRUCTURAL"
        if not text.strip():
            return "NOISE"
        # Text with discourse markers is always DISCOURSE.
        if has_discourse:
            return "DISCOURSE"
        # Short declarative text without discourse markers may be an event
        # (fact / assertion / command). Longer text defaults to DISCOURSE.
        if not has_discourse and len(text) < 500:
            # Check for event-like patterns: imperatives, identifiers, timestamps
            if BaseParser._looks_eventish(text):
                return "EVENT_CANDIDATE"
            return "DISCOURSE"
        return "DISCOURSE"

    # ── Event-ish heuristics ───────────────────────────────────────────────

    _EVENT_ISH = re.compile(
        r"(create|update|delete|remove|add|change|set|configure|"
        r"deploy|build|run|execute|validate|test|emit|publish)",
        re.IGNORECASE,
    )

    @staticmethod
    def _looks_eventish(text: str) -> bool:
        """Return True if the text looks like a fact, command, or assertion."""
        return bool(BaseParser._EVENT_ISH.search(text))

    @staticmethod
    def _segment_text(
        raw_text: str,
        message_id: str,
        parser_version: str,
    ) -> list[Span]:
        """Segment raw text into typed spans with zero normalization.

        This is the deterministic-first ingress classifier. It never modifies
        the text — it only partitions and labels.

        Returns spans that cover the full raw_text with no gaps (except
        trailing whitespace-only NOISE segments that may be coalesced).
        """
        spans: list[Span] = []
        span_counter = 0

        # Split on double+ newline boundaries (paragraph-level segments).
        # Single newlines within a paragraph are preserved as-is.
        paragraphs = re.split(r"(\n{2,})", raw_text)

        pos = 0
        para_iter = iter(paragraphs)
        for para in para_iter:
            # Get the separator that follows this paragraph (if any)
            try:
                sep = next(para_iter)
            except StopIteration:
                sep = ""

            if not para.strip():
                pos += len(para) + len(sep)
                continue

            start = pos
            end = start + len(para)

            has_markdown = BaseParser._classify_markdown_role(para) is not None
            has_discourse = BaseParser._classify_discourse_role(para) is not None

            span_type = BaseParser._classify_span_type(para, has_markdown, has_discourse)
            span_id = f"{message_id}-span-{span_counter}"
            span_counter += 1

            span = Span(
                id=span_id,
                text=para,  # raw — never normalized
                start=start,
                end=end,
                span_type=span_type,
                confidence=0.85,  # deterministic-first, high baseline
                markdown_role=BaseParser._classify_markdown_role(para),
                discourse_role=BaseParser._classify_discourse_role(para) if span_type == "DISCOURSE" else None,
                event_candidate=(span_type == "EVENT_CANDIDATE"),
                features={
                    "char_count": len(para),
                    "line_count": para.count("\n") + 1,
                },
                provenance={
                    "source_message_id": message_id,
                    "parser_version": parser_version,
                    "segmenter": "BaseParser._segment_text",
                },
            )
            spans.append(span)
            pos = end + len(sep)

            return spans

    @staticmethod
    def _compute_span_stats(
        spans: list[Span],
        message_id: str,
        parser_version: str,
        paragraph_count: int,
    ) -> SpanDistribution:
        """Compute distribution statistics for a set of spans.

        Tracks classifier bias (DISCOURSE-vs-EVENT ratio), confidence
        spread, and paragraph-to-span entropy for early drift detection.
        """
        total = len(spans)
        if total == 0:
            return SpanDistribution(
                message_id=message_id, parser_version=parser_version,
                total_spans=0, structural_count=0, discourse_count=0,
                event_count=0, noise_count=0,
                discourse_pct=0.0, event_pct=0.0, structural_pct=0.0,
                discourse_event_ratio=0.0, mean_confidence=0.0,
                paragraph_count=paragraph_count, span_to_paragraph_ratio=0.0,
            )

        s_count = sum(1 for s in spans if s.span_type == "STRUCTURAL")
        d_count = sum(1 for s in spans if s.span_type == "DISCOURSE")
        e_count = sum(1 for s in spans if s.span_type == "EVENT_CANDIDATE")
        n_count = sum(1 for s in spans if s.span_type == "NOISE")

        # Role breakdowns.
        discourse_roles: dict[str, int] = {}
        markdown_roles: dict[str, int] = {}
        for s in spans:
            if s.discourse_role:
                discourse_roles[s.discourse_role] = discourse_roles.get(s.discourse_role, 0) + 1
            if s.markdown_role:
                markdown_roles[s.markdown_role] = markdown_roles.get(s.markdown_role, 0) + 1

        mean_conf = sum(s.confidence for s in spans) / total

        return SpanDistribution(
            message_id=message_id,
            parser_version=parser_version,
            total_spans=total,
            structural_count=s_count,
            discourse_count=d_count,
            event_count=e_count,
            noise_count=n_count,
            discourse_pct=(d_count / total) * 100,
            event_pct=(e_count / total) * 100,
            structural_pct=(s_count / total) * 100,
            discourse_event_ratio=(d_count / e_count) if e_count > 0 else float("inf"),
            mean_confidence=mean_conf,
            paragraph_count=paragraph_count,
            span_to_paragraph_ratio=(total / paragraph_count) if paragraph_count > 0 else 0.0,
            discourse_roles=discourse_roles,
            markdown_roles=markdown_roles,
        )

    @staticmethod
    def diff_spans(
        spans_a: list[Span],
        spans_b: list[Span],
        message_id: str,
        version_a: str,
        version_b: str,
    ) -> SpanDiff:
        """Compare two sets of spans from different parser versions.

        Detects type switches, boundary changes, and added/removed spans.
        Used for early drift detection: re-run the same input through two
        parser versions and compare.

        **Matching limitation:** Spans are matched by their ``id`` field.
        Since ``_segment_text`` generates sequential IDs (``msg-N-span-M``),
        a segmentation change that inserts/removes an early span will shift
        all subsequent IDs and may inflate the reported type-switch count.
        For precise drift analysis, match by text content + position range
        instead of by ID.

        Args:
            spans_a: Spans produced by parser version_a.
            spans_b: Spans produced by parser version_b.
            message_id: Shared message identifier.
            version_a: First parser version label.
            version_b: Second parser version label.

        Returns:
            SpanDiff with deltas, type switches, and boundary changes.
        """
        def _count(spans, st):
            return sum(1 for s in spans if s.span_type == st)

        a_map = {s.id: s for s in spans_a}
        b_map = {s.id: s for s in spans_b}

        a_ids = set(a_map.keys())
        b_ids = set(b_map.keys())

        added = list(b_ids - a_ids)
        removed = list(a_ids - b_ids)
        switched: list[dict[str, str]] = []
        boundary_changes = 0

        # Type switches: same span id, different span_type.
        for sid in a_ids & b_ids:
            sa = a_map[sid]
            sb = b_map[sid]
            if sa.span_type != sb.span_type:
                switched.append({
                    "span_id": sid,
                    "from": sa.span_type,
                    "to": sb.span_type,
                })
            if sa.start != sb.start or sa.end != sb.end:
                boundary_changes += 1

        return SpanDiff(
            message_id=message_id,
            version_a=version_a,
            version_b=version_b,
            total_delta=len(spans_b) - len(spans_a),
            structural_delta=_count(spans_b, "STRUCTURAL") - _count(spans_a, "STRUCTURAL"),
            discourse_delta=_count(spans_b, "DISCOURSE") - _count(spans_a, "DISCOURSE"),
            event_delta=_count(spans_b, "EVENT_CANDIDATE") - _count(spans_a, "EVENT_CANDIDATE"),
            type_switches=len(switched),
            boundary_changes=boundary_changes,
            added_span_ids=added,
            removed_span_ids=removed,
            switched_spans=switched,
        )

    def parse_to_envelope(
        self,
        raw_text: str,
        message_id: str,
        parser_version: str | None = None,
        extra_metadata: dict | None = None,
        extra_provenance: dict | None = None,
    ) -> ParserEnvelope:
        """Produce a ParserEnvelope from raw extracted text.

        This is the primary output path for parsers. Subclasses should call
        this after extracting raw text from the DOM/markdown, passing the
        raw (unnormalized) text and any source-specific metadata.

        The envelope preserves:
          - raw_text verbatim
          - span decomposition (STRUCTURAL / DISCOURSE / EVENT_CANDIDATE / NOISE)
          - parser provenance for CEI drift tracking

        CCNF normalization is deliberately NOT applied here — it belongs
        downstream, only on EVENT_CANDIDATE spans.
        """
        pv = parser_version or "base_parser_v1"

        spans = self._segment_text(raw_text, message_id, pv)

        # ── Span distribution logging (observability / early drift detection) ──
        para_count = sum(1 for p in re.split(r"\n{2,}", raw_text) if p.strip())
        stats = self._compute_span_stats(spans, message_id, pv, para_count)
        envelope_metadata = extra_metadata or {}
        if envelope_metadata.get("verbose", False):
            print(stats.summary(), file=sys.stderr, flush=True)
            if stats.discourse_roles:
                print(f"[span-dist]   discourse_roles={stats.discourse_roles}", file=sys.stderr, flush=True)
            if stats.markdown_roles:
                print(f"[span-dist]   markdown_roles={stats.markdown_roles}", file=sys.stderr, flush=True)
            # Thresholds: D/E > 3.0 = classifier heavily biased toward DISCOURSE;
            # spans/para < 1.2 with >3 spans = paragraph-level segmentation is
            # too coarse, risking intra-paragraph type mixing.
            if stats.discourse_event_ratio > 3.0:
                print(
                    f"[span-dist]   ⚠ DISCOURSE bias: D/E={stats.discourse_event_ratio:.1f} "
                    f"(classifier may be under-classifying events)",
                    file=sys.stderr, flush=True,
                )
            if stats.span_to_paragraph_ratio < 1.2 and stats.total_spans > 3:
                print(
                    f"[span-dist]   ⚠ coarse segmentation: spans/para={stats.span_to_paragraph_ratio:.1f} "
                    f"(risk of intra-paragraph type mixing)",
                    file=sys.stderr, flush=True,
                )

        structural_ids = [s.id for s in spans if s.span_type == "STRUCTURAL"]
        discourse_ids = [s.id for s in spans if s.span_type == "DISCOURSE"]
        event_ids = [s.id for s in spans if s.span_type == "EVENT_CANDIDATE"]

        metadata = {
            "parser_version": pv,
            "ccnf_version": None,  # CCNF not applied at this layer
            "span_model_version": "v1",
            "loss_profile": {
                "structural_preserved": True,
                "discourse_preserved": True,
                "event_extracted": True,
            },
            **(extra_metadata or {}),
        }

        provenance = {
            "source_name": self.source_name,
            "parser_version": pv,
            **(extra_provenance or {}),
        }

        return ParserEnvelope(
            message_id=message_id,
            raw_text=raw_text,
            spans=spans,
            structural_spans=structural_ids,
            discourse_spans=discourse_ids,
            event_spans=event_ids,
            metadata=metadata,
            provenance=provenance,
        )

    # ------------------------------------------------------------------
    # CCNF-aligned text normalization (presentation → semantic)
    # ------------------------------------------------------------------

    # Zero-width characters that carry no semantic meaning
    _ZERO_WIDTH_CHARS = re.compile("[\u200b\u200c\u200d\u2060\u2061\u2062\u2063\u2064\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e]")

    # Non-breaking spaces that should normalize to U+0020
    _NBSP_PATTERN = re.compile("[\u00a0\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000]")

    # Horizontal rule / separator artifacts (visual-only dividers)
    _HORIZONTAL_RULE = re.compile(r"^[-*_]{3,}\s*$", re.MULTILINE)

    # Model signature boilerplate patterns — stripped from text content.
    # These are presentation artifacts, not user conversational content.
    _BOILERPLATE_PATTERNS: list[re.Pattern] = [
        # ChatGPT-style introductions (no DOTALL — confined to single line)
        re.compile(r"^(I'm|I am|As an?)\s+(ChatGPT|AI|artificial intelligence|language model|large language model|LLM|assistant|AI assistant|helpful assistant)[^.!]*[.!]\s*", re.IGNORECASE),
        # Sign-off: "Let me know if you have any..." / "Feel free to ask..."
        re.compile(r"\s*(Let me know|Feel free to|Please let me know|Happy to help|I hope this helps|Reach out|Don't hesitate).*?(questions|concerns|help|clarification).*?[.!]\s*$", re.IGNORECASE | re.DOTALL),
        # "I've created/updated/modified..." self-referential action summaries (Copilot, no DOTALL)
        re.compile(r"^(I've|I have)\s+(created|updated|modified|generated|built|written|made|prepared|set up|implemented|developed)[^.!]*?(for you|the file|the code)[^.!]*[.!]\s*", re.IGNORECASE),
        # Verification trailing: "Is there anything else..." / "Would you like me to..."
        re.compile(r"\s*(Is there anything else|Would you like me to|Can I help you with|Do you want me to).*?(help you|need|else).*?[?!]?\s*$", re.IGNORECASE | re.DOTALL),
    ]

    @staticmethod
    def normalize_text(text: str) -> str:
        """Strip presentation artifacts, producing CCNF-clean semantic content.

        Applies in order:
        1. NFC unicode normalization
        2. Zero-width character removal
        3. Non-breaking-space → regular space
        4. BOM removal
        5. Whitespace collapse (preserving intentional paragraph breaks)
        6. Trim leading/trailing whitespace
        7. Model boilerplate stripping
        8. Horizontal rule removal

        This is idempotent: normalize_text(normalize_text(t)) == normalize_text(t).
        """
        if not text:
            return ""

        # Step 1: NFC normalization (per CCNF §6 — ingress normalization)
        normalized = unicodedata.normalize("NFC", text)

        # Step 2: Strip zero-width characters
        normalized = BaseParser._ZERO_WIDTH_CHARS.sub("", normalized)

        # Step 3: Replace non-breaking spaces with regular space (U+0020)
        normalized = BaseParser._NBSP_PATTERN.sub(" ", normalized)

        # Step 4: Strip BOM if present
        normalized = normalized.replace("\ufeff", "")

        # Step 5: Whitespace collapse — single newlines preserved as paragraph breaks,
        #         runs of spaces/tabs collapsed to single space
        normalized = BaseParser._collapse_whitespace(normalized)

        # Step 6: Trim edges
        normalized = normalized.strip()

        # Step 7: Strip model boilerplate
        normalized = BaseParser.strip_boilerplate(normalized)

        # Step 8: Remove standalone horizontal rules (visual-only separators)
        normalized = BaseParser._HORIZONTAL_RULE.sub("", normalized)
        normalized = normalized.strip()

        return normalized

    @staticmethod
    def strip_boilerplate(text: str) -> str:
        """Remove model signature boilerplate from text.

        Only strips when the boilerplate appears at the start or end
        of the text block. Mid-message occurrences are preserved.
        """
        for pattern in BaseParser._BOILERPLATE_PATTERNS:
            text = pattern.sub("", text)
        return text.strip()

    @staticmethod
    def _collapse_whitespace(text: str) -> str:
        """Collapse runs of whitespace while preserving paragraph breaks.

        - Single newlines → preserved (separate paragraphs/sections)
        - 2+ consecutive newlines → single newline
        - Horizontal tabs → space
        - Runs of horizontal spaces → single space (within each line)
        - Leading/trailing whitespace stripped from each line

        Per CCNF Failure Modes §6: "Internal whitespace collapsed to single space (U+0020)"
        """
        # Normalize line endings
        text = text.replace("\r\n", "\n").replace("\r", "\n")

        # Replace tabs with spaces
        text = text.replace("\t", " ")

        # Collapse spaces on each line
        lines = text.split("\n")
        collapsed = []
        for line in lines:
            stripped = re.sub(r"  +", " ", line).strip()
            collapsed.append(stripped)

        # Rejoin, then collapse 2+ consecutive newlines to single
        result = "\n".join(collapsed)
        result = re.sub(r"\n{2,}", "\n", result)

        return result

    # ------------------------------------------------------------------
    # Shared utilities
    # ------------------------------------------------------------------

    @staticmethod
    def file_timestamp(path: Path) -> TimestampInfo:
        """Create a TimestampInfo from the file's modification time.

        Confidence is 'low' since this is the filesystem mtime, not a
        server-side creation time.
        """
        try:
            mtime = os.path.getmtime(path)
            dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
            iso = dt.isoformat()
            return TimestampInfo(
                value=iso,
                confidence="low",
                source="file_metadata",
                raw_value=iso,
            )
        except OSError:
            return TimestampInfo()

    @staticmethod
    def dom_timestamp_to_info(dom_value: str | None) -> TimestampInfo:
        """Wrap a DOM-extracted timestamp string into TimestampInfo."""
        if not dom_value:
            return TimestampInfo()
        return TimestampInfo(
            value=dom_value,
            confidence="high",
            source="dom",
            raw_value=dom_value,
        )

    @staticmethod
    def json_timestamp_to_info(json_value: str | None) -> TimestampInfo:
        """Wrap an embedded-JSON timestamp string into TimestampInfo."""
        if not json_value:
            return TimestampInfo()
        return TimestampInfo(
            value=json_value,
            confidence="medium",
            source="embedded_json",
            raw_value=json_value,
        )

    # ------------------------------------------------------------------
    # Image extraction utilities (DocLing-based)
    # ------------------------------------------------------------------

    @staticmethod
    def extract_images_from_document(doc) -> list[dict]:
        """Extract image references from a DoclingDocument.

        Args:
            doc: A DoclingDocument with a ``pictures`` iterable.

        Returns:
            A list of dicts with ``name`` and ``original_src`` for each image.
        """
        from docling_adapter import DoclingAdapter
        return DoclingAdapter.extract_images(doc)


# Registry of all available parsers — populated at import time.
_parser_registry: list[type[BaseParser]] = []


def register_parser(cls: type[BaseParser]) -> type[BaseParser]:
    """Decorator to register a parser subclass automatically."""
    _parser_registry.append(cls)
    return cls


def get_parsers() -> list[BaseParser]:
    """Return instantiated list of all registered parsers.

    Lazily imports the ``parsers`` package on first call if the registry
    is empty. This ensures parsers are auto-discovered even when
    ``detect_and_parse`` is imported without an explicit ``import parsers``.
    """
    if not _parser_registry:
        try:
            import parsers  # noqa: F401 — triggers @register_parser decorators
        except ImportError:
            pass
    return [cls() for cls in _parser_registry]


def _fallback_parse_from_docling(
    doc, source_path: Path
) -> tuple[list[NormalizedMessage], ConversationMetadata]:
    """Last-resort fallback that infers speaker turns from DocLing document structure.

    Tries three strategies in order:

    1. **Section header detection** — Scan ``doc.texts`` for items with
       ``label=section_header`` that contain known speaker patterns
       ("You said:" = user, "ChatGPT said:" = assistant). Group consecutive
       text items between these headers into messages.

    2. **Markdown bold label detection** — Scan the markdown output for
       lines matching ``**Label:**`` or ``**Label**:`` patterns (the same
       patterns the standard parsers look for). If found, parse alternating
       user/assistant turns.

    3. **Single message fallback** — If nothing else works, return the
       entire document text as a single assistant message (useful for
       downstream processing that expects at least one message).

    This is invoked by ``detect_and_parse`` when no registered parser
    can handle the file.
    """
    file_ts = BaseParser.file_timestamp(source_path)
    meta = ConversationMetadata(
        title=source_path.stem,
        export_source="fallback",
        create_time=file_ts.value,
    )

    # ── Phase 1: DocLing section header detection ────────────────────────
    if doc is not None:
        messages = _fallback_phase1_section_headers(doc, source_path, meta)
        if messages:
            print(
                f"[html-importer] Fallback (phase 1 — section headers): "
                f"{len(messages)} messages from {source_path.name}",
                file=sys.stderr, flush=True,
            )
            meta.export_source = "fallback-section-headers"
            return messages, meta

        # ── Phase 2: Markdown bold label patterns ────────────────────────
        messages = _fallback_phase2_markdown_labels(doc, source_path, meta)
        if messages:
            print(
                f"[html-importer] Fallback (phase 2 — markdown labels): "
                f"{len(messages)} messages from {source_path.name}",
                file=sys.stderr, flush=True,
            )
            meta.export_source = "fallback-markdown-labels"
            return messages, meta

    # ── Phase 3: Single message fallback ─────────────────────────────────
    # If the document has any meaningful text, return it as a single message
    text = _fallback_get_all_text(doc, source_path)
    if text:
        print(
            f"[html-importer] Fallback (phase 3 — single message): "
            f"1 message from {source_path.name}",
            file=sys.stderr, flush=True,
        )
        meta.export_source = "fallback-single"
        messages = [
            NormalizedMessage(
                message_id="fallback-msg-0",
                speaker="assistant",
                timestamp=file_ts,
                text=text,
                turn_index=0,
                raw_html_ref=f"{source_path.name}:fallback",
            )
        ]
        return messages, meta

    return [], meta


# ── Fallback phase helpers ──────────────────────────────────────────────────

# Speaker patterns to detect in DocLing section_header items
_SECTION_SPEAKER_PATTERNS: list[tuple[re.Pattern, str]] = [
    (re.compile(r'You said', re.IGNORECASE), 'user'),
    (re.compile(r'User said', re.IGNORECASE), 'user'),
    (re.compile(r'ChatGPT said', re.IGNORECASE), 'assistant'),
    (re.compile(r'Assistant said', re.IGNORECASE), 'assistant'),
    (re.compile(r'Copilot said', re.IGNORECASE), 'assistant'),
    (re.compile(r'Gemini said', re.IGNORECASE), 'assistant'),
]

# Markdown bold label patterns for Phase 2 (same patterns standard parsers use)
_MARKDOWN_SPEAKER_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Match **Label:**, **Label**:, or **Label** (colon inside, after, or without bold markers)
    (re.compile(r'^\*\*User(?:\*\*:|:\*\*|\*\*)\s*'), 'user'),
    (re.compile(r'^\*\*You(?:\*\*:|:\*\*|\*\*)\s*'), 'user'),
    (re.compile(r'^\*\*ChatGPT(?:\*\*:|:\*\*|\*\*)\s*'), 'assistant'),
    (re.compile(r'^\*\*Assistant(?:\*\*:|:\*\*|\*\*)\s*'), 'assistant'),
    (re.compile(r'^\*\*Copilot(?:\*\*:|:\*\*|\*\*)\s*'), 'assistant'),
    (re.compile(r'^\*\*Gemini(?:\*\*:|:\*\*|\*\*)\s*'), 'assistant'),
]


def _fallback_phase1_section_headers(
    doc, source_path: Path, meta: ConversationMetadata
) -> list[NormalizedMessage]:
    """Phase 1: Use DocLing section_header items to detect speaker turns.

    ChatGPT web UI HTML produces ``section_header`` items like
    "You said:" and "ChatGPT said:" through DocLing conversion.
    We collect consecutive text items between these headers.
    """
    texts = list(doc.texts)
    if not texts:
        return []

    # Find section headers that match speaker patterns
    # Map (index_in_texts, speaker_role)
    boundaries: list[tuple[int, str]] = []
    for i, item in enumerate(texts):
        label = getattr(item, 'label', None)
        item_text = getattr(item, 'text', '')
        if label == 'section_header':
            for pattern, role in _SECTION_SPEAKER_PATTERNS:
                if pattern.search(item_text):
                    boundaries.append((i, role))
                    break

    if len(boundaries) < 1:
        return []

    file_ts = BaseParser.file_timestamp(source_path)
    messages: list[NormalizedMessage] = []

    for b_idx, (start_idx, speaker) in enumerate(boundaries):
        # Determine end: next boundary or end of texts
        if b_idx + 1 < len(boundaries):
            end_idx = boundaries[b_idx + 1][0]
        else:
            end_idx = len(texts)

        # Collect text items between this header and the next
        text_parts: list[str] = []
        for i in range(start_idx + 1, end_idx):
            item = texts[i]
            label = getattr(item, 'label', None)
            item_text = getattr(item, 'text', '')
            # Skip other section headers (non-speaker headers inside message)
            if label == 'section_header':
                is_speaker = any(p.search(item_text) for p, _ in _SECTION_SPEAKER_PATTERNS)
                if is_speaker:
                    continue
            # Include text from content items
            if item_text and not item_text.isspace():
                text_parts.append(item_text)

        text = '\n'.join(text_parts)
        # Normalize whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        if text:
            messages.append(NormalizedMessage(
                message_id=f"fallback-msg-{len(messages)}",
                speaker=speaker,
                timestamp=file_ts,
                text=text,
                turn_index=len(messages),
                raw_html_ref=f"{source_path.name}:section-{start_idx}",
            ))

    return messages


def _fallback_phase2_markdown_labels(
    doc, source_path: Path, meta: ConversationMetadata
) -> list[NormalizedMessage]:
    """Phase 2: Scan markdown output for bold speaker label patterns.

    Looks for lines matching ``**Label:**`` or ``**Label**:`` patterns
    and parses alternating user/assistant turns.
    """
    md = doc.export_to_markdown()
    lines = md.split('\n')

    file_ts = BaseParser.file_timestamp(source_path)
    messages: list[NormalizedMessage] = []
    current_speaker: str | None = None
    current_parts: list[str] = []

    for line in lines:
        stripped = line.strip()
        matched = False
        for pattern, role in _MARKDOWN_SPEAKER_PATTERNS:
            m = pattern.match(stripped)
            if m:
                # Save previous message
                if current_speaker and current_parts:
                    text = ' '.join(current_parts).strip()
                    if text:
                        messages.append(NormalizedMessage(
                            message_id=f"fallback-md-msg-{len(messages)}",
                            speaker=current_speaker,
                            timestamp=file_ts,
                            text=text,
                            turn_index=len(messages),
                            raw_html_ref=f"{source_path.name}:md-line",
                        ))

                # Start new message
                current_speaker = role
                rest = stripped[m.end():]
                current_parts = [rest] if rest else []
                matched = True
                break

        if not matched and current_speaker:
            if stripped:
                current_parts.append(stripped)

    # Flush last message
    if current_speaker and current_parts:
        text = ' '.join(current_parts).strip()
        if text:
            messages.append(NormalizedMessage(
                message_id=f"fallback-md-msg-{len(messages)}",
                speaker=current_speaker,
                timestamp=file_ts,
                text=text,
                turn_index=len(messages),
                raw_html_ref=f"{source_path.name}:md-line",
            ))

    return messages


def _fallback_get_all_text(doc, source_path: Path) -> str:
    """Extract all meaningful text from the document for single-message fallback.

    Prefers DocLing's export_to_text(), falls back to file read.
    Filters out very short/noise lines.
    """
    if doc is not None:
        try:
            text = doc.export_to_text()
        except Exception:
            text = ""

        # Also try markdown for potentially richer content
        if not text or len(text.strip()) < 20:
            try:
                md = doc.export_to_markdown()
                # Strip markdown formatting characters for cleaner text
                text = re.sub(r'[*#`>{}\[\]]+', '', md)
            except Exception:
                pass

    if not text or len(text.strip()) < 20:
        try:
            raw = source_path.read_text(encoding='utf-8', errors='replace')
            text = re.sub(r'<[^>]+>', '', raw)
            text = re.sub(r'\s+', ' ', text).strip()
        except (OSError, UnicodeDecodeError):
            return ""

    # Filter: only return substantial content (short lines OK — could be code or replies)
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    meaningful = [l for l in lines if len(l) > 3]
    result = '\n'.join(meaningful[:200])  # cap at 200 lines

    if len(result) < 20:
        return ""
    return result


def detect_and_parse(
    doc, source_path: Path
) -> tuple[list[NormalizedMessage], ConversationMetadata]:
    """Try each registered parser and return (messages, metadata) from the first match.

    If no parser handled the file, attempts a multi-phase fallback that
    infers speaker turns from the DocLing document's item labels and
    content patterns (see ``_fallback_parse_from_docling``).

    Args:
        doc: A DoclingDocument (or None for non-DocLing sources like raw markdown).
        source_path: Path to the source file.
    """
    for parser in get_parsers():
        if parser.can_handle(doc, source_path):
            metadata = parser.extract_metadata(doc, source_path)
            metadata.export_source = parser.source_name
            messages = parser.parse(doc, source_path, metadata)
            print(
                f"[html-importer] Detected source: {parser.source_name} "
                f"({len(messages)} messages from {source_path.name})",
                file=sys.stderr,
                flush=True,
            )
            if messages:
                return messages, metadata
            # If parser returned 0 messages, continue to next parser
            # (the parser may have matched by filename but not by content)
            print(
                f"[html-importer] Parser {parser.source_name} returned 0 messages, "
                f"trying next parser...",
                file=sys.stderr, flush=True,
            )

    # No parser produced messages — try fallback
    messages, meta = _fallback_parse_from_docling(doc, source_path)
    if messages:
        return messages, meta

    # Absolute last resort
    file_ts = BaseParser.file_timestamp(source_path)
    fallback_meta = ConversationMetadata(
        export_source="unknown",
        create_time=file_ts.value,
    )
    print(
        f"[html-importer] WARNING: No parser could handle {source_path.name}",
        file=sys.stderr,
        flush=True,
    )
    return [], fallback_meta


def detect_and_parse_md(
    source_path: Path,
) -> tuple[list[NormalizedMessage], ConversationMetadata]:
    """Try each registered parser on a Markdown file (no DocLing document involved).

    Falls back to analyzing the raw markdown content for speaker label patterns
    when no registered parser handles the file.
    """
    for parser in get_parsers():
        if parser.can_handle(None, source_path):
            metadata = parser.extract_metadata(None, source_path)
            metadata.export_source = parser.source_name
            messages = parser.parse(None, source_path, metadata)
            print(
                f"[html-importer] Detected source: {parser.source_name} "
                f"({len(messages)} messages from {source_path.name})",
                file=sys.stderr,
                flush=True,
            )
            if messages:
                return messages, metadata
            print(
                f"[html-importer] Parser {parser.source_name} returned 0 messages, "
                f"trying next parser...",
                file=sys.stderr, flush=True,
            )

    # Fallback: try parsing the markdown content directly for speaker labels
    try:
        raw_text = source_path.read_text(encoding='utf-8')
        messages = _fallback_parse_markdown_text(raw_text, source_path)
        if messages:
            file_ts = BaseParser.file_timestamp(source_path)
            meta = ConversationMetadata(
                title=source_path.stem,
                export_source="fallback-markdown",
                create_time=file_ts.value,
            )
            print(
                f"[html-importer] Fallback (markdown text): "
                f"{len(messages)} messages from {source_path.name}",
                file=sys.stderr, flush=True,
            )
            return messages, meta
    except (OSError, UnicodeDecodeError):
        pass

    file_ts = BaseParser.file_timestamp(source_path)
    fallback_meta = ConversationMetadata(
        export_source="unknown",
        create_time=file_ts.value,
    )
    print(
        f"[html-importer] WARNING: No parser could handle {source_path.name}",
        file=sys.stderr,
        flush=True,
    )
    return [], fallback_meta


def _fallback_parse_markdown_text(
    raw_text: str, source_path: Path
) -> list[NormalizedMessage]:
    """Parse raw markdown text for speaker label patterns as a last resort.

    Used by ``detect_and_parse_md`` when no registered parser handles the file.
    Looks for ``**Label:**`` patterns and parses alternating turns.
    """
    file_ts = BaseParser.file_timestamp(source_path)
    messages: list[NormalizedMessage] = []
    current_speaker: str | None = None
    current_parts: list[str] = []

    for line in raw_text.split('\n'):
        stripped = line.strip()
        matched = False
        for pattern, role in _MARKDOWN_SPEAKER_PATTERNS:
            m = pattern.match(stripped)
            if m:
                if current_speaker and current_parts:
                    text = '\n'.join(current_parts).strip()
                    if text:
                        messages.append(NormalizedMessage(
                            message_id=f"fallback-md-msg-{len(messages)}",
                            speaker=current_speaker,
                            timestamp=file_ts,
                            text=text,
                            turn_index=len(messages),
                            raw_html_ref=f"{source_path.name}:md",
                        ))
                current_speaker = role
                rest = stripped[m.end():]
                current_parts = [rest] if rest else []
                matched = True
                break

        if not matched and current_speaker and stripped:
            current_parts.append(stripped)

    if current_speaker and current_parts:
        text = '\n'.join(current_parts).strip()
        if text:
            messages.append(NormalizedMessage(
                message_id=f"fallback-md-msg-{len(messages)}",
                speaker=current_speaker,
                timestamp=file_ts,
                text=text,
                turn_index=len(messages),
                raw_html_ref=f"{source_path.name}:md",
            ))

    return messages
