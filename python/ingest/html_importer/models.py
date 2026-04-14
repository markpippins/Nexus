from dataclasses import dataclass, asdict, field
from typing import Literal


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
class ConversationMetadata:
    """Conversation-level metadata extracted once per HTML file."""

    conversation_id: str | None = None
    title: str | None = None
    create_time: str | None = None
    update_time: str | None = None
    model: str | None = None
    export_source: str | None = None

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
        return (
            f"[Turn {self.turn_index}] {self.speaker} ({ts})\n"
            f"  ID: {self.message_id}\n"
            f"  Ref: {ref}\n"
            f"  Text: {text}"
        )
