#!/usr/bin/env python3
"""
Insert Missing Harvests → DB

Reads all extraction JSONs from ROVER/incoming/harvests/ that are NOT
already in the nebula.harvests PostgreSQL table, finds the corresponding
harvested markdown for source_text, and inserts them all in batch.

No Ollama extraction needed — the candidate data already exists in the JSONs.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/insert_missing_harvests.py
"""

import json
import logging
import re
import subprocess
import sys
from pathlib import Path

from event_emitter import emit_harvest_captured

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("insert_missing")

# ── Config ─────────────────────────────────────────────────────
PROJECT_ROOT = Path("/home/codex/dev")
INCOMING_HARVESTS = PROJECT_ROOT / "nexus/audit/ROVER/incoming/harvests"
INCOMING_CHATS = PROJECT_ROOT / "nexus/audit/ROVER/incoming/chats"
PROCESSED_CHATS = PROJECT_ROOT / "nexus/audit/ROVER/processed/chats"
CHATS_DIR = PROJECT_ROOT / "chats"

DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
]


def sql_escape(val: str | None) -> str:
    """Escape a string for safe use as a PostgreSQL single-quoted literal."""
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def make_slug(name: str) -> str:
    """Normalize a name into a simple slug."""
    return re.sub(r'[^a-z0-9]+', '_', name.lower()).strip('_')


def extract_model_from_md(md_text: str) -> str | None:
    """Try to extract model from harvested MD header line like '**Model:** DeepSeek V4'."""
    m = re.search(r'\*\*Model:\*\*\s*(.+?)(?:\n|$)', md_text)
    return m.group(1).strip() if m else None


def extract_source_from_md(md_text: str) -> str | None:
    """Try to extract source path from harvested MD header like '**Source:** chats/Foo.html'."""
    m = re.search(r'\*\*Source:\*\*\s*(.+?)(?:\n|$)', md_text)
    return m.group(1).strip() if m else None


def find_harvested_md(slug: str) -> str | None:
    """Find the harvested markdown file for a given slug. Returns content or None.
    Searches ROVER incoming/chats, ROVER processed/chats, and root chats/ dir."""
    for base_dir in [INCOMING_CHATS, PROCESSED_CHATS, CHATS_DIR]:
        md_path = base_dir / f"{slug}_harvested.md"
        if md_path.exists():
            return md_path.read_text(encoding="utf-8")
    return None


def deduce_source_from_chat(source_chat: str) -> tuple[str, str]:
    """
    Given a source_chat like 'Nexus - AI Tooling Evolution',
    return (source_path, source_filename) by looking for the matching HTML.
    """
    # Try exact match first
    html_path = CHATS_DIR / f"{source_chat}.html"
    if html_path.exists():
        return (
            str(html_path.relative_to(PROJECT_ROOT)),
            html_path.name,
        )

    # Try more flexible matching
    source_chat_norm = source_chat.lower().replace(" ", "")
    for candidate in CHATS_DIR.glob("*.html"):
        cand_norm = candidate.stem.lower().replace(" ", "")
        if cand_norm == source_chat_norm:
            return (
                str(candidate.relative_to(PROJECT_ROOT)),
                candidate.name,
            )
        # Also try partial match
        if source_chat_norm in cand_norm or cand_norm in source_chat_norm:
            return (
                str(candidate.relative_to(PROJECT_ROOT)),
                candidate.name,
            )

    # Fallback: construct path
    fallback_filename = f"{source_chat}.html"
    fallback_path = f"chats/{fallback_filename}"
    log.warning("HTML not found for '%s', using fallback: %s", source_chat, fallback_path)
    return (fallback_path, fallback_filename)


def insert_harvest(
    source_path: str,
    source_filename: str,
    model: str,
    total_candidates: int,
    candidates: list,
    source_text: str | None,
    tags: list[str],
    metadata: dict,
    file_size: int | None = None,
) -> dict | None:
    """Insert a harvest record via docker exec psql (stdin pipe)."""

    candidates_json = json.dumps(candidates, ensure_ascii=False)
    metadata_json = json.dumps(metadata, ensure_ascii=False)
    source_text_val = source_text or ""

    tag_literals = ", ".join(sql_escape(t) for t in tags)
    tags_array = f"ARRAY[{tag_literals}]" if tag_literals else "'{}'"

    file_size_col = "file_size,"
    file_size_val = f"{file_size}," if file_size is not None else "NULL,"

    sql = f"""
    INSERT INTO nebula.harvests
        (source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, {file_size_col.rstrip(',')})
    VALUES
        ({sql_escape(source_path)},
         {sql_escape(source_filename)},
         {sql_escape(model)},
         {total_candidates},
         $${candidates_json}$$::jsonb,
         {sql_escape(source_text_val)}::text,
         {tags_array}::text[],
         $${metadata_json}$$::jsonb,
         {file_size_val.rstrip(',')})
    RETURNING id, source_filename, total_candidates, created_at;
    """

    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=30,
        )

        if result.returncode != 0:
            log.error("INSERT failed for %s: %s", source_filename, result.stderr.strip())
            return None

        out = result.stdout.strip()
        if not out:
            log.warning("INSERT returned no output for %s", source_filename)
            return None

        # Parse psql output: "uuid|filename|candidates\nINSERT 0 1"
        lines = out.splitlines()
        data_line = lines[0] if lines else ""
        if "|" not in data_line:
            # Sometimes psql prints the INSERT message before the RETURNING output
            for line in lines:
                if "|" in line:
                    data_line = line
                    break
        parts = data_line.split("|")
        if len(parts) >= 3:
            return {"id": parts[0], "filename": parts[1], "candidates": int(parts[2])}
        log.warning("Could not parse INSERT output: %s", out)
        return None

    except subprocess.TimeoutExpired:
        log.error("INSERT timeout for %s", source_filename)
        return None
    except Exception as e:
        log.error("INSERT error for %s: %s", source_filename, e)
        return None


