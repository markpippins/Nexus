#!/usr/bin/env python3
"""
Backfill DockLang — scan existing HTML chat exports, generate DockLang via
Dockling, and upsert into the nebula.harvests.docklang column.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/backfill_docklang.py                    # upsert missing only
    python3 bin/backfill_docklang.py --force             # regenerate all
    python3 bin/backfill_docklang.py --dry-run           # preview only
    python3 bin/backfill_docklang.py --slug plurality    # specific file
"""

import argparse
import json
import logging
import subprocess
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)
log = logging.getLogger("backfill_docklang")


PROJECT_ROOT = Path("/home/codex/dev")
CHATS_DIR = PROJECT_ROOT / "chats"
DOCKLING = PROJECT_ROOT / "nexus/audit/ROVER/bin/dockling.py"
DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]


def get_harvest_id_from_source(html_path: Path) -> str | None:
    """Find a harvest record by its source_filename or source_path and return its id."""
    filename = html_path.name
    path_like = f"%{html_path.stem}%"
    safe_filename = filename.replace("'", "''")
    sql = f"""
    SELECT id FROM nebula.harvests
    WHERE source_filename = '{safe_filename}'
       OR source_path ILIKE '{path_like.replace("'", "''")}'
    ORDER BY
       CASE WHEN source_filename = '{safe_filename}' THEN 1 ELSE 2 END,
       created_at DESC
    LIMIT 1;
    """
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=10,
        )
        out = result.stdout.strip()
        return out if out else None
    except Exception as e:
        log.warning("DB query failed for %s: %s", filename, e)
        return None


def check_docklang(harvest_id: str) -> dict:
    """Check if a harvest record already has docklang data and its file_size.
    Returns {'has_docklang': bool, 'file_size': int|None}."""
    sql = f"SELECT docklang IS NOT NULL, file_size FROM nebula.harvests WHERE id = '{harvest_id}';"
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=10,
        )
        out = result.stdout.strip()
        if not out:
            return {"has_docklang": False, "file_size": None}
        parts = out.split("|")
        has_dl = parts[0] == "t" if parts else False
        fs = int(parts[1]) if len(parts) > 1 and parts[1] and parts[1] != "\\N" else None
        return {"has_docklang": has_dl, "file_size": fs}
    except Exception:
        return {"has_docklang": False, "file_size": None}


def upsert_docklang(harvest_id: str, docklang_json: str, file_size: int | None = None) -> bool:
    """Upsert docklang JSON and optionally file_size into a harvest record."""
    sql = f"""
    UPDATE nebula.harvests
    SET docklang = $${docklang_json}$$::jsonb
        {', file_size = ' + str(file_size) if file_size is not None else ''}
    WHERE id = '{harvest_id}'
    RETURNING id;
    """
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=30,
        )
        out = result.stdout.strip()
        if out:
            log.info("  ✓ Updated harvest %s", out[:8])
            return True
        log.warning("  UPDATE returned no output for %s", harvest_id)
        return False
    except subprocess.TimeoutExpired:
        log.error("  UPDATE timeout for %s", harvest_id)
        return False
    except Exception as e:
        log.error("  UPDATE error for %s: %s", harvest_id, e)
        return False


def generate_docklang(html_path: Path, force: bool = False) -> dict | None:
    """Run dockling on an HTML file and return parsed DockLang, or None on failure."""
    try:
        result = subprocess.run(
            ["python3", str(DOCKLING), str(html_path)],
            capture_output=True, text=True, timeout=120,
        )
        if result.returncode != 0:
            log.error("  Dockling failed for %s: %s", html_path.name, result.stderr.strip())
            return None
        return json.loads(result.stdout)
    except subprocess.TimeoutExpired:
        log.error("  Dockling timeout for %s (120s)", html_path.name)
        return None
    except json.JSONDecodeError as e:
        log.error("  Dockling output not valid JSON for %s: %s", html_path.name, e)
        return None
    except Exception as e:
        log.error("  Dockling error for %s: %s", html_path.name, e)
        return None


