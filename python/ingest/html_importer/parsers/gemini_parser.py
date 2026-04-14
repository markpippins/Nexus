from pathlib import Path
from bs4 import BeautifulSoup

from models import NormalizedMessage, TimestampInfo, ConversationMetadata
from base_parser import BaseParser, register_parser


@register_parser
class GeminiParser(BaseParser):
    """Parser for Google Gemini HTML chat exports.

    NOTE: The current sample file ("Spec-Mediated Ai Development - Google Gemini.html")
    is actually a Google Search results page, NOT a Gemini chat transcript.
    This parser is a stub that will be implemented once a real Gemini chat sample
    is provided.
    """

    @property
    def source_name(self) -> str:
        return "Google Gemini"

    def can_handle(self, soup: BeautifulSoup | None, source_path: Path) -> bool:
        if soup is None:
            return False
        markers = [
            soup.find(attrs={"data-is-user-message": True}),
            soup.find(attrs={"data-message-type": "user"}),
            soup.find("gemini-chat"),
        ]
        return any(markers)

    def extract_metadata(self, soup: BeautifulSoup | None, source_path: Path) -> ConversationMetadata:
        return ConversationMetadata()

    def parse(self, soup: BeautifulSoup | None, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        print(
            f"[html_importer] GeminiParser.parse() called for {source_path.name} "
            f"— not yet implemented.",
            flush=True,
        )
        return []
