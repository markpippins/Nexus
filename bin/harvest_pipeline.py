#!/usr/bin/env python3
"""
Rover: Chat Transcript Harvesting Pipeline — Library

Provides utility functions for the Rover harvest pipeline.
Stage 1 (deterministic) runs via batch_harvest_to_db.py.
Stage 2 (optional inference) files candidates into the Nebula hierarchy.

Usage:
    from harvest_pipeline import convert_to_markdown
    markdown = convert_to_markdown("transcript.html")
"""

import logging

log = logging.getLogger("rover")


def convert_to_markdown(html_path: str) -> str:
    """Convert HTML to markdown via Docling."""
    from docling.document_converter import DocumentConverter

    log.info("Converting %s via Docling...", html_path)
    converter = DocumentConverter()
    result = converter.convert(html_path)
    markdown = result.document.export_to_markdown()
    log.info("Docling produced %d characters", len(markdown))
    return markdown
