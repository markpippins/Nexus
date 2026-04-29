import re
from pathlib import Path
from bs4 import BeautifulSoup

from models import NormalizedMessage, TimestampInfo, ImageReference, ConversationMetadata
from base_parser import BaseParser, register_parser


@register_parser
class CopilotParser(BaseParser):
    """Parser for Microsoft Copilot HTML exports.

    Detection heuristic: presence of `group/ai-message` class or
    `data-content="ai-message"` attribute.
    """

    @property
    def source_name(self) -> str:
        return "Microsoft Copilot"

    def can_handle(self, soup: BeautifulSoup | None, source_path: Path) -> bool:
        if soup is None:
            return False
        return (
            soup.find(class_="group/ai-message") is not None
            or soup.find(attrs={"data-content": "ai-message"}) is not None
        )

    def extract_metadata(self, soup: BeautifulSoup, source_path: Path) -> ConversationMetadata:
        # Title from <title> tag
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else None
        if title:
            title = re.sub(r"\s*[-|]\s*Microsoft\s+Copilot\s*$", "", title, flags=re.IGNORECASE).strip() or title

        # Copilot URLs look like: https://copilot.microsoft.com/chats/<id>
        conversation_id = None
        canonical = soup.find("link", rel="canonical")
        if canonical and canonical.get("href"):
            href = canonical["href"]
            m = re.search(r"/chats/([A-Za-z0-9_-]{10,})", href)
            if m:
                conversation_id = m.group(1)

        file_ts = self.file_timestamp(source_path)

        return ConversationMetadata(
            conversation_id=conversation_id,
            title=title,
            create_time=file_ts.value,
        )

    def parse(self, soup: BeautifulSoup, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        # Collect all message containers in document order.
        all_messages = soup.find_all(
            lambda tag: tag.name == "div"
            and "class" in tag.attrs
            and (
                "group/user-message" in tag["class"]
                or "group/ai-message" in tag["class"]
            )
        )

        messages: list[NormalizedMessage] = []
        turn_counter = 0
        last_speaker: str | None = None
        image_counter: dict = {"count": 0}

        # Use conversation-level timestamp for all messages
        ts = TimestampInfo(
            value=metadata.create_time,
            confidence="low",
            source="file_metadata",
            raw_value=metadata.create_time,
        ) if metadata.create_time else self.file_timestamp(source_path)

        for msg in all_messages:
            is_user = "group/user-message" in (msg.get("class") or [])
            speaker = "user" if is_user else "assistant"

            raw_html_ref = self._build_selector(msg)
            element_id = msg.get("id", "")
            message_id = element_id or raw_html_ref
            text = self._extract_text(msg, is_user)
            image_refs = self.extract_images_from_message(msg, source_path, image_counter)

            # Turn tracking
            if speaker == "user" and last_speaker in ("assistant", None):
                if last_speaker is not None:
                    turn_counter += 1

            normalized = NormalizedMessage(
                message_id=message_id,
                speaker=speaker,
                timestamp=ts,
                text=text.strip(),
                turn_index=turn_counter,
                raw_html_ref=raw_html_ref,
                image_references=image_refs,
            )
            messages.append(normalized)
            last_speaker = speaker

        return messages

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_text(msg_tag, is_user: bool) -> str:
        """Extract readable text from a Copilot message element."""
        if is_user:
            bubble = msg_tag.find(attrs={"data-content": "user-message"})
            if bubble:
                return bubble.get_text("\n", strip=True)
            return msg_tag.get_text("\n", strip=True)

        parts: list[str] = []
        ai_items = msg_tag.find_all(class_="group/ai-message-item")
        if not ai_items:
            return msg_tag.get_text("\n", strip=True)

        for item in ai_items:
            parts.extend(CopilotParser._extract_block_children(item))

        return "\n\n".join(parts).strip()

    @staticmethod
    def _extract_block_children(parent) -> list[str]:
        """Recursively extract text from block-level children."""
        results: list[str] = []
        for child in parent.children:
            if child.name is None:
                continue
            tag = child.name
            classes = set(child.get("class") or [])

            if "sr-only" in classes:
                continue

            # Strip citation artifacts
            CopilotParser._strip_citations(child)

            if tag in ("p",):
                text = CopilotParser._collapse_ws(child.get_text())
                if text:
                    results.append(text)

            elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
                text = child.get_text(" ", strip=True)
                if text:
                    results.append(text)

            elif tag == "ul":
                for li in child.find_all("li", recursive=False):
                    text = CopilotParser._collapse_ws(li.get_text())
                    if text:
                        results.append(f"• {text}")

            elif tag == "ol":
                for i, li in enumerate(child.find_all("li", recursive=False), 1):
                    text = CopilotParser._collapse_ws(li.get_text())
                    if text:
                        results.append(f"{i}. {text}")

            elif tag == "pre":
                code = child.find("code")
                if code:
                    results.append(f"```\n{code.get_text()}\n```")
                else:
                    results.append(f"```\n{child.get_text()}\n```")

            elif tag == "blockquote":
                text = child.get_text(" ", strip=True)
                if text:
                    results.append(f"> {text}")

            elif tag == "table":
                results.append(CopilotParser._extract_table(child))

            elif tag == "hr":
                results.append("---")

            elif tag in ("div", "section"):
                if not child.find("span", class_="whitespace-pre-wrap"):
                    results.extend(CopilotParser._extract_block_children(child))
                else:
                    text = CopilotParser._collapse_ws(child.get_text())
                    if text:
                        results.append(text)

        return results

    @staticmethod
    def _collapse_ws(text: str) -> str:
        """Collapse runs of whitespace (including newlines) into single spaces."""
        return re.sub(r"\s+", " ", text).strip()

    @staticmethod
    def _strip_citations(tag) -> None:
        """Remove citation artifact elements in-place."""
        for el in tag.find_all(["button", "sup"]):
            el.decompose()
        for span in tag.find_all("span"):
            txt = span.get_text(strip=True)
            if re.match(r"^[\w.-]+\.\w{2,4}(\s*\+\d+)?$", txt):
                span.decompose()

    @staticmethod
    def _extract_table(table_tag) -> str:
        """Convert an HTML table to a readable text representation."""
        rows = []
        for tr in table_tag.find_all("tr", recursive=False):
            cells = []
            for cell in tr.find_all(["th", "td"], recursive=False):
                cells.append(cell.get_text(" ", strip=True))
            if cells:
                rows.append(cells)

        if not rows:
            return ""

        col_widths = [max(len(c) for c in col) for col in zip(*rows)]
        lines = []
        for i, row in enumerate(rows):
            formatted = "  ".join(
                cell.ljust(col_widths[j]) for j, cell in enumerate(row)
            )
            lines.append(formatted)
            if i == 0:
                lines.append("  ".join("-" * w for w in col_widths))
        return "\n".join(lines)
