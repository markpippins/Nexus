#!/usr/bin/env python3
"""
Ingest nexus/audit/HISTORY/ files into nebula.agent_records.

Each file becomes a report-type agent record with:
  - recordType: report
  - role: architect (Gemini-era work)
  - title: extracted from first heading or filename
  - content: full file contents
  - tags: ["source:history", type from filename]
  - level: 3 (architectural)
  - visibilityScope: all

After ingestion, creates cross_references linking records to candidates
by title similarity.
"""

import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

HISTORY_DIR = Path(__file__).parent.parent.parent / "audit" / "HISTORY"
NEBULA_URL = "http://localhost:3101"


def extract_title(content: str, filename: str) -> str:
    """Extract title from first heading or fall back to filename."""
    for line in content.split("\n")[:20]:
        m = re.match(r'^#\s+(.+)', line)
        if m:
            return m.group(1).strip()
    # Fall back to filename: strip extension and clean up
    stem = Path(filename).stem
    # Remove trailing numbers and dots
    stem = re.sub(r'[\.\d]+$', '', stem).strip('.')
    return stem.replace('-', ' ').replace('_', ' ').title() if stem else filename


def extract_type_from_filename(filename: str) -> str:
    """Extract the artifact type from filename pattern."""
    # e.g., implementation_plan.md.resolved-clean.30 → implementation_plan
    # e.g., walkthrough.md-clean.resolved → walkthrough
    # e.g., task.md.resolved-clean.0 → task
    m = re.match(r'^([a-z_]+)\.', filename)
    return m.group(1) if m else "unknown"


def create_agent_record(title: str, content: str, tags: list, source_path: str) -> str:
    """Create an agent record via the nebula API. Returns record ID."""
    payload = json.dumps({
        "recordType": "report",
        "role": "architect",
        "title": title,
        "content": content,
        "tags": tags,
        "level": 3,
        "visibilityScope": "all",
        "sourcePath": source_path,
    }).encode()

    req = urllib.request.Request(
        f"{NEBULA_URL}/api/agent-records",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            result = json.loads(resp.read())
            return result.get("id", "")
    except urllib.error.HTTPError as e:
        body = e.read().decode() if e.fp else ""
        print(f"  ERROR {e.code}: {body[:200]}", file=sys.stderr)
        return ""


def get_candidates() -> list:
    """Fetch all harvest candidates for cross-referencing."""
    try:
        with urllib.request.urlopen(f"{NEBULA_URL}/api/harvest-candidates?limit=500") as resp:
            data = json.loads(resp.read())
            return data.get("candidates", [])
    except Exception as e:
        print(f"Failed to fetch candidates: {e}", file=sys.stderr)
        return []


def create_cross_reference(source_type: str, source_id: str, target_type: str,
                           target_id: str, rel_type: str, metadata: dict) -> bool:
    """Create a cross-reference via the API."""
    payload = json.dumps({
        "sourceType": source_type,
        "sourceId": source_id,
        "targetType": target_type,
        "targetId": target_id,
        "relType": rel_type,
        "metadata": metadata,
    }).encode()

    req = urllib.request.Request(
        f"{NEBULA_URL}/api/cross-references",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        if e.code == 409:
            return True  # Already exists, that's fine
        body = e.read().decode() if e.fp else ""
        print(f"  XREF ERROR {e.code}: {body[:200]}", file=sys.stderr)
        return False


def title_similarity(a: str, b: str) -> float:
    """Simple word-overlap similarity for matching titles."""
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    if not words_a or not words_b:
        return 0.0
    intersection = words_a & words_b
    return len(intersection) / min(len(words_a), len(words_b))


def main():
    print(f"Ingesting files from {HISTORY_DIR}")

    files = sorted(HISTORY_DIR.iterdir())
    content_files = [f for f in files if f.suffix in ('.md', '.resolved') or '.md.' in f.name]

    # Skip metadata and JSON files
    content_files = [f for f in content_files if not f.name.endswith('.json')]

    print(f"Found {len(content_files)} content files")

    # Load candidates for cross-referencing
    candidates = get_candidates()
    print(f"Loaded {len(candidates)} candidates for cross-referencing")

    created = 0
    skipped = 0
    xrefs = 0

    for filepath in content_files:
        filename = filepath.name
        rel_path = str(filepath.relative_to(HISTORY_DIR.parent.parent.parent))

        try:
            content = filepath.read_text(errors='replace')
        except Exception as e:
            print(f"  SKIP {filename}: {e}")
            skipped += 1
            continue

        if len(content.strip()) < 20:
            print(f"  SKIP {filename}: too short ({len(content)} chars)")
            skipped += 1
            continue

        title = extract_title(content, filename)
        artifact_type = extract_type_from_filename(filename)

        tags = ["source:history", f"artifact:{artifact_type}", "era:gemini"]

        record_id = create_agent_record(title, content, tags, rel_path)
        if not record_id:
            skipped += 1
            continue

        created += 1
        print(f"  [{created}] {filename} → {title[:50]}... ({record_id[:8]}...)")

        # Cross-reference with matching candidates
        for cand in candidates:
            sim = title_similarity(title, cand["title"])
            if sim >= 0.4:
                ok = create_cross_reference(
                    source_type="agent_record",
                    source_id=record_id,
                    target_type="harvest_candidate",
                    target_id=cand["id"],
                    rel_type="kv:informs",
                    metadata={"similarity": round(sim, 3), "source": "history_ingestion"},
                )
                if ok:
                    xrefs += 1
                    print(f"    → linked to candidate {cand['id'][:8]}... ({cand['title'][:40]}...) sim={sim:.2f}")

    print(f"\nDone: {created} records created, {skipped} skipped, {xrefs} cross-references")


if __name__ == "__main__":
    main()
