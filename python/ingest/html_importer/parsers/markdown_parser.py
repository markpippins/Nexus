import re
from pathlib import Path
from bs4 import BeautifulSoup

from models import NormalizedMessage, TimestampInfo, ConversationMetadata
from base_parser import BaseParser, register_parser


@register_parser
class MarkdownParser(BaseParser):
    """Parser for Markdown chat transcripts.

    Detects files where short user messages (like "Sure.", "alright")
    alternate with longer assistant responses in a saved Markdown
    conversation.

    Detection: file extension is .md/.markdown AND it has ≥ 2 alternating
    assistant→user→assistant turns.
    """

    # Markdown formatting markers (assistant uses these, user typically doesn't)
    _FMT = re.compile(r"^(#{1,6}\s|\|.*\||^[-*+]\s|^>\s|\*\*|__|`|!\[|^\d+[\.\)]\s)")
    # Any inline formatting (bold, italic, emoji+bold, etc.)
    _INLINE_FMT = re.compile(r"(\*\*|__|_[^_]+_|`|👉|✅|❌|✔)")

    @property
    def source_name(self) -> str:
        return "Markdown Chat"

    # ------------------------------------------------------------------
    # Detection
    # ------------------------------------------------------------------

    def can_handle(self, soup: BeautifulSoup | None, source_path: Path) -> bool:
        if source_path.suffix.lower() not in (".md", ".markdown"):
            return False
        return self._is_conversation_format(source_path)

    def _is_conversation_format(self, path: Path) -> bool:
        """Return True if the file looks like an alternating AI conversation."""
        blocks = self._split_blocks_with_lines(path)
        if len(blocks) < 3:
            return False

        turns = 0
        for i in range(len(blocks) - 2):
            if (not self._is_user_block(blocks[i][0])
                    and self._is_user_block(blocks[i + 1][0])
                    and not self._is_user_block(blocks[i + 2][0])):
                turns += 1

        return turns >= 1

    def _is_user_block(self, text: str) -> bool:
        """Return True if this block looks like a user message.

        User messages in saved Markdown conversations tend to be very short
        conversational responses: "Sure.", "alright", "OK", etc.
        """
        stripped = text.strip()
        # Exclude horizontal rules
        if stripped in ("---", "***", "___"):
            return False
        lines = [l for l in text.splitlines() if l.strip()]
        if not lines or len(lines) > 1:
            return False
        wc = sum(len(l.split()) for l in lines)
        # Very short, no formatting = likely user acknowledgment
        if wc > 3:
            return False
        if self._FMT.search(text):
            return False
        if self._INLINE_FMT.search(text):
            return False
        return True

    # ------------------------------------------------------------------
    # Metadata
    # ------------------------------------------------------------------

    def extract_metadata(self, soup: BeautifulSoup | None, source_path: Path) -> ConversationMetadata:
        file_ts = self.file_timestamp(source_path)
        title = source_path.stem
        return ConversationMetadata(
            title=title,
            create_time=file_ts.value,
        )

    # ------------------------------------------------------------------
    # Parsing
    # ------------------------------------------------------------------

    def parse(self, soup: BeautifulSoup | None, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        blocks = self._split_blocks_with_lines(source_path)

        messages: list[NormalizedMessage] = []
        turn_counter = 0
        last_speaker: str | None = None

        ts = TimestampInfo(
            value=metadata.create_time,
            confidence="low",
            source="file_metadata",
            raw_value=metadata.create_time,
        ) if metadata.create_time else self.file_timestamp(source_path)

        for idx, (text, start_line) in enumerate(blocks):
            text = text.strip()
            if not text:
                continue

            is_user = self._is_user_block(text)
            speaker = "user" if is_user else "assistant"

            # Turn tracking
            if speaker == "user" and last_speaker in ("assistant", None):
                if last_speaker is not None:
                    turn_counter += 1

            normalized = NormalizedMessage(
                message_id=f"msg-{idx}",
                speaker=speaker,
                timestamp=ts,
                text=text,
                turn_index=turn_counter,
                raw_html_ref=f"{source_path.name}:{start_line}",
            )
            messages.append(normalized)
            last_speaker = speaker

        return messages

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _split_blocks_with_lines(path: Path) -> list[tuple[str, int]]:
        """Split file into paragraphs with their start line numbers."""
        text = path.read_text(encoding="utf-8", errors="replace")
        raw = re.split(r"\n{2,}", text)
        result = []
        search_start = 0
        for block in raw:
            stripped = block.strip()
            if not stripped:
                continue
            pos = text.find(stripped, search_start)
            if pos == -1:
                pos = search_start
            start_line = text[:pos].count("\n") + 1
            search_start = pos + len(stripped)
            result.append((stripped, start_line))
        return result