def process_one(slug: str) -> bool:
    """Process one slug: read JSON, find MD, insert to DB. Returns True on success."""
    json_path = INCOMING_HARVESTS / f"{slug}_extraction.json"

    if not json_path.exists():
        log.error("  Extraction JSON not found: %s", json_path)
        return False

    # Read extraction JSON
    try:
        data = json.loads(json_path.read_text(encoding="utf-8"))
    except Exception as e:
        log.error("  Failed to parse JSON: %s", e)
        return False

    agenda_items = data.get("agenda_items", [])
    source_chat = data.get("source_chat", "")

    total = len(agenda_items)

    # Find harvested MD (searches incoming, processed, and root chats/)
    harvested_md = find_harvested_md(slug)
    has_source_text = harvested_md is not None

    if not has_source_text:
        log.info("  No harvested MD found for %s, inserting without source_text", slug)

    # Determine source_path and source_filename
    # Priority: 1) harvested MD header, 2) extraction JSON source_chat, 3) derive from slug
    source_path = None
    source_filename = None

    if harvested_md:
        md_source = extract_source_from_md(harvested_md)
        if md_source:
            source_path = md_source
            source_filename = Path(md_source).name

    # If no source_chat in JSON, try to extract it from MD header source
    if not source_chat and harvested_md:
        md_source = extract_source_from_md(harvested_md)
        if md_source:
            # Derive source_chat from the HTML filename (strip .html and path)
            html_name = Path(md_source).stem
            source_chat = html_name

    # Still no source_chat — derive from slug (convert underscores back)
    if not source_chat:
        source_chat = slug.replace("_", " ").title()
        log.info("  Derived source_chat from slug: '%s'", source_chat)

    if not source_filename:
        source_path, source_filename = deduce_source_from_chat(source_chat)

    # Determine model
    model = "DeepSeek V4"  # default
    if harvested_md:
        md_model = extract_model_from_md(harvested_md)
        if md_model:
            model = md_model

    # Build candidates array from agenda_items
    candidates_data = []
    for item in agenda_items:
        entry = {
            "title": item.get("title", ""),
            "status": item.get("status", "Proposed"),
            "intent_description": item.get("intent_description", ""),
            "requirements": item.get("requirements", []),
            "implementation_notes": item.get("implementation_notes", []),
            "code_snippets": [
                {
                    "language": c.get("language", ""),
                    "purpose": c.get("purpose", ""),
                    "raw_code": c.get("raw_code", ""),
                }
                for c in item.get("code_snippets", [])
            ],
            "open_questions": item.get("open_questions", []),
        }
        candidates_data.append(entry)

    # Build tags
    tags = [make_slug(slug), "harvest", "rover-batch"]
    model_slug = make_slug(model.split(" ")[0] if model else "unknown")
    tags.append(model_slug)

    metadata = {
        "slug": slug,
        "source_chat": source_chat,
        "model": model,
        "has_source_text": has_source_text,
    }

    # Compute file_size from source file on disk
    file_size = None
    if source_path:
        full_path = Path("/home/codex/dev") / source_path
        try:
            file_size = full_path.stat().st_size
        except OSError:
            pass

    result = insert_harvest(
        source_path=source_path,
        source_filename=source_filename,
        model=model,
        total_candidates=total,
        candidates=candidates_data,
        source_text=harvested_md if has_source_text else None,
        tags=tags,
        metadata=metadata,
        file_size=file_size,
    )

    if result:
        log.info(
            "  ✅ %s | %s | %d candidates | model=%s | source_text=%s",
            result["id"][:8],
            result["filename"],
            result["candidates"],
            model,
            "yes" if has_source_text else "no",
        )

        # Cascade event: harvest.captured
        try:
            emit_harvest_captured(
                harvest_id=result["id"],
                source_file=result["filename"],
                total_candidates=result["candidates"],
                source="rover.insert_missing_harvests",
            )
        except Exception as e:
            log.warning("  harvest.captured emission failed: %s", e)

        return True
    else:
        log.error("  ❌ INSERT failed")
        return False


def main():
    log.info("=" * 70)
    log.info("Insert Missing Harvests → DB")
    log.info("=" * 70)

    # Read the missing slugs
    missing_file = Path("/tmp/missing_harvests.txt")
    if not missing_file.exists():
        log.error("/tmp/missing_harvests.txt not found — run the diff script first")
        return 1

    slugs = [line.strip() for line in missing_file.read_text().splitlines() if line.strip()]
    log.info("Slugs to process: %d", len(slugs))

    if not slugs:
        log.info("No missing harvests — everything is already in the DB.")
        return 0

    success = 0
    failed = 0
    total_candidates = 0

    for i, slug in enumerate(slugs):
        log.info("[%d/%d] %s", i + 1, len(slugs), slug)
        ok = process_one(slug)
        if ok:
            success += 1
            # Get candidate count from the extraction JSON
            json_path = INCOMING_HARVESTS / f"{slug}_extraction.json"
            try:
                data = json.loads(json_path.read_text(encoding="utf-8"))
                total_candidates += len(data.get("agenda_items", []))
            except Exception:
                pass
        else:
            failed += 1

    log.info("=" * 70)
    log.info("COMPLETE: %d succeeded, %d failed, %d total candidates inserted",
             success, failed, total_candidates)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
