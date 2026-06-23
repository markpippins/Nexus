#!/usr/bin/env python3
"""
Batch Harvest → DB

Processes unprocessed HTML chat transcripts through the Rover harvest pipeline
and writes the extracted results directly into the nebula.harvests PostgreSQL
table instead of generating markdown files.

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 batch_harvest_to_db.py
"""

import json
import logging
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from harvest_pipeline import convert_to_markdown, chunk_text, extract_chunk
from schemas import SpecificationAgenda

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("batch_harvest_db")

# ── Config ─────────────────────────────────────────────────────
PROJECT_ROOT = Path("/home/codex/dev")
CHATS_DIR = PROJECT_ROOT / "chats"
MODEL = "qwen3.5:latest"
OLLAMA_URL = "http://localhost:11434"

# The 5 most recent unprocessed HTMLs (verified against ROVER processed/incoming)
TRANSCRIPTS = [
    "Nexus - OrientDB, Pinecone & Convex",
    "Nexus - Reviewing Qwen's Output",
    "Reviewing LOSM Risk Management System",
    "NLP Output from Chat Transcripts",
    "Cognitive CPU Scheduler",
]

DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
]


def sql_escape(val: str) -> str:
    """Escape a string for safe use as a PostgreSQL single-quoted literal."""
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def insert_harvest(source_path: str, source_filename: str, model: str,
                    total_candidates: int, candidates: list, source_text: str | None,
                    tags: list[str], metadata: dict) -> dict | None:
    """Insert a harvest record via docker exec psql (using temp file for large SQL)."""

    candidates_json = json.dumps(candidates, ensure_ascii=False)
    metadata_json = json.dumps(metadata, ensure_ascii=False)
    source_text_val = source_text or ""

    # Build tags array: single-quoted strings with proper escaping
    tag_literals = ", ".join(sql_escape(t) for t in tags)
    tags_array = f"ARRAY[{tag_literals}]"

    sql = f"""
    INSERT INTO nebula.harvests
        (source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata)
    VALUES
        ({sql_escape(source_path)},
         {sql_escape(source_filename)},
         {sql_escape(model)},
         {total_candidates},
         '{candidates_json}'::jsonb,
         {sql_escape(source_text_val)}::text,
         {tags_array}::text[],
         '{metadata_json}'::jsonb)
    RETURNING id, source_filename, total_candidates, created_at;
    """

    # Write SQL to a temp file and use psql -f to avoid ARG_MAX issues with large source_text
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".sql", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(sql)
            tmp_path = tmp.name

        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A", "-f", tmp_path],
            capture_output=True, text=True, timeout=60,
        )
        Path(tmp_path).unlink(missing_ok=True)

        if result.returncode != 0:
            stderr = result.stderr.strip()
            log.error("INSERT failed for %s: %s", source_filename, stderr)
            return None

        out = result.stdout.strip()
        if out:
            parts = out.split("|")
            log.info("INSERTED harvest %s | %s | %s candidates",
                     parts[0], parts[1], parts[2])
            return {"id": parts[0], "filename": parts[1], "candidates": int(parts[2])}
        else:
            log.warning("INSERT returned no output for %s", source_filename)
            return None

    except subprocess.TimeoutExpired:
        log.error("INSERT timeout for %s", source_filename)
        return None
    except Exception as e:
        log.error("INSERT error for %s: %s", source_filename, e)
        return None


def make_slug(name: str) -> str:
    """Normalize a transcript title into a slug suitable for tags."""
    return re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')


