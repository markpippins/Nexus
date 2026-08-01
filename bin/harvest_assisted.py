#!/usr/bin/env python3
"""
Rover Assisted Harvest: Docling + chunking + rule-based inference extraction.

Usage:
    source .venv/bin/activate
    python3 harvest_assisted.py --input /path/to/chat.html [--output results.json]
    
Processes one HTML file through:
  1. Docling HTML → markdown
  2. langchain chunking (40k chars, 4k overlap)
  3. Rule-based extraction of agenda_items from each chunk
  4. Merging and deduplication
  5. Writing results to JSON file
"""

import argparse
import json
import logging
import os
import re
import sys
from pathlib import Path

LOG_DIR = Path("/home/codex/dev/nexus/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_DIR / "harvest_assisted.log"),
    ])
log = logging.getLogger("harvest_assisted")

# ── Inference extraction functions ──────────────────────────────────────────

def extract_code_blocks(text: str) -> list[dict]:
    """Extract fenced code blocks with language and purpose."""
    blocks = []
    pattern = r'```(\w+)\n(.*?)\n```'
    for match in re.finditer(pattern, text, re.DOTALL):
        lang = match.group(1).strip().lower()
        code = match.group(2).strip()
        # Skip empty blocks
        if not code:
            continue
        # Extract purpose from surrounding context (2 lines before)
        pos = match.start()
        prefix = text[max(0, pos-200):pos].strip()
        purpose = infer_purpose(prefix, lang, code)
        blocks.append({
            "language": lang,
            "purpose": purpose,
            "raw_code": code
        })
    return blocks


def infer_purpose(prefix: str, lang: str, code: str) -> str:
    """Infer the purpose of a code snippet from context."""
    # Try to find a heading or sentence near the code
    lines = prefix.split('\n')
    # Look for the last non-empty line that isn't a code fence
    for line in reversed(lines):
        line = line.strip()
        if line and not line.startswith('```'):
            # Truncate to reasonable length
            if len(line) > 120:
                line = line[:117] + '...'
            return line
    # Fallback: use first line of code
    first_line = code.split('\n')[0][:80]
    return f"Code snippet: {first_line}"


def extract_headings(text: str) -> list[dict]:
    """Extract markdown headings as potential agenda item titles."""
    headings = []
    for match in re.finditer(r'^(#{1,4})\s+(.+)$', text, re.MULTILINE):
        level = len(match.group(1))
        title = match.group(2).strip()
        headings.append({"level": level, "title": title})
    return headings


def extract_requirements(text: str) -> list[str]:
    """Extract bullet-point items that look like requirements."""
    reqs = []
    # Match markdown list items near keywords
    patterns = [
        r'[-*]\s+\[.?[xX]?.?\]\s+(.+)',  # checkbox items
        r'(?:^|\n)\s*[-*]\s+(.+)$',       # bullet items
    ]
    for pattern in patterns:
        for match in re.finditer(pattern, text, re.MULTILINE):
            item = match.group(1).strip()
            if item and len(item) > 10 and not item.startswith('#'):
                # Check if it looks like a requirement
                keywords = ['should', 'must', 'need', 'require', 'support', 'implement',
                           'allow', 'enable', 'ensure', 'provide', 'add', 'create',
                           'refactor', 'migrate', 'update', 'fix', 'handle']
                if any(kw in item.lower() for kw in keywords) or len(item) > 30:
                    # Deduplicate
                    if not any(existing in item or item in existing for existing in reqs):
                        reqs.append(item)
    return reqs


def extract_implementation_notes(text: str) -> list[str]:
    """Extract technical notes about architecture or infrastructure."""
    notes = []
    # Look for technical keywords in paragraphs
    tech_patterns = [
        r'(?:architecture|infrastructure|implement|deploy|design|migrate|refactor).{10,200}',
        r'(?:using|built with|powered by|runs on|written in).{10,200}',
    ]
    for pattern in tech_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
            note = match.group(0).strip()
            # Clean up whitespace
            note = re.sub(r'\s+', ' ', note)
            if len(note) > 20:
                notes.append(note[:500])
    return notes[:10]


def extract_questions(text: str) -> list[str]:
    """Extract questions or unresolved items."""
    questions = []
    for match in re.finditer(r'[^.]*\?', text):
        q = match.group(0).strip()
        if len(q) > 15:
            questions.append(q[:300])
    return questions[:5]


