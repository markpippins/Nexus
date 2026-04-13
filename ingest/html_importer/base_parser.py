import os
import sys
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from bs4 import BeautifulSoup

from models import NormalizedMessage, TimestampInfo, ConversationMetadata


class BaseParser(ABC):
    """Abstract base class for HTML chat transcript parsers.

    Subclass this to add support for a new chat source (ChatGPT, Copilot, etc.).
    Each subclass must implement `can_handle`, `parse`, and `extract_metadata`.
    """

    @abstractmethod
    def can_handle(self, soup: BeautifulSoup, source_path: Path) -> bool:
        """Return True if this parser can handle the given HTML document."""
        ...

    @abstractmethod
    def parse(self, soup: BeautifulSoup, source_path: Path, metadata: ConversationMetadata) -> list[NormalizedMessage]:
        """Extract NormalizedMessages from the parsed HTML.

        Args:
            soup: Parsed HTML document.
            source_path: Path to the source file.
            metadata: ConversationMetadata already extracted for this file.
        """
        ...

    @abstractmethod
    def extract_metadata(self, soup: BeautifulSoup, source_path: Path) -> ConversationMetadata:
        """Extract conversation-level metadata from the HTML (called once per file)."""
        ...

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Human-readable name for this parser (e.g. 'ChatGPT', 'Copilot')."""
        ...

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


# Registry of all available parsers — populated at import time.
_parser_registry: list[type[BaseParser]] = []


def register_parser(cls: type[BaseParser]) -> type[BaseParser]:
    """Decorator to register a parser subclass automatically."""
    _parser_registry.append(cls)
    return cls


def get_parsers() -> list[BaseParser]:
    """Return instantiated list of all registered parsers."""
    return [cls() for cls in _parser_registry]


def detect_and_parse(
    soup: BeautifulSoup, source_path: Path
) -> tuple[list[NormalizedMessage], ConversationMetadata]:
    """Try each registered parser and return (messages, metadata) from the first match."""
    for parser in get_parsers():
        if parser.can_handle(soup, source_path):
            metadata = parser.extract_metadata(soup, source_path)
            metadata.export_source = parser.source_name
            messages = parser.parse(soup, source_path, metadata)
            print(
                f"[html_importer] Detected source: {parser.source_name} "
                f"({len(messages)} messages from {source_path.name})",
                file=sys.stderr,
                flush=True,
            )
            return messages, metadata

    # If no parser matched, still try to get file-level metadata
    file_ts = BaseParser.file_timestamp(source_path)
    fallback_meta = ConversationMetadata(
        export_source="unknown",
        create_time=file_ts.value,
    )
    print(
        f"[html_importer] WARNING: No parser could handle {source_path.name}",
        file=sys.stderr,
        flush=True,
    )
    return [], fallback_meta


def detect_and_parse_md(
    source_path: Path,
) -> tuple[list[NormalizedMessage], ConversationMetadata]:
    """Try each registered parser on a Markdown file (no BeautifulSoup needed)."""
    # Ensure all parsers are loaded (decorators register them)
    try:
        from parsers import chatgpt_parser   # noqa: F401
        from parsers import copilot_parser    # noqa: F401
        from parsers import gemini_parser     # noqa: F401
        from parsers import markdown_parser   # noqa: F401
    except ImportError:
        pass

    for parser in get_parsers():
        if parser.can_handle(None, source_path):
            metadata = parser.extract_metadata(None, source_path)
            metadata.export_source = parser.source_name
            messages = parser.parse(None, source_path, metadata)
            print(
                f"[html_importer] Detected source: {parser.source_name} "
                f"({len(messages)} messages from {source_path.name})",
                file=sys.stderr,
                flush=True,
            )
            return messages, metadata

    file_ts = BaseParser.file_timestamp(source_path)
    fallback_meta = ConversationMetadata(
        export_source="unknown",
        create_time=file_ts.value,
    )
    print(
        f"[html_importer] WARNING: No parser could handle {source_path.name}",
        file=sys.stderr,
        flush=True,
    )
    return [], fallback_meta