def process_transcript(name: str) -> int:
    """Process one HTML transcript and write to DB. Returns candidate count or -1 on failure."""
    html_path = CHATS_DIR / f"{name}.html"
    if not html_path.exists():
        log.error("File not found: %s", html_path)
        return -1

    slug = make_slug(name)

    log.info("═" * 60)
    log.info("Processing: %s", name)

    # Step 1: Convert HTML → Markdown
    try:
        log.info("Converting HTML to markdown via Docling...")
        markdown = convert_to_markdown(str(html_path))
        log.info("Markdown: %d chars", len(markdown))
    except Exception as e:
        log.error("Docling conversion failed: %s", e)
        return -1

    # Step 2: Chunk text
    chunks = chunk_text(markdown)
    log.info("Chunks: %d", len(chunks))

    if not chunks:
        log.warning("No chunks produced, skipping")
        return -1

    # Step 3: Extract via Ollama for each chunk
    all_agendas = []
    failures = 0

    for i, chunk in enumerate(chunks):
        log.info("Extracting chunk %d/%d via Ollama (%s)...", i + 1, len(chunks), MODEL)
        start = time.time()
        result = extract_chunk(
            chunk, i, len(chunks),
            model=MODEL, ollama_url=OLLAMA_URL,
        )
        elapsed = time.time() - start
        if result is not None:
            all_agendas.append(result)
            log.info("Chunk %d/%d done in %.1fs — %d items",
                     i + 1, len(chunks), elapsed, len(result.agenda_items))
        else:
            failures += 1
            log.error("Chunk %d/%d FAILED after %.1fs", i + 1, len(chunks), elapsed)

    # Step 4: Combine results
    combined = SpecificationAgenda(agenda_items=[])
    for agenda in all_agendas:
        combined.agenda_items.extend(agenda.agenda_items)

    total = len(combined.agenda_items)
    log.info("Total candidates extracted: %d (across %d/%d successful chunks, %d failures)",
             total, len(all_agendas), len(chunks), failures)

    # Step 5: Write to database
    source_path = str(html_path.relative_to(PROJECT_ROOT))
    source_filename = html_path.name

    # Build candidates array as plain dicts for JSONB
    candidates_data = []
    for item in combined.agenda_items:
        entry = {
            "title": item.title,
            "status": item.status,
            "intent_description": item.intent_description,
            "requirements": item.requirements,
            "implementation_notes": item.implementation_notes,
            "code_snippets": [
                {"language": c.language, "purpose": c.purpose, "raw_code": c.raw_code}
                for c in item.code_snippets
            ],
            "open_questions": item.open_questions,
        }
        candidates_data.append(entry)

    tags = ["qwen3.5", "harvest", slug]
    if failures > 0:
        tags.append("partial")

    metadata = {
        "total_chunks": len(chunks),
        "successful_chunks": len(all_agendas),
        "failed_chunks": failures,
        "model": MODEL,
        "ollama_url": OLLAMA_URL,
    }

    result = insert_harvest(
        source_path=source_path,
        source_filename=source_filename,
        model=MODEL,
        total_candidates=total,
        candidates=candidates_data,
        source_text=markdown if total > 0 else None,
        tags=tags,
        metadata=metadata,
    )

    if result:
        log.info("✅ %s → DB harvest %s (%d candidates)", name, result["id"], result["candidates"])
    else:
        log.error("❌ %s → DB INSERT failed", name)

    return total


def main():
    log.info("=" * 60)
    log.info("Batch Harvest → DB")
    log.info("Model: %s @ %s", MODEL, OLLAMA_URL)
    log.info("Transcripts: %d", len(TRANSCRIPTS))
    for t in TRANSCRIPTS:
        log.info("  • %s", t)
    log.info("=" * 60)

    results = {}
    total_candidates_global = 0

    for name in TRANSCRIPTS:
        count = process_transcript(name)
        results[name] = count
        if count >= 0:
            total_candidates_global += count
        log.info("")

    log.info("=" * 60)
    log.info("BATCH COMPLETE")
    log.info("─" * 60)
    for name, count in results.items():
        if count >= 0:
            log.info("✅ %s: %d candidates", name, count)
        else:
            log.info("❌ %s: FAILED", name)
    log.info("─" * 60)
    log.info("Total candidates harvested to DB: %d", total_candidates_global)
    log.info("=" * 60)

    return 0 if all(c >= 0 for c in results.values()) else 1


if __name__ == "__main__":
    sys.exit(main())
