import json
import re
from pathlib import Path
from bs4 import BeautifulSoup

from models import NormalizedMessage, TimestampInfo, ConversationMetadata
from base_parser import BaseParser, register_parser


@register_parser
class ChatGPTParser(BaseParser):
    """Parser for ChatGPT / ChatGPT-like (including custom GPTs) HTML exports.

    Detection heuristic: presence of `data-message-author-role` attribute.
    """

    @property
    def source_name(self) -> str:
        return "ChatGPT"

    def can_handle(self, soup: BeautifulSoup | None, source_path: Path) -> bool:
        if soup is None:
            return False
        return soup.find(attrs={"data-message-author-role": True}) is not None

    def extract_metadata(self, soup: BeautifulSoup, source_path: Path) -> ConversationMetadata:
        # Title from <title> tag (minus site suffix)
        title_tag = soup.find("title")
        title = title_tag.get_text(strip=True) if title_tag else None
        if title:
            # Strip common suffixes like " - ChatGPT", " | ChatGPT"
            title = re.sub(r"\s*[-|]\s*ChatGPT\s*$", "", title, flags=re.IGNORECASE).strip() or title

        # Conversation ID from URL-like data attributes or URL patterns
        conversation_id = None
        # Check <link rel="canonical">
        canonical = soup.find("link", rel="canonical")
        if canonical and canonical.get("href"):
            href = canonical["href"]
            # URLs like: https://chatgpt.com/g/.../c/<conversation-id>
            m = re.search(r"/c/([0-9a-f-]{20,})", href)
            if m:
                conversation_id = m.group(1)

        # Model from data-message-model-slug on first assistant message
        model = None
        first_assistant = soup.find(attrs={"data-message-author-role": "assistant"})
        if first_assistant:
            model = first_assistant.get("data-message-model-slug")

        # Try embedded JSON in <script type="application/json"> for timestamps
        create_time = None
        update_time = None
        for script in soup.find_all("script", type="application/json"):
            txt = (script.string or "").strip()
            if not txt:
                continue
            try:
                data = json.loads(txt)
                if isinstance(data, dict):
                    create_time = data.get("create_time") or data.get("createTime")
                    update_time = data.get("update_time") or data.get("updateTime")
                    if create_time or update_time:
                        break
            except json.JSONDecodeError:
                continue

        file_ts = self.file_timestamp(source_path)

        return ConversationMetadata(
            conversation_id=conversation_id,
            title=title,
            create_time=create_time or file_ts.value,
            update_time=update_time,
            model=model,
        )

    def parse(self, soup: BeautifulSoup, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        message_divs = soup.find_all(attrs={"data-message-author-role": True})

        messages: list[NormalizedMessage] = []
        turn_counter = 0
        last_speaker: str | None = None

        # Use conversation-level timestamp for all messages
        ts = TimestampInfo(
            value=metadata.create_time,
            confidence="low",
            source="file_metadata",
            raw_value=metadata.create_time,
        ) if metadata.create_time else self.file_timestamp(source_path)

        for msg in message_divs:
            speaker = msg.get("data-message-author-role", "unknown")
            message_id = msg.get("data-message-id", "")
            raw_html_ref = self._build_selector(msg)
            text = self._extract_text(msg, speaker)

            # Turn tracking
            if speaker == "user" and last_speaker in ("assistant", None):
                if last_speaker is not None:
                    turn_counter += 1

            normalized = NormalizedMessage(
                message_id=message_id or raw_html_ref,
                speaker=speaker,
                timestamp=ts,
                text=text.strip(),
                turn_index=turn_counter,
                raw_html_ref=raw_html_ref,
            )
            messages.append(normalized)
            last_speaker = speaker

        return messages

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_selector(tag) -> str:
        """Build a CSS selector-like string pointing to this element."""
        parts = []
        for parent in tag.parents:
            if parent.name == "html":
                break
            if parent.get("id"):
                parts.append(f"#{parent['id']}")
            elif parent.get("class"):
                cls = " ".join(parent["class"])
                parts.append(f"{parent.name}.{cls.replace(' ', '.')}")
        parts.reverse()
        tag_id = tag.get("id", "")
        if tag_id:
            parts.append(f"#{tag_id}")
        elif tag.get("class"):
            cls = " ".join(tag["class"])
            parts.append(f"{tag.name}.{cls.replace(' ', '.')}")
        else:
            parts.append(tag.name)
        return " > ".join(parts)

    @staticmethod
    def _extract_text(msg_tag, speaker: str) -> str:
        """Extract readable text from a ChatGPT message element."""
        if speaker == "user":
            pre = msg_tag.find("div", class_="whitespace-pre-wrap")
            if pre:
                return pre.get_text("\n", strip=True)
            return msg_tag.get_text("\n", strip=True)

        prose = msg_tag.find("div", class_="prose")
        if prose:
            return prose.get_text("\n", strip=True)

        return msg_tag.get_text("\n", strip=True)
