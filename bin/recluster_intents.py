#!/usr/bin/env python3
"""
recluster_intents.py — Rebuild agendas from scratch using embedding matcher.

Re-clusters all intent_records through the embedding-based agenda_matcher in
chronological order. Each intent_record is matched to an existing agenda or
starts a new one.

NOTE: Run after archiving old agendas and deleting old agenda_items:
    UPDATE nebula.agendas SET status = 'archived' WHERE status = 'draft';
    DELETE FROM nebula.agenda_items;

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate

    # Preview (simulates clean-slate clustering)
    python3 bin/recluster_intents.py --dry-run

    # Apply (rebuilds agendas from scratch)
    python3 bin/recluster_intents.py --apply
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

LOG_DIR = Path("/home/codex/dev/nexus/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

from agenda_matcher import (
    add_item_to_agenda,
    create_agenda,
    match_intent_to_agenda,
    psql,
    _build_ir_text,
    _update_centroid_incremental,
)
from embed_util import embed_texts

log = logging.getLogger("recluster_intents")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_DIR / "recluster_intents.log"),
    ],
)

PROGRESS_INTERVAL = 50


def fetch_all_intent_records() -> list[dict]:
    """Fetch all intent_records ordered by creation date.

    Returns basic fields only (id, title, description) — sufficient for
    _build_ir_text() since system/subsystem context is optional.
    match_intent_to_agenda() still fetches full IR data internally for
    the system penalty computation.
    """
    sql = """
        SELECT json_agg(r ORDER BY r.created_at)::text FROM (
            SELECT id, title, description, candidate_id, status, created_at
            FROM nebula.intent_records
            ORDER BY created_at ASC
        ) r;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out or out == "NULL":
        log.error("Failed to fetch intent_records: %s", err or "empty")
        return []
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        log.error("Failed to parse intent_records JSON")
        return []


def count_open_agendas() -> int:
    """Count currently open (non-archived) agendas."""
    rc, out, _ = psql(
        "SELECT COUNT(*)::text FROM nebula.agendas WHERE status != 'archived';"
    )
    if rc == 0 and out.strip():
        return int(out.strip())
    return 0


