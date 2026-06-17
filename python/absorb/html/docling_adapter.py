"""Adaptor: DoclingDocument -> chat message extraction primitives.

Replaces BeautifulSoup-based HTML parsing with DocLing's unified document
conversion engine. Supports HTML, PDF, DOCX, PPTX, XLSX, EPUB, images
(with OCR), and plain text.
"""

from pathlib import Path
from typing import Any


class DoclingAdapter:
    """Wraps DocLing conversion and provides chat-extraction queries."""

    def __init__(self, enable_ocr: bool = False):
        from docling.document_converter import DocumentConverter
        self._converter = DocumentConverter()
        self._enable_ocr = enable_ocr

    def convert(self, path: Path):
        """Convert any supported document to a DoclingDocument."""
        return self._converter.convert(str(path))

    def convert_all(self, paths: list[Path]):
        """Batch convert with error isolation."""
        return self._converter.convert_all(
            [str(p) for p in paths],
            raises_on_error=False,
        )

    @staticmethod
    def extract_text_items(doc) -> list[dict]:
        """Extract all text items with their hierarchy position."""
        items = []
        for text_item in doc.texts:
            items.append({
                "text": text_item.text,
                "label": str(text_item.label) if text_item.label else "paragraph",
                "prov": str(text_item.prov) if hasattr(text_item, "prov") else "",
            })
        return items

    @staticmethod
    def export_to_markdown(doc) -> str:
        """Export DoclingDocument to Markdown."""
        return doc.export_to_markdown()

    @staticmethod
    def extract_images(doc) -> list[dict]:
        """Extract image references from a DoclingDocument."""
        results = []
        for i, picture in enumerate(doc.pictures):
            results.append({
                "name": f"image-{i+1}.png",
                "original_src": f"docling://picture-{i}",
            })
        return results

    @staticmethod
    def get_text(doc) -> str:
        """Get plain text representation."""
        return doc.export_to_text()
