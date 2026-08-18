#!/usr/bin/env python3
"""
ChatGPT markdown/JSON export → nebula harvest ingest.

Plan 1308 (ChatGPT Quarantine + Harvest Pipeline Prep), AC3: the new
markdown/JSON ingest path produces at least one test harvest from
chat-export/exports/markdown/.

Reads the pristine ChatGPT exports (1,000 markdown files) that were never
fed through the pipeline and inserts them as harvests via the nebula-srv
REST API (POST /api/harvests) — the same insert surface the HTML path
uses. The HTML path is untouched; this is an additive second source.

Parsing
-------
Markdown files carry YAML frontmatter (title, id, create_time,
update_time) followed by `## User` / `## Assistant` turns. `source_text`
is the raw file content; `metadata.source_date` is derived from the
`YYYY-MM-DD_` filename prefix (falling back to frontmatter create_time),
and `metadata.source_project` is resolved from the per-project export
folders in `chat-export/exports/projects/*/markdown/` (filename match).

Usage
-----
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate  # optional
    python3 bin/chatgpt-markdown-ingest.py --limit 1 --dry-run
    python3 bin/chatgpt-markdown-ingest.py --limit 1              # one test harvest
"""

import argparse
import json
import logging
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

log = logging.getLogger("chatgpt_md_ingest")

PROJECT_ROOT = Path("/home/codex/dev")
EXPORTS_DIR = PROJECT_ROOT / "chat-export" / "exports"
MARKDOWN_DIR = EXPORTS_DIR / "markdown"
PROJECTS_DIR = EXPORTS_DIR / "projects"
NEBULA_API = "http://localhost:3101"


def build_project_map() -> dict[str, str]:
    """Map markdown filename → ChatGPT project name.

    Each project folder (chat-export/exports/projects/<project>/markdown/)
    contains copies of the flat markdown files. Use the first folder that
    contains a given filename as its project; falls back to None.
    """
    proj_map: dict[str, str] = {}
    if not PROJECTS_DIR.is_dir():
        return proj_map
    for proj_dir in sorted(PROJECTS_DIR.iterdir()):
        md_dir = proj_dir / "markdown"
        if not md_dir.is_dir():
            continue
        for f in md_dir.iterdir():
            if f.suffix == ".md" and f.name not in proj_map:
                proj_map[f.name] = proj_dir.name
    return proj_map


def source_date_from_filename(name: str, frontmatter: dict) -> str | None:
    """Derive source_date from the YYYY-MM-DD_ filename prefix.

    Falls back to the frontmatter create_time (ISO) if the prefix is
    absent or malformed.
    """
    m = re.match(r"(\d{4}-\d{2}-\d{2})_", name)
    if m:
        return m.group(1)
    ct = frontmatter.get("create_time")
    if isinstance(ct, str):
        return ct[:10]
    return None


def parse_frontmatter(text: str) -> dict:
    """Parse leading YAML-ish frontmatter (--- delimited)."""
    m = re.match(r"^---\n(.*?)\n---\n", text, re.S)
    if not m:
        return {}
    fm: dict = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm


def insert_harvest(source_path: str, source_filename: str,
                   source_text: str, metadata: dict) -> str | None:
    """Insert a harvest via POST /api/harvests (same surface as HTML path)."""
    body = {
        "sourcePath": source_path,
        "sourceFilename": source_filename,
        "model": "chatgpt-export-md",
        "totalCandidates": 0,
        "candidates": [],
        "sourceText": source_text,
        "tags": ["harvest", "chatgpt", "markdown", "re-ingest"],
        "metadata": metadata,
        "fileSize": len(source_text.encode("utf-8")),
    }
    try:
        req = urllib.request.Request(
            f"{NEBULA_API}/api/harvests",
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())
        if result.get("error"):
            log.error("  → API error: %s", result["error"])
            return None
        log.info("  → DB harvest %s", result.get("id", "?"))
        return result.get("id")
    except urllib.error.HTTPError as e:
        log.error("  → API HTTP %d: %s", e.code, e.read().decode()[:300])
        return None
    except urllib.error.URLError as e:
        log.error("  → API unreachable: %s", e.reason)
        return None
    except Exception as e:
        log.error("  → Unexpected error: %s", e)
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest ChatGPT markdown exports as harvests")
    parser.add_argument("--limit", type=int, default=1, help="Max files to process (default: 1)")
    parser.add_argument("--dry-run", action="store_true", help="Discover but don't insert")
    parser.add_argument("--md-dir", type=str, default=str(MARKDOWN_DIR),
                        help="Markdown export directory (default: chat-export/exports/markdown)")
    args = parser.parse_args()

    md_dir = Path(args.md_dir)
    if not md_dir.is_dir():
        log.error("Markdown dir not found: %s", md_dir)
        return 1

    proj_map = build_project_map()
    files = sorted(md_dir.glob("*.md"))[: args.limit]
    log.info("Targets: %d file(s) from %s", len(files), md_dir)

    if args.dry_run:
        for f in files:
            fm = parse_frontmatter(f.read_text(encoding="utf-8", errors="replace"))
            sd = source_date_from_filename(f.name, fm)
            sp = proj_map.get(f.name)
            log.info("  would insert: %s | source_date=%s | source_project=%s",
                     f.name, sd, sp)
        return 0

    ok = 0
    for f in files:
        text = f.read_text(encoding="utf-8", errors="replace")
        fm = parse_frontmatter(text)
        metadata = {
            "source_date": source_date_from_filename(f.name, fm),
            "source_project": proj_map.get(f.name),
            "export_format": "markdown",
            "chatgpt_conversation_id": fm.get("id"),
        }
        source_path = str(f.relative_to(PROJECT_ROOT))
        log.info("Processing: %s (project=%s, date=%s)",
                 f.name, metadata["source_project"], metadata["source_date"])
        hid = insert_harvest(source_path, f.name, text, metadata)
        if hid:
            ok += 1

    log.info("DONE: %d/%d inserted", ok, len(files))
    return 0 if ok == len(files) else 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    sys.exit(main())
