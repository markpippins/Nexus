import re
from pathlib import Path
from bs4 import BeautifulSoup

from models import NormalizedMessage, TimestampInfo, ConversationMetadata
from base_parser import BaseParser, register_parser

@register_parser
class OpenCodeParser(BaseParser):
    """Parser for OpenCode HTML exports.
    """

    @property
    def source_name(self) -> str:
        return "OpenCode"

    def can_handle(self, soup: BeautifulSoup | None, source_path: Path) -> bool:
        if soup is None:
            return False
        # Look for the characteristic session-turn components or data-theme="oc-*"
        if soup.find("html", attrs={"data-theme": re.compile(r"oc-")}):
            return True
        return soup.find(attrs={"data-component": "session-turn"}) is not None

    def extract_metadata(self, soup: BeautifulSoup, source_path: Path) -> ConversationMetadata:
        title = None
        title_tag = soup.find("h1", attrs={"data-slot": "session-title-child"})
        if title_tag:
            title = title_tag.get_text(strip=True)

        conversation_id = None
        session_div = soup.find(attrs={"data-session-id": True})
        if session_div:
            conversation_id = session_div.get("data-session-id")

        file_ts = self.file_timestamp(source_path)

        return ConversationMetadata(
            conversation_id=conversation_id,
            title=title,
            create_time=file_ts.value,
            update_time=None,
            model=None,
        )

    def parse(self, soup: BeautifulSoup, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        messages: list[NormalizedMessage] = []
        turn_counter = 0

        # Base timestamp to fall back on
        ts = TimestampInfo(
            value=metadata.create_time,
            confidence="low",
            source="file_metadata",
            raw_value=metadata.create_time,
        ) if metadata.create_time else self.file_timestamp(source_path)

        # Iterate over turns sequentially
        turns = soup.find_all(attrs={"data-component": "session-turn"})
        for turn in turns:
            turn_counter += 1
            
            # --- USER MESSAGE ---
            user_msg = turn.find(attrs={"data-component": "user-message"})
            if user_msg:
                text_div = user_msg.find(attrs={"data-slot": "user-message-text"})
                user_text = text_div.get_text("\n", strip=True) if text_div else user_msg.get_text("\n", strip=True)
                
                # Check for image refs (this is a simplified placeholder, would use standard find)
                image_refs = self.extract_images_from_message(user_msg, source_path, {"count": 0})
                
                messages.append(NormalizedMessage(
                    message_id=turn.parent.get("data-message-id", ""),
                    speaker="user",
                    timestamp=ts,
                    text=user_text,
                    turn_index=turn_counter,
                    raw_html_ref=self._build_selector(user_msg),
                    image_references=image_refs,
                ))

            # --- ASSISTANT MESSAGE ---
            # Assistant text is generally inside text-parts
            text_parts = turn.find_all(attrs={"data-component": "text-part"})
            if text_parts:
                assistant_text = "\n\n".join(tp.get_text("\n", strip=True) for tp in text_parts)
                
                messages.append(NormalizedMessage(
                    message_id=turn.parent.get("data-message-id", ""),
                    speaker="assistant",
                    timestamp=ts,
                    text=assistant_text,
                    turn_index=turn_counter,
                    raw_html_ref=self._build_selector(text_parts[0]) if text_parts else "",
                    image_references=[],
                ))

        return messages
