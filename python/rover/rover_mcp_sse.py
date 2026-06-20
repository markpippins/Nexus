#!/usr/bin/env python3
"""
rover-mcp SSE launcher: starts the rover MCP server with a lightweight
HTML → markdown converter (BeautifulSoup) so we don't need Docling's
heavy dependency tree.

Usage:
    ./rover_mcp_sse.py                    # starts on port 3101
    ./rover_mcp_sse.py --port 3102        # custom port
"""

import argparse
import logging
import sys

# ── Monkey-patch convert_to_markdown before any rover imports ────────
from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning
import warnings
warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)


def _simple_html_to_markdown(html_path: str) -> str:
    """Convert HTML chat transcript to Markdown text using BeautifulSoup.

    Preserves:
      - Code blocks (pre > code)
      - Headings (h1-h6)
      - Paragraphs / list items
      - Speaker labels (bold/strong markers)
    """
    import re
    from pathlib import Path

    html = Path(html_path).read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")

    # Remove script/style tags
    for tag in soup(["script", "style", "noscript", "meta", "link"]):
        tag.decompose()

    lines = []
    for el in soup.find_all(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
                             "li", "pre", "blockquote", "hr", "br",
                             "table", "tr", "td", "th"]):
        tag = el.name

        # Skip elements inside pre blocks (handled by pre itself)
        if el.find_parent("pre") and tag != "pre":
            continue

        if tag == "pre":
            code = el.find("code")
            text = code.get_text() if code else el.get_text()
            lines.append("```\n" + text.rstrip("\n") + "\n```")
            lines.append("")
            continue

        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(tag[1])
            prefix = "#" * level
            text = el.get_text(strip=True)
            if text:
                lines.append(f"{prefix} {text}")
                lines.append("")
            continue

        if tag == "hr":
            lines.append("---")
            continue

        if tag == "blockquote":
            text = el.get_text(strip=True)
            if text:
                lines.append(f"> {text}")
                lines.append("")
            continue

        if tag == "br":
            lines.append("")
            continue

        if tag in ("th", "td"):
            continue  # skip table cells for simplicity

        text = el.get_text(strip=True)
        if text:
            if tag == "li":
                lines.append(f"- {text}")
            else:
                lines.append(text)
                lines.append("")

    raw = "\n".join(lines)

    # Collapse excessive blank lines
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()


# ── Patch the pipeline module ─────────────────────────────────────────
import harvest_pipeline
harvest_pipeline.convert_to_markdown = _simple_html_to_markdown

# ── Now import rover MCP server (uses patched convert_to_markdown) ────
import rover_mcp_server

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("rover-mcp-sse")


def main():
    parser = argparse.ArgumentParser(description="Rover MCP SSE server")
    parser.add_argument("--port", type=int, default=3101, help="Port to listen on")
    parser.add_argument("--host", type=str, default="0.0.0.0", help="Host to bind to")
    args = parser.parse_args()

    log.info("Starting rover-mcp SSE on %s:%d", args.host, args.port)

    import uvicorn
    app = rover_mcp_server.mcp.sse_app()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
