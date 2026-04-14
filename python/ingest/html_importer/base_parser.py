import os
import re
import sys
import base64
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from pathlib import Path
from bs4 import BeautifulSoup

from models import NormalizedMessage, TimestampInfo, ImageReference, ConversationMetadata


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

    # ------------------------------------------------------------------
    # Image extraction utilities
    # ------------------------------------------------------------------

    # Data URI images smaller than this (bytes) are considered icons/sprites
    _DATA_URI_SIZE_THRESHOLD = 1024  # 1 KB

    # Known avatar filenames / patterns to skip
    _AVATAR_PATTERNS = re.compile(r"unnamed|avatar|profile.?photo|user.?icon|photo-thumb", re.IGNORECASE)

    # Known tiny tracking / UI image patterns to skip
    _TINY_IMAGE_PATTERNS = re.compile(
        r"("
        r"1x1|tracking|pixel|spacer|spacer\.gif|"
        r"icon-?small|sprite|css-?icon|decorative|"
        r"favicon|logo-?small|badge-?icon|"
        r"loading-?spinner|throbber"
        r")",
        re.IGNORECASE,
    )

    # 1x1 transparent GIF data URI (very common tracking pixel)
    _TRANSPARENT_GIF_DATA_URI = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

    @staticmethod
    def _is_avatar(img_tag) -> bool:
        """Check if an <img> tag looks like an avatar."""
        src = (img_tag.get("src") or "") + " " + (img_tag.get("alt") or "") + " " + " ".join(img_tag.get("class") or [])
        return bool(BaseParser._AVATAR_PATTERNS.search(src))

    @staticmethod
    def _is_tiny_tracking(img_tag) -> bool:
        """Check if an <img> tag is a tiny tracking pixel or CSS sprite."""
        src = img_tag.get("src") or ""
        alt = img_tag.get("alt") or ""
        classes = " ".join(img_tag.get("class") or [])
        combined = f"{src} {alt} {classes}"

        # Check 1x1 transparent GIF
        if src == BaseParser._TRANSPARENT_GIF_DATA_URI:
            return True

        # Check by alt/class/src name patterns
        if BaseParser._TINY_IMAGE_PATTERNS.search(combined):
            return True

        # Check data URI size
        if src.startswith("data:image"):
            # Estimate base64-encoded size
            try:
                data_part = src.split(",", 1)[1] if "," in src else ""
                decoded_size = len(base64.b64decode(data_part)) if data_part else 0
                if decoded_size < BaseParser._DATA_URI_SIZE_THRESHOLD:
                    return True
            except Exception:
                pass

        return False

    @staticmethod
    def _infer_extension(src: str) -> str:
        """Guess the file extension from an image src."""
        if not src:
            return "png"
        # Data URI: data:image/jpeg;base64,...
        if src.startswith("data:image"):
            mime_match = re.match(r"data:image/(\w+);", src)
            if mime_match:
                mime_type = mime_match.group(1)
                if mime_type in ("jpeg", "jpg"):
                    return "jpg"
                if mime_type in ("svg+xml",):
                    return "svg"
                return mime_type

        # URL or file path: extract extension
        url_path = src.split("?")[0]  # strip query params
        if "." in url_path:
            ext = url_path.rsplit(".", 1)[-1].lower()
            # Normalize
            if ext in ("jpeg",):
                return "jpg"
            if ext in ("svg+xml",):
                return "svg"
            if ext in ("jpg", "png", "gif", "webp", "svg", "bmp", "ico"):
                return ext

        return "png"  # default

    @staticmethod
    def _check_if_saved(src: str, source_path: Path, images_folder: Path) -> bool:
        """Check if the image src corresponds to a file already in the images folder."""
        if not src or src.startswith("data:") or src.startswith("blob:"):
            return False

        # If src is a relative path, check if it exists relative to the source file
        # (browser "Save Page As" may have saved it in a _files/ directory)
        if not src.startswith(("http://", "https://", "//")):
            rel_path = source_path.parent / src.lstrip("./")
            if rel_path.resolve().exists():
                return True

        # Check if a file with the expected image-N name already exists
        if images_folder.exists():
            # We don't know which number this image is here, but if any
            # image-N.* file exists it means the folder has been populated
            return False  # Can't tell at this level; caller decides

        return False

    @staticmethod
    def extract_images_from_message(
        msg_tag,
        source_path: Path,
        image_counter: dict,
    ) -> list[ImageReference]:
        """Extract image references from a message DOM element.

        Args:
            msg_tag: A BeautifulSoup tag representing the message container.
            source_path: Path to the source HTML file.
            image_counter: A mutable dict {"count": int} that tracks the
                          sequential image number across all messages in the file.

        Returns:
            A list of ImageReference objects for each content image found.
        """
        img_tags = msg_tag.find_all("img")
        results: list[ImageReference] = []

        for img in img_tags:
            # Skip avatars
            if BaseParser._is_avatar(img):
                continue

            # Skip tiny tracking / sprite / icon images
            if BaseParser._is_tiny_tracking(img):
                continue

            src = img.get("src", "")
            if not src:
                continue

            # Increment sequential counter
            image_counter["count"] += 1
            n = image_counter["count"]

            ext = BaseParser._infer_extension(src)
            name = f"image-{n}.{ext}"

            # Check if this image is already saveable
            saved = BaseParser._check_if_saved(src, source_path, Path(""))

            results.append(
                ImageReference(
                    name=name,
                    saved=saved,
                    original_src=src if not src.startswith("data:") else f"data:{ext};(base64,{len(src)} chars)",
                )
            )

        return results


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
        # from parsers import gemini_parser    # DEPRECATED: commented out - https://linear.app/TODO
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
