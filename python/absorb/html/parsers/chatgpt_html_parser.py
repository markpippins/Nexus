import html
import re
from pathlib import Path

from models import NormalizedMessage, TimestampInfo, ConversationMetadata
from base_parser import BaseParser, register_parser


@register_parser
class ChatGPTHtmlParser(BaseParser):
    """Parser for ChatGPT web UI "Save page as..." HTML transcripts.

    These files are saved directly from the ChatGPT web interface (chatgpt.com)
    using the browser's "Save page as..." feature. They contain the full HTML
    of the conversation page including sidebar, navigation, and message turns.

    Detection heuristic: the raw HTML contains ``data-message-author-role="user"``
    attributes, which are specific to ChatGPT web UI pages.

    Instead of relying on DocLing's markdown output (which strips HTML attributes),
    this parser reads the raw HTML file directly to detect speaker turns via
    ``data-message-author-role`` attributes and extract text content via div
    nesting analysis.
    """

    @property
    def source_name(self) -> str:
        return "ChatGPT HTML"

    def can_handle(self, doc, source_path: Path) -> bool:
        """Detect ChatGPT web UI HTML by looking for data-message-author-role attributes."""
        try:
            raw_html = source_path.read_text(encoding="utf-8")
            # ChatGPT web UI uses data-message-author-role="user" on message divs
            return 'data-message-author-role="user"' in raw_html
        except (OSError, UnicodeDecodeError):
            return False

    def extract_metadata(self, doc, source_path: Path) -> ConversationMetadata:
        """Extract title from DocLing's structured text items, fall back to filename."""
        title = None

        # Try DocLing document first — title is typically the first text item
        if doc is not None:
            texts = list(doc.texts)
            for item in texts:
                label = getattr(item, "label", None)
                text = getattr(item, "text", None)
                if label == "title" and text:
                    title = text.strip()
                    break
            # Fallback: look for a heading in the markdown
            if not title:
                md = doc.export_to_markdown()
                for line in md.split("\n"):
                    if line.startswith("# "):
                        title = line.lstrip("# ").strip()
                        break

        # Fallback: use filename
        if not title:
            title = source_path.stem

        file_ts = self.file_timestamp(source_path)
        return ConversationMetadata(
            title=title,
            create_time=file_ts.value,
        )

    def parse(self, doc, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        """Parse ChatGPT web UI HTML into NormalizedMessages.

        Reads the raw HTML file to find data-message-author-role attributes,
        then extracts text content via div nesting analysis.
        """
        try:
            raw_html = source_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            return []

        messages: list[NormalizedMessage] = []
        turn_counter = -1
        last_speaker: str | None = None

        ts = (
            TimestampInfo(
                value=metadata.create_time,
                confidence="low",
                source="file_metadata",
                raw_value=metadata.create_time,
            )
            if metadata.create_time
            else self.file_timestamp(source_path)
        )

        # Find all message divs by their data-message-author-role attributes
        role_pattern = re.compile(r'data-message-author-role="(user|assistant)"')
        role_matches = list(role_pattern.finditer(raw_html))

        for role_match in role_matches:
            speaker = role_match.group(1)
            attr_pos = role_match.start()

            # Find the outer <div> that contains this attribute
            opening_div = raw_html.rfind("<div", max(0, attr_pos - 200), attr_pos)
            if opening_div == -1:
                continue

            # Track div nesting to find the matching closing </div>
            depth = 1
            idx = opening_div + 5  # skip past "<div"
            while depth > 0 and idx < len(raw_html):
                next_open = raw_html.find("<div", idx)
                next_close = raw_html.find("</div>", idx)

                if next_close == -1:
                    break

                if next_open != -1 and next_open < next_close:
                    depth += 1
                    idx = next_open + 4
                else:
                    depth -= 1
                    if depth == 0:
                        # Extract text from this div
                        content = raw_html[opening_div:next_close + 6]
                        text = self._extract_text_from_html(content)

                        if text:
                            if last_speaker == speaker:
                                turn_counter += 1
                            else:
                                turn_counter += 1
                                last_speaker = speaker

                            # Strip citation artifacts before storing
                            clean_text = ChatGPTHtmlParser._strip_citations(text)

                            messages.append(NormalizedMessage(
                                message_id=f"chatgpt-html-msg-{len(messages)}",
                                speaker=speaker,
                                timestamp=ts,
                                text=clean_text,
                                turn_index=turn_counter,
                                raw_html_ref=f"{source_path.name}:{attr_pos}",
                            ))
                        idx = next_close + 6
                        break
                    idx = next_close + 6

        return messages

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_citations(text: str) -> str:
        """Remove Markdown and numeric citation artifacts from ChatGPT output."""
        # Remove footnote-style citations: [^1], [^citation_name]
        text = re.sub(r'\[\^[^\]]+\]', '', text)
        # Remove trailing numeric citations that appear after punctuation: text.[1]
        text = re.sub(r'\.\[\d+\]', '.', text)
        # Remove inline source attribution: (Source: ...)
        text = re.sub(r'\(Source:[^)]*\)', '', text, flags=re.IGNORECASE)
        return text

    @staticmethod
    def _extract_text_from_html(raw_html: str) -> str:
        """Extract clean text from an HTML snippet.

        Strips all HTML tags, preserves paragraph-level structure from
        block elements, and collapses whitespace.

        Args:
            raw_html: HTML snippet to extract text from.

        Returns:
            Clean text with whitespace normalized.
        """
        # Remove <script> and <style> blocks entirely
        cleaned = re.sub(r"<script[^>]*>.*?</script>", "", raw_html, flags=re.DOTALL | re.IGNORECASE)
        cleaned = re.sub(r"<style[^>]*>.*?</style>", "", cleaned, flags=re.DOTALL | re.IGNORECASE)

        # Replace block-level tags with newlines to preserve paragraph boundaries
        cleaned = re.sub(
            r"</?(?:p|div|br|h[1-6]|li|ol|ul|blockquote|hr|tr|td|th|pre)[^>]*>",
            "\n",
            cleaned,
            flags=re.IGNORECASE,
        )

        # Strip remaining tags
        cleaned = re.sub(r"<[^>]+>", "", cleaned)

        # Decode all HTML entities using stdlib (handles &amp;, &lt;, &#39;, &mdash;, etc.)
        cleaned = html.unescape(cleaned)

        # Collapse whitespace: lines, then runs of spaces
        lines = cleaned.split("\n")
        lines = [re.sub(r"\s+", " ", line).strip() for line in lines]
        lines = [line for line in lines if line]

        return "\n".join(lines)