def extract_agenda_from_chunk(chunk: str, chunk_index: int) -> dict:
    """Extract agenda items from a single chunk using rule-based parsing."""
    headings = extract_headings(chunk)
    code_blocks = extract_code_blocks(chunk)
    requirements = extract_requirements(chunk)
    notes = extract_implementation_notes(chunk)
    questions = extract_questions(chunk)

    # Generate agenda items from headings + code blocks
    items = []
    
    if headings:
        for h in headings[:10]:
            # Find text after heading for context
            items.append({
                "title": h["title"],
                "status": "Proposed",
                "intent_description": f"Discussion topic: {h['title']}",
                "requirements": requirements[:5],
                "implementation_notes": notes[:3],
                "code_snippets": [],
                "open_questions": questions[:3]
            })
    
    # Also create items for code blocks without headings
    if code_blocks and not headings:
        for cb in code_blocks[:5]:
            items.append({
                "title": f"Code: {cb['purpose'][:80]}",
                "status": "Agreed" if "implement" in cb['purpose'].lower() else "Proposed",
                "intent_description": cb['purpose'] or "Code implementation extracted from transcript",
                "requirements": [],
                "implementation_notes": notes[:3],
                "code_snippets": [cb],
                "open_questions": []
            })
    
    # If nothing structured found, create a generic item
    if not items and (requirements or notes or code_blocks):
        items.append({
            "title": f"Chunk {chunk_index + 1} - Technical Discussion",
            "status": "Proposed",
            "intent_description": notes[0][:200] if notes else "Technical discussion from chat transcript",
            "requirements": requirements[:5],
            "implementation_notes": notes[:5],
            "code_snippets": code_blocks,
            "open_questions": questions[:3]
        })
    
    return {"agenda_items": items}


def deduplicate_items(items: list[dict]) -> list[dict]:
    """Deduplicate agenda items by title similarity."""
    seen_titles = set()
    unique = []
    for item in items:
        title_lower = item.get("title", "").lower().strip()
        # Check if very similar to any seen title
        is_dup = False
        for seen in seen_titles:
            # Simple overlap check
            words = set(title_lower.split())
            seen_words = set(seen.split())
            if len(words) > 3 and len(words & seen_words) / max(len(words), len(seen_words)) > 0.7:
                is_dup = True
                break
            if title_lower in seen or seen in title_lower:
                is_dup = True
                break
        if not is_dup:
            seen_titles.add(title_lower)
            unique.append(item)
    return unique


# ── Main pipeline ───────────────────────────────────────────────────────────

def run_harvest(input_path: str, output_path: str | None = None) -> dict:
    """Run the full harvest pipeline on one HTML file."""
    log.info("═" * 60)
    log.info("Processing: %s", input_path)
    
    # Step 1: Docling conversion
    from docling.document_converter import DocumentConverter
    log.info("Converting HTML → markdown via Docling...")
    converter = DocumentConverter()
    result = converter.convert(input_path)
    markdown = result.document.export_to_markdown()
    log.info("Docling produced %d characters", len(markdown))
    
    # Step 2: Chunking
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=40000,
        chunk_overlap=4000,
        length_function=len,
    )
    chunks = splitter.split_text(markdown)
    log.info("Split into %d chunks", len(chunks))
    
    if not chunks:
        log.warning("No chunks produced")
        return {"agenda_items": [], "total_chunks": 0, "successful_chunks": 0}
    
    # Step 3: Inference extraction (rule-based)
    all_items = []
    failures = 0
    for i, chunk in enumerate(chunks):
        try:
            log.info("Extracting chunk %d/%d (%d chars)...", i + 1, len(chunks), len(chunk))
            agenda = extract_agenda_from_chunk(chunk, i)
            items = agenda.get("agenda_items", [])
            all_items.extend(items)
            log.info("  → %d items extracted", len(items))
        except Exception as e:
            log.error("  → Extraction failed: %s", e)
            failures += 1
    
    # Step 4: Deduplicate
    total_before = len(all_items)
    all_items = deduplicate_items(all_items)
    log.info("Deduplicated: %d → %d items", total_before, len(all_items))
    
    # Step 5: Build result
    result = {
        "agenda_items": all_items,
        "total_chunks": len(chunks),
        "successful_chunks": len(chunks) - failures,
        "source_path": input_path,
        "markdown": markdown,
    }
    
    # Write output
    if output_path:
        with open(output_path, 'w') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        log.info("Wrote results to %s", output_path)
    
    log.info("Done: %d items, %d/%d chunks successful", len(all_items), 
             len(chunks) - failures, len(chunks))
    return result


def main():
    parser = argparse.ArgumentParser(description="Assisted Rover harvest")
    parser.add_argument("--input", required=True, help="Path to HTML chat transcript")
    parser.add_argument("--output", help="Path to output JSON (optional)")
    args = parser.parse_args()
    
    result = run_harvest(args.input, args.output)
    if not result["agenda_items"]:
        log.warning("No agenda items extracted")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