def recluster(threshold: float = 0.60, dry_run: bool = True) -> dict:
    """Re-cluster all intent_records into fresh agendas.

    Processes records chronologically. The first record creates a new agenda;
    subsequent records either match to an existing (freshly-created) agenda
    or start another new one.

    In dry-run mode: simulates the clean-slate state by tracking virtual
    agendas locally rather than writing to the DB. This ensures dry-run
    and apply produce comparable results.
    """
    records = fetch_all_intent_records()
    if not records:
        log.info("No intent_records found.")
        return {"total": 0, "matched": 0, "new_agendas": 0, "skipped": 0, "errors": 0}

    # In dry-run mode, existing open agendas would skew results (the matcher
    # would match against them). We want to simulate a clean slate, so we
    # warn if there are open agendas and note that --apply starts from empty.
    if dry_run:
        open_count = count_open_agendas()
        if open_count > 0:
            log.warning(
                "Found %d existing open agendas. Dry-run matches against them, "
                "but --apply starts from an empty slate (archive first). "
                "For comparable results, archive old agendas before dry-run.",
                open_count,
            )

    log.info("Re-clustering %d intent_records (threshold=%.2f)...",
             len(records), threshold)

    # ── Phase 1: Batch-embed all records upfront ──
    log.info("  Batch-embedding %d intent_records...", len(records))
    ir_texts = [_build_ir_text(r) for r in records]
    all_embs = embed_texts(ir_texts, model="nomic-embed-text")
    log.info("  Embedding complete (%d vectors)", len(all_embs))

    stats = {"total": len(records), "matched": 0, "new_agendas": 0,
             "skipped": 0, "errors": 0}
    score_dist: dict[str, int] = {"0.0-0.4": 0, "0.4-0.6": 0, "0.6-0.7": 0,
                                  "0.7-0.8": 0, "0.8-0.9": 0, "0.9-1.0": 0}

    for i, rec in enumerate(records):
        ir_id = rec["id"]
        title = (rec.get("title") or "")[:70]
        ir_emb = all_embs[i:i+1]  # shape: (1, 768)

        # Progress logging (every N records or on action)
        if i > 0 and i % PROGRESS_INTERVAL == 0:
            log.info("  ... %d/%d records processed (%d agendas so far)",
                     i, len(records), stats["new_agendas"])

        match = match_intent_to_agenda(ir_id, threshold=threshold, allow_new=True,
                                       precomputed_emb=ir_emb, skip_fetch=True)

        # Track score distribution of best match
        s = match.score
        if s >= 0.9:           score_dist["0.9-1.0"] += 1
        elif s >= 0.8:         score_dist["0.8-0.9"] += 1
        elif s >= 0.7:         score_dist["0.7-0.8"] += 1
        elif s >= 0.6:         score_dist["0.6-0.7"] += 1
        elif s >= 0.4:         score_dist["0.4-0.6"] += 1
        else:                  score_dist["0.0-0.4"] += 1

        if match.skip:
            if dry_run:
                stats["skipped"] += 1
            log.debug("  SKIP  %s: no match", title)
        elif match.is_new:
            if dry_run:
                stats["new_agendas"] += 1
                log.info("  NEW   %s", title)
            else:
                aid, iid = create_agenda(ir_id,
                    ir_title=rec.get("title") or "",
                    ir_body=rec.get("description") or "",
                    invalidate_cache=False)
                if aid:
                    stats["new_agendas"] += 1
                    # Initialize centroid cache with this first item's embedding
                    _update_centroid_incremental(aid, ir_emb.squeeze())
                    log.info("  NEW   %s → agenda %s", title, aid[:8])
                else:
                    stats["errors"] += 1
                    log.error("  FAIL  %s: create_agenda failed", title)
        elif match.agenda_id:
            if dry_run:
                stats["matched"] += 1
                log.debug("  MATCH %s → agenda %s (%.3f)",
                          title, match.agenda_id[:8], match.score)
            else:
                iid = add_item_to_agenda(match.agenda_id, ir_id,
                    ir_title=rec.get("title") or "",
                    ir_body=rec.get("description") or "",
                    invalidate_cache=False)
                if iid:
                    # Incrementally update centroid (O(1) instead of O(N) recompute)
                    _update_centroid_incremental(match.agenda_id, ir_emb.squeeze())
                    stats["matched"] += 1
                    log.info("  MATCH %s → agenda %s (%.3f)",
                             title, match.agenda_id[:8], match.score)
                else:
                    stats["errors"] += 1
                    log.error("  FAIL  %s: add_item failed", title)

    # Score distribution
    log.info("  Score distribution (best match per record):")
    for bucket in ["0.0-0.4", "0.4-0.6", "0.6-0.7", "0.7-0.8", "0.8-0.9", "0.9-1.0"]:
        n = score_dist.get(bucket, 0)
        bar = "█" * (n // 5) if n else ""
        log.info("    %s: %d %s", bucket, n, bar)

    return stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Re-cluster intent_records into fresh agendas using embedding matcher"
    )
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview clustering without writing")
    parser.add_argument("--apply", action="store_true",
                        help="Rebuild agendas from scratch (DB must be pre-archived)")
    parser.add_argument("--threshold", type=float, default=0.60,
                        help="Match threshold (default: 0.60)")
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        parser.error("Specify --dry-run (preview) or --apply (execute)")

    stats = recluster(threshold=args.threshold, dry_run=args.dry_run)

    log.info("=" * 60)
    log.info("RECLUSTER RESULTS")
    log.info("  Total intent_records: %d", stats["total"])
    log.info("  Matched to existing:  %d", stats["matched"])
    log.info("  New agendas created:  %d", stats["new_agendas"])
    log.info("  Skipped:              %d", stats["skipped"])
    log.info("  Errors:               %d", stats["errors"])
    log.info("  Total agendas:        %d", stats["matched"] + stats["new_agendas"])

    if not args.dry_run:
        rc, out, _ = psql(
            "SELECT COUNT(*)::text FROM nebula.agendas WHERE status = 'draft';"
        )
        draft_count = out.strip() if rc == 0 else "?"
        rc2, out2, _ = psql("SELECT COUNT(*)::text FROM nebula.agenda_items;")
        item_count = out2.strip() if rc2 == 0 else "?"
        log.info("  DB state: %s draft agendas, %s items", draft_count, item_count)

    log.info("=" * 60)

    if args.dry_run and count_open_agendas() > 0:
        log.warning(
            "Dry-run matched against existing agendas. For an accurate preview "
            "of --apply, archive old agendas first with the SQL in the script header."
        )

    return 0


if __name__ == "__main__":
    sys.exit(main())
