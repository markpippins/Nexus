"""
Migrate existing harvest markdown files from audit/ROVER/processed/harvests/
into the nebula.harvests table in PostgreSQL.

This is a one-time migration. Future harvests should go directly to the DB
via the nebula-mcp tools or nebula-srv REST API.
"""

import json
import os
import re
import sys

# ── DB Setup ──────────────────────────────────────────────────────────
try:
    import psycopg2
except ImportError:
    print("psycopg2 not installed. Installing...")
    os.system("pip install psycopg2-binary -q")
    import psycopg2

DB_CONFIG = {
    "host": "localhost",
    "port": 5432,
    "user": "pguser",
    "password": "pgpass",
    "database": "nexus",
    "options": "-c search_path=nebula",
}

HARVESTS_DIR = "/home/codex/dev/nexus/audit/ROVER/processed/harvests"


def parse_harvest_markdown(filepath: str) -> dict | None:
    """Parse a harvest markdown file into a structured dictionary."""
    with open(filepath, "r", encoding="utf-8") as f:
        text = f.read()

    # Extract header fields
    source_match = re.search(r'\*\*Source:\*\*\s*(.+?)(?:\n|$)', text)
    model_match = re.search(r'\*\*Model:\*\*\s*(.+?)(?:\n|$)', text)
    candidates_match = re.search(r'\*\*Total candidates:\*\*\s*(\d+)', text)

    if not source_match:
        print(f"  WARNING: No Source found in {filepath}, skipping")
        return None

    source_path = source_match.group(1).strip()
    model = model_match.group(1).strip() if model_match else ""
    total_candidates = int(candidates_match.group(1)) if candidates_match else 0
    source_filename = os.path.basename(filepath)

    # Parse candidates (sections starting with "## N. Title")
    candidates = []
    # Split on section headers like "## 1. Title" or "## 1. Title (continued)"
    section_pattern = re.compile(r'^##\s+(\d+)\.\s+(.+?)(?:\n|$)', re.MULTILINE)
    sections = list(section_pattern.finditer(text))

    for i, match in enumerate(sections):
        seq = int(match.group(1))
        title = match.group(2).strip()

        # Content from this section header to the next (or end)
        start = match.end()
        end = sections[i + 1].start() if i + 1 < len(sections) else len(text)
        body = text[start:end].strip()

        # Extract status
        status_match = re.search(r'\*\*Status:\*\*\s*`(.+?)`', body)
        status = status_match.group(1).strip() if status_match else "Unknown"

        # Extract Architectural Intent
        intent_match = re.search(
            r'###\s*Architectural Intent\s*\n(.*?)(?=\n###\s|$)',
            body, re.DOTALL
        )
        intent = intent_match.group(1).strip() if intent_match else ""

        # Extract Requirements & Acceptance Criteria
        reqs = []
        req_section = re.search(
            r'###\s*Requirements\s*(?:&|and)\s*Acceptance Criteria\s*\n(.*?)(?=\n###\s|$)',
            body, re.DOTALL
        )
        if req_section:
            req_lines = req_section.group(1).strip().split('\n')
            for line in req_lines:
                line = line.strip()
                # Match checkbox items: "- [ ] ..." or "- [x] ..."
                m = re.match(r'-\s*\[\s*([ xX]?)\s*\]\s*(.*)', line)
                if m:
                    reqs.append({
                        "checked": m.group(1).strip().lower() == 'x',
                        "text": m.group(2).strip(),
                    })

        # Extract Harvested Code Artifacts
        code_artifacts = []
        code_section = re.search(
            r'###\s*Harvested Code Artifacts\s*\n(.*?)(?=\n###\s|$)',
            body, re.DOTALL
        )
        if code_section:
            code_body = code_section.group(1)
            # Each artifact: "#### Purpose: description" followed by fenced code
            artifact_pattern = re.compile(
                r'####\s*Purpose:\s*(.+?)\s*\n'
                r'```(\w*)\s*\n(.*?)```',
                re.DOTALL
            )
            for am in artifact_pattern.finditer(code_body):
                code_artifacts.append({
                    "purpose": am.group(1).strip(),
                    "language": am.group(2).strip() or "",
                    "code": am.group(3).strip(),
                })

        # Extract Unresolved Follow-Ups
        follow_ups = []
        fu_section = re.search(
            r'###\s*Unresolved Follow-Ups\s*\n(.*?)(?=\n---?\s*\n|$)',
            body, re.DOTALL
        )
        if fu_section:
            fu_lines = fu_section.group(1).strip().split('\n')
            for line in fu_lines:
                line = line.strip()
                if line.startswith('- '):
                    follow_ups.append(line[2:].strip())
                elif line and not line.startswith('#'):
                    follow_ups.append(line)

        candidates.append({
            "sequenceNumber": seq,
            "title": title,
            "status": status,
            "architecturalIntent": intent,
            "requirements": reqs,
            "codeArtifacts": code_artifacts,
            "followUps": follow_ups,
        })

    return {
        "source_path": source_path,
        "source_filename": source_filename,
        "model": model,
        "total_candidates": total_candidates,
        "candidates": candidates,
        "source_text": text,
        "tags": ["harvest", model.lower().replace(" ", "-")] if model else ["harvest"],
    }


def main():
    # Find harvest files
    harvest_files = sorted([
        os.path.join(HARVESTS_DIR, f)
        for f in os.listdir(HARVESTS_DIR)
        if f.endswith(".md")
    ])

    print(f"Found {len(harvest_files)} harvest files in {HARVESTS_DIR}")

    # Connect to DB
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    # Check existing harvests to avoid duplicates
    cur.execute("SELECT source_filename FROM nebula.harvests")
    existing = set(row[0] for row in cur.fetchall())
    print(f"Existing harvests in DB: {len(existing)}")

    inserted = 0
    skipped = 0
    errors = 0

    for filepath in harvest_files:
        filename = os.path.basename(filepath)
        if filename in existing:
            print(f"  SKIP (already exists): {filename}")
            skipped += 1
            continue

        print(f"  Processing: {filename}...", end=" ")
        try:
            harvest = parse_harvest_markdown(filepath)
            if harvest is None:
                print("PARSE FAILED")
                errors += 1
                continue

            cur.execute(
                """INSERT INTO nebula.harvests
                   (source_path, source_filename, model, total_candidates, candidates, source_text, tags)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (
                    harvest["source_path"],
                    harvest["source_filename"],
                    harvest["model"],
                    harvest["total_candidates"],
                    json.dumps(harvest["candidates"]),
                    harvest["source_text"],
                    harvest["tags"],
                )
            )
            conn.commit()
            inserted += 1
            print(f"OK ({harvest['total_candidates']} candidates)")
        except Exception as e:
            conn.rollback()
            print(f"ERROR: {e}")
            errors += 1

    cur.close()
    conn.close()

    print(f"\nDone: {inserted} inserted, {skipped} skipped, {errors} errors")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
