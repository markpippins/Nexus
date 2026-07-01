#!/usr/bin/env python3
"""
Batch Harvest → DB

Processes unprocessed HTML chat transcripts through the Rover harvest pipeline
and writes results into nebula.harvests via the nebula-srv REST API
(POST /api/harvests).

Pipeline: Dockling (deterministic) → API insert (with docklang)

Usage:
    cd /home/codex/dev/nexus/python/rover
    source .venv/bin/activate
    python3 batch_harvest_to_db.py [--dry-run] [--limit N]
"""

import argparse
import json
import logging
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

log = logging.getLogger("batch_harvest_db")

PROJECT_ROOT = Path("/home/codex/dev")
CHATS_DIR = PROJECT_ROOT / "chats"
DOCKLING = PROJECT_ROOT / "nexus/audit/ROVER/bin/dockling.py"
NEBULA_API = "http://localhost:3101"

# Kept for fallback / read-only queries when API is unreachable
DOCKER_PSQL = [
    "docker", "exec", "-i", "pgvector_db",
    "psql", "-U", "pguser", "-d", "nexus",
]

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


def psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    """Run SQL via docker psql (stdin pipe), return (returncode, stdout)."""
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def get_harvested_filenames() -> set[str]:
    """Return set of source_filenames already in nebula.harvests (via API)."""
    try:
        req = urllib.request.Request(f"{NEBULA_API}/api/harvests")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
        harvests = data.get("harvests", data) if isinstance(data, dict) else data
        if isinstance(harvests, list):
            return {h.get("source_filename", "") for h in harvests if h.get("source_filename")}
        # Unexpected response structure — fall through to psql
    except Exception as e:
        log.warning("API unreachable for harvest list, falling back to psql: %s", e)

    # Fallback: query via docker psql
    rc, out = psql("SELECT source_filename FROM nebula.harvests;")
    if rc != 0 or not out:
        return set()
    return set(line.strip() for line in out.splitlines() if line.strip())


def dockling_html_path(html_path: Path) -> dict | None:
    """Run Dockling on an HTML file and return the DockLang JSON, or None."""
    try:
        result = subprocess.run(
            ["python3", str(DOCKLING), str(html_path)],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode == 0:
            dl = json.loads(result.stdout)
            stats = dl.get("stats", {})
            log.info("  DockLang: %d units, %d blocks",
                     stats.get("total_units", 0), stats.get("total_blocks", 0))
            return dl
        else:
            log.warning("  Dockling failed: %s", result.stderr.strip()[:200])
            return None
    except subprocess.TimeoutExpired:
        log.warning("  Dockling timed out after 120s")
        return None
    except json.JSONDecodeError as e:
        log.warning("  Dockling output not JSON: %s", e)
        return None


def insert_harvest(source_path: str, source_filename: str,
                   source_text: str | None, docklang: dict | None) -> bool:
    """Insert a harvest record with docklang via POST /api/harvests."""
    body = {
        "sourcePath": source_path,
        "sourceFilename": source_filename,
        "model": "dockling",
        "totalCandidates": 0,
        "candidates": [],
        "sourceText": source_text or "",
        "tags": ["harvest", "rover", "dockling"],
        "metadata": {"dockling_version": "v0.3"},
        "docklang": docklang,
    }

    try:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req = urllib.request.Request(
            f"{NEBULA_API}/api/harvests",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())

        if result.get("error"):
            log.error("  → API error: %s", result["error"])
            return False

        harvest_id = result.get("id", "?")
        log.info("  → DB harvest %s", harvest_id)
        return True

    except urllib.error.HTTPError as e:
        body_text = ""
        try:
            body_text = e.read().decode()[:300]
        except Exception:
            pass
        log.error("  → API HTTP %d: %s", e.code, body_text)
        return False
    except urllib.error.URLError as e:
        log.error("  → API unreachable: %s", e.reason)
        return False
    except Exception as e:
        log.error("  → Unexpected error: %s", e)
        return False


def process_transcript(html_path: Path) -> bool:
    """Process one HTML transcript: Dockling → DB."""
    name = html_path.stem
    log.info("─" * 60)
    log.info("Processing: %s", name)

    # Step 1: Dockling → DockLang
    docklang = dockling_html_path(html_path)
    if docklang is None:
        log.error("  Dockling failed, skipping")
        return False

    source_path = str(html_path.relative_to(PROJECT_ROOT))

    # Step 2: Insert to DB
    return insert_harvest(
        source_path=source_path,
        source_filename=html_path.name,
        source_text=None,
        docklang=docklang,
    )


def find_unharvested(limit: int) -> list[Path]:
    """Find the N largest unharvested HTML files, by recency (mtime)."""
    harvested = get_harvested_filenames()
    html_files = sorted(
        [f for f in CHATS_DIR.glob("*.html") if f.name not in harvested],
        key=lambda f: f.stat().st_mtime,   # most recent first
        reverse=True,
    )

    if not html_files:
        log.info("No unharvested HTML files found")
    else:
        log.info("Unharvested available: %d, processing %d most recent",
                 len(html_files), min(limit, len(html_files)))

    return html_files[:limit]


def main():
    parser = argparse.ArgumentParser(description="Batch harvest chat HTMLs to DB")
    parser.add_argument("--dry-run", action="store_true", help="Discover unharvested files but don't process")
    parser.add_argument("--limit", type=int, default=5, help="Max transcripts to process (default: 5)")
    parser.add_argument("file", nargs="*", help="Specific filenames to process (by title, .html optional)")
    args = parser.parse_args()

    if args.file:
        targets = []
        for f in args.file:
            p = CHATS_DIR / (f if f.endswith(".html") else f + ".html")
            if p.exists():
                targets.append(p)
            else:
                log.error("File not found: %s", p)
    else:
        targets = find_unharvested(args.limit)

    if args.dry_run:
        log.info("DRY RUN — would process:")
        for t in targets:
            log.info("  %s", t.name)
        return 0

    if not targets:
        log.info("Nothing to process.")
        return 0

    log.info("═" * 60)
    log.info("Batch Harvest → DB")
    log.info("Targets: %d file(s)", len(targets))
    for t in targets:
        log.info("  • %s", t.name)
    log.info("═" * 60)

    results = {}
    for t in targets:
        start = time.time()
        ok = process_transcript(t)
        elapsed = time.time() - start
        results[t.name] = (ok, elapsed)
        log.info("")

    log.info("═" * 60)
    log.info("BATCH COMPLETE")
    log.info("─" * 60)
    success = 0
    for name, (ok, elapsed) in results.items():
        icon = "✅" if ok else "❌"
        log.info("%s %s (%.1fs)", icon, name, elapsed)
        if ok:
            success += 1
    log.info("─" * 60)
    log.info("%d/%d succeeded", success, len(targets))
    log.info("═" * 60)
    return 0 if success == len(targets) else 1


if __name__ == "__main__":
    sys.exit(main())