def process_html(html_path: Path, force: bool = False, dry_run: bool = False) -> dict:
    """Process one HTML: generate docklang and upsert to DB. Returns stats dict."""
    filename = html_path.name
    result = {"file": filename, "status": "skipped", "units": 0, "blocks": 0}

    # Find corresponding harvest
    harvest_id = get_harvest_id_from_source(html_path)
    if not harvest_id:
        result["status"] = "no_harvest"
        log.info("  %s → no harvest record found (skipping)", filename)
        return result

    if not force:
        dl_info = check_docklang(harvest_id)
        if dl_info["has_docklang"]:
            # Check if file size matches — if so, skip (unchanged)
            current_size = html_path.stat().st_size if html_path.exists() else None
            if current_size is not None and dl_info["file_size"] is not None and current_size == dl_info["file_size"]:
                result["status"] = "unchanged"
                log.info("  %s → docklang exists, file_size unchanged (%d bytes) — skipping", filename, current_size)
                return result
            elif dl_info["has_docklang"]:
                if current_size is not None and dl_info["file_size"] is not None and current_size != dl_info["file_size"]:
                    log.info("  %s → docklang exists but file_size changed (%d → %d) — use --force to regenerate",
                             filename, dl_info["file_size"], current_size)
                else:
                    log.info("  %s → docklang already exists (use --force to regenerate)", filename)
                result["status"] = "exists"
                return result

    # Generate DockLang
    docklang = generate_docklang(html_path, force)
    if docklang is None:
        result["status"] = "failed"
        return result

    result["units"] = docklang.get("stats", {}).get("total_units", 0)
    result["blocks"] = docklang.get("stats", {}).get("total_blocks", 0)

    if dry_run:
        result["status"] = "dry_run"
        log.info("  [DRY RUN] %s → would update harvest %s (%d units, %d blocks)",
                 filename, harvest_id[:8], result["units"], result["blocks"])
        return result

    # Upsert to DB
    docklang_json = json.dumps(docklang, ensure_ascii=False)
    file_size = html_path.stat().st_size if html_path.exists() else None
    ok = upsert_docklang(harvest_id, docklang_json, file_size)
    result["status"] = "updated" if ok else "update_failed"
    return result


def main():
    parser = argparse.ArgumentParser(description="Backfill DockLang for existing chat HTMLs")
    parser.add_argument("--force", action="store_true", help="Regenerate even if docklang exists")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no DB writes")
    parser.add_argument("--slug", type=str, help="Process only files containing this slug")
    args = parser.parse_args()

    log.info("=" * 60)
    log.info("Backfill DockLang")
    log.info("  chats dir: %s", CHATS_DIR)
    log.info("  dockling:  %s", DOCKLING)
    log.info("  force:     %s", args.force)
    log.info("  dry-run:   %s", args.dry_run)
    log.info("=" * 60)

    html_files = sorted(CHATS_DIR.glob("*.html"))
    if args.slug:
        slug_lower = args.slug.lower()
        html_files = [f for f in html_files if slug_lower in f.stem.lower()]
        log.info("Filtered to %d files matching slug '%s'", len(html_files), args.slug)

    log.info("Found %d HTML files to process", len(html_files))

    stats = {"processed": 0, "updated": 0, "exists": 0, "unchanged": 0, "no_harvest": 0,
             "failed": 0, "dry_run": 0, "total_units": 0, "total_blocks": 0}

    for i, html_path in enumerate(html_files):
        log.info("[%d/%d] %s", i + 1, len(html_files), html_path.name)
        r = process_html(html_path, force=args.force, dry_run=args.dry_run)
        stats[r["status"]] = stats.get(r["status"], 0) + 1
        stats["processed"] += 1
        stats["total_units"] += r.get("units", 0)
        stats["total_blocks"] += r.get("blocks", 0)

    log.info("=" * 60)
    log.info("COMPLETE")
    log.info("  Total HTML files:    %d", stats["processed"])
    log.info("  Updated:             %d", stats.get("updated", 0))
    log.info("  Already existed:     %d", stats.get("exists", 0))
    log.info("  Unchanged (size):    %d", stats.get("unchanged", 0))
    log.info("  No harvest record:   %d", stats.get("no_harvest", 0))
    log.info("  Failed:              %d", stats.get("failed", 0))
    log.info("  Dry-run:             %d", stats.get("dry_run", 0))
    log.info("  Total DockLang units:%d", stats["total_units"])
    log.info("  Total DockLang blocks:%d", stats["total_blocks"])
    log.info("=" * 60)

    return 0 if stats.get("failed", 0) == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
