#!/usr/bin/env python3
"""
Wave 1 batch processing — deterministic Stage 1 only.

1. Convert HTML → markdown (BeautifulSoup)
2. Chunk the markdown
3. Save markdown and chunks to output dir for agent-in-the-loop extraction

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 batch_wave1.py [--dry-run]
"""

import argparse
import json
import logging
import sys
import time
from pathlib import Path

# ── monkey-patch: use BS4 HTML→markdown ──────────────────────────────
from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning
import warnings
warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)

def simple_html_to_md(html_path: str) -> str:
    import re
    html = Path(html_path).read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "meta", "link"]):
        tag.decompose()
    lines = []
    for el in soup.find_all(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
                             "li", "pre", "blockquote", "hr", "br"]):
        tag = el.name
        if el.find_parent("pre") and tag != "pre":
            continue
        if tag == "pre":
            code = el.find("code")
            text = code.get_text() if code else el.get_text()
            lines.append("```\n" + text.rstrip("\n") + "\n```\n")
            continue
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            level = int(tag[1])
            text = el.get_text(strip=True)
            if text:
                lines.append(f"{'#' * level} {text}\n")
            continue
        if tag == "hr":
            lines.append("---\n")
            continue
        if tag == "blockquote":
            text = el.get_text(strip=True)
            if text:
                lines.append(f"> {text}\n")
            continue
        if tag == "br":
            lines.append("")
            continue
        text = el.get_text(strip=True)
        if text:
            if tag == "li":
                lines.append(f"- {text}")
            else:
                lines.append(text + "\n")
    raw = "\n".join(lines)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()

# ── imports ───────────────────────────────────────────────────────────
from qwen_extract import chunk_text

# ── logging ───────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("batch-wave1")

# ── config ────────────────────────────────────────────────────────────
CHATS_DIR = Path("/home/codex/dev/chats")
OUTPUT_DIR = Path("/home/codex/dev/nexus/audit/ROVER/output/wave1")
CHUNKS_DIR = OUTPUT_DIR / "chunks"
CHUNKS_DIR.mkdir(parents=True, exist_ok=True)

WAVE1 = [
    "LOSM Architecture Assessment.html",
    "Work Artifact IR Definition.html",
    "Reflection Graph Mutation Policy.html",
    "Competing Intentions Model.html",
    "Cross-schema evidence bridge.html",
    "Plans Table Decision.html",
    "Global Change Log Design.html",
    "Chronal Alignment of Projections.html",
    "Indexing vs Projection System.html",
    "Unit of Update Analysis.html",
]


def process_transcript(html_path: Path, dry_run: bool = False) -> bool:
    name = html_path.stem
    slug = name.lower().replace(" ", "-").replace("--", "-")
    log.info("=" * 70)
    log.info("PROCESSING: %s", name)
    log.info("=" * 70)

    # Step 1: Convert HTML to markdown
    log.info("[1/3] Converting HTML to markdown...")
    markdown = simple_html_to_md(str(html_path))
    md_len = len(markdown)
    log.info("  → %d chars", md_len)

    if md_len < 200:
        log.warning("  → Very little content — skipping")
        return False

    # Step 2: Chunk
    log.info("[2/3] Chunking...")
    chunks = chunk_text(markdown)
    log.info("  → %d chunks", len(chunks))

    if dry_run:
        log.info("  → DRY RUN")
        return True

    # Save full markdown
    md_path = OUTPUT_DIR / f"{slug}.md"
    md_path.write_text(markdown)
    log.info("  → Saved markdown: %s", md_path.name)

    # Save chunks individually
    chunks_dir = CHUNKS_DIR / slug
    chunks_dir.mkdir(parents=True, exist_ok=True)
    for i, chunk in enumerate(chunks):
        chunk_path = chunks_dir / f"chunk_{i+1:03d}.txt"
        chunk_path.write_text(chunk)

    # Save chunk index
    index = {
        "source": html_path.name,
        "slug": slug,
        "total_chunks": len(chunks),
        "total_chars": md_len,
        "chunks": [
            {"index": i + 1, "path": f"chunks/{slug}/chunk_{i+1:03d}.txt", "size": len(c)}
            for i, c in enumerate(chunks)
        ],
    }
    index_path = OUTPUT_DIR / f"{slug}-index.json"
    with open(index_path, "w") as f:
        json.dump(index, f, indent=2)

    log.info("  → Saved %d chunks + index", len(chunks))
    return True


def main():
    parser = argparse.ArgumentParser(description="Wave 1 deterministic processing")
    parser.add_argument("--dry-run", action="store_true", help="Discover and report without processing")
    parser.add_argument("--file", nargs="*", help="Specific Wave 1 files to process (default: all 10)")
    args = parser.parse_args()

    if args.file:
        targets = [CHATS_DIR / (f if f.endswith(".html") else f + ".html") for f in args.file]
    else:
        targets = [CHATS_DIR / f for f in WAVE1]

    valid = [p for p in targets if p.exists()]
    missing = [str(p) for p in targets if not p.exists()]
    if missing:
        log.warning("Missing files (skipping): %s", ", ".join(missing))

    if args.dry_run:
        log.info("DRY RUN — would process %d file(s):", len(valid))
        for p in valid:
            log.info("  • %s", p.name)
        return 0

    log.info("═" * 70)
    log.info("Wave 1 — Stage 1 deterministic: %d transcript(s)", len(valid))
    log.info("Output: %s", OUTPUT_DIR)
    log.info("═" * 70)

    results = {}
    for p in valid:
        start = time.time()
        ok = process_transcript(p, args.dry_run)
        elapsed = time.time() - start
        results[p.name] = (ok, elapsed)

    log.info("═" * 70)
    log.info("WAVE 1 STAGE 1 COMPLETE")
    log.info("-" * 70)
    success = sum(1 for ok, _ in results.values() if ok)
    for name, (ok, elapsed) in results.items():
        icon = "✅" if ok else "❌"
        log.info("  %s %s (%.1fs)", icon, name, elapsed)
    log.info("-" * 70)
    log.info("%d/%d succeeded", success, len(results))
    log.info("Output dir: %s", OUTPUT_DIR)
    log.info("Next: agent-in-the-loop extraction of spec candidates from chunks/")
    log.info("═" * 70)
    return 0 if success == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
