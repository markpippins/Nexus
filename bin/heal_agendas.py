#!/usr/bin/env python3
"""
heal_agendas.py — Agenda Item Re-Clustering via Embedding Similarity

Fetches all non-archived agendas and their items, embeds each item's
title+body via Ollama (nomic-embed-text, 768-dim), computes per-agenda
centroids, and detects items that are semantically closer to a different
agenda's centroid than their own.

Misplaced items are reassigned to their best-matching agenda. Items that
don't match ANY agenda well (< 0.50) are extracted into new single-item
agendas. Only items with `included IS NULL` (no human decision yet) are
eligible for reassignment.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate

    # Dry-run: show what would change without making changes
    python3 bin/heal_agendas.py --dry-run

    # Apply the reassignments
    python3 bin/heal_agendas.py --apply

    # Tighter matching
    python3 bin/heal_agendas.py --apply --threshold 0.65 --margin 0.05
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

LOG_DIR = Path("/home/codex/dev/nexus/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)
import uuid
from collections import defaultdict
from datetime import datetime, timezone

import numpy as np

from agenda_matcher import psql, fetch_item_system as _fetch_item_system_raw
from embed_util import embed_texts, cosine_similarity_matrix

log = logging.getLogger("heal_agendas")

EMBED_MODEL = "nomic-embed-text"
SYSTEM_MISMATCH_PENALTY = 0.15

def fetch_all_agendas_with_items() -> list[dict]:
    """Fetch all non-archived agendas with their items as nested JSON.

    Returns a list of agenda dicts, each with an 'items' list of item dicts.
    Only items with included IS NULL (no human decision) are eligible for moves;
    items with included=true/false are loaded for centroid computation but
    excluded from reassignment candidates.
    """
    sql = """
        SELECT json_agg(r)::text FROM (
            SELECT
                a.id AS agenda_id,
                a.title AS agenda_title,
                a.status,
                a.source_count,
                a.created_at,
                COALESCE(
                    (SELECT json_agg(item_rows ORDER BY item_rows.created_at) FROM (
                        SELECT
                            ai.id,
                            ai.agenda_id,
                            ai.source_type,
                            ai.source_id,
                            ai.title,
                            ai.body,
                            ai.included,
                            ai.planner_note,
                            ai.created_at
                        FROM nebula.agenda_items ai
                        WHERE ai.agenda_id = a.id
                    ) item_rows),
                    '[]'::json
                ) AS items
            FROM nebula.agendas a
            WHERE a.status != 'archived'
            ORDER BY a.created_at DESC
        ) r;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out or out == "NULL":
        log.error("Failed to fetch agendas: %s", err or "empty result")
        return []
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        log.error("Failed to parse agendas JSON")
        return []


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_DIR / "heal_agendas.log"),
    ],
)


def fetch_item_system(item: dict) -> str | None:
    """Thin wrapper: fetch system_id for an agenda item's source record."""
    return _fetch_item_system_raw(item.get("source_type", ""), item.get("source_id", ""))


# ── Data fetching ──────────────────────────────────────────────────────────

def build_item_text(item: dict) -> str:
    """Build a rich text representation of an agenda item for embedding."""
    parts = [item.get("title") or ""]
    body = item.get("body") or ""
    if body:
        parts.append(body)
    return "\n".join(parts)


# ── Healing engine ─────────────────────────────────────────────────────────

def compute_agenda_centroids(
    agendas: list[dict],
    all_embeddings: dict[str, np.ndarray],
) -> dict[str, np.ndarray]:
    """Compute the centroid embedding for each agenda.

    Uses ALL items (including human-decided ones) for centroid computation
    so the centroid reflects the full agenda content, not just the movable items.
    Returns {agenda_id: centroid_embedding}.
    """
    centroids: dict[str, np.ndarray] = {}
    for ag in agendas:
        ag_id = ag["agenda_id"]
        item_embs = []
        for item in ag["items"]:
            emb = all_embeddings.get(item["id"])
            if emb is not None:
                item_embs.append(emb)
        if item_embs:
            centroids[ag_id] = np.stack(item_embs).mean(axis=0)
        else:
            # Empty agenda — use zero vector (won't match anything)
            centroids[ag_id] = np.zeros(768, dtype=np.float32)
    return centroids


def compute_system_penalty_cached(
    item_system: str | None,
    target_agenda_id: str,
    agenda_map: dict[str, dict],
    cache: dict[str, str | None],
) -> float:
    """Compute system mismatch penalty using pre-fetched item system.

    Returns -0.15 if the item's system differs from the agenda's majority system,
    0.0 otherwise (or if system data is unavailable).
    """
    if not item_system:
        return 0.0

    target_agenda = agenda_map.get(target_agenda_id)
    if not target_agenda:
        return 0.0

    # Determine majority system of target agenda (cached)
    if target_agenda_id not in cache:
        system_votes: dict[str, int] = {}
        for other_item in target_agenda["items"]:
            other_sys = fetch_item_system(other_item)
            if other_sys:
                system_votes[other_sys] = system_votes.get(other_sys, 0) + 1
        if system_votes:
            cache[target_agenda_id] = max(system_votes, key=system_votes.get)
        else:
            cache[target_agenda_id] = None

    majority_system = cache[target_agenda_id]
    if majority_system and item_system != majority_system:
        return -SYSTEM_MISMATCH_PENALTY
    return 0.0


def heal(
    agendas: list[dict],
    threshold: float = 0.60,
    margin: float = 0.05,
    model: str = EMBED_MODEL,
    verbose: bool = False,
) -> dict:
    """Run the healing analysis and return a plan of changes.

    Returns a dict with:
      - moves: list of {item_id, item_title, from_agenda, to_agenda, score, current_score}
      - orphans: list of {item_id, item_title, from_agenda, best_score}
      - low_cohesion: list of {agenda_id, agenda_title, cohesion}
      - stats: {total_items, movable_items, moves, orphans, agendas_checked}
    """
    # ── Collect all items and their texts ──
    all_items: list[dict] = []          # flat list with agenda ref
    movable_items: list[dict] = []      # only items where included IS NULL
    item_texts: list[str] = []
    item_ids: list[str] = []

    agenda_map: dict[str, dict] = {}    # agenda_id → agenda dict
    for ag in agendas:
        agenda_map[ag["agenda_id"]] = ag
        for item in ag["items"]:
            item["_agenda_id"] = ag["agenda_id"]
            item["_agenda_title"] = ag["agenda_title"]
            all_items.append(item)
            if item.get("included") is None:
                movable_items.append(item)
            item_texts.append(build_item_text(item))
            item_ids.append(item["id"])

    if not item_texts:
        log.info("No items found in any agenda.")
        return {"moves": [], "orphans": [], "low_cohesion": [], "stats": {}}

    # ── Embed all items at once ──
    log.info("Embedding %d items via %s...", len(item_texts), model)
    try:
        embeddings = embed_texts(item_texts, model=model)
    except Exception as e:
        log.error("Embedding failed: %s", e)
        return {"moves": [], "orphans": [], "low_cohesion": [], "stats": {}}

    all_embeddings: dict[str, np.ndarray] = {
        item_ids[i]: embeddings[i] for i in range(len(item_ids))
    }

    # ── Compute centroids ──
    centroids = compute_agenda_centroids(agendas, all_embeddings)
    agenda_ids = sorted(centroids.keys())  # deterministic ordering

    if len(agenda_ids) < 2:
        log.info("Only %d agenda(s) — nothing to heal.", len(agenda_ids))
        return {"moves": [], "orphans": [], "low_cohesion": [], "stats": {}}

    # Stack centroids into a matrix: (N_agendas, 768)
    # Exclude empty agendas (zero-vector centroids) to avoid spurious matches
    non_empty_ids = [aid for aid in agenda_ids if not np.allclose(centroids[aid], 0)]
    if len(non_empty_ids) < 2:
        log.info("Only %d non-empty agenda(s) — nothing to heal.", len(non_empty_ids))
        return {"moves": [], "orphans": [], "low_cohesion": [], "stats": {}}
    centroid_matrix = np.stack([centroids[aid] for aid in non_empty_ids])

    # ── Precompute current-agenda indices ──
    # For each movable item, record its current agenda's index in agenda_ids
    movable_embeddings = np.stack([all_embeddings[it["id"]] for it in movable_items])

    # ── Compute similarity matrix: (N_movable, N_agendas) ──
    sim_matrix = cosine_similarity_matrix(movable_embeddings, centroid_matrix)

    # ── Cache system penalties ──
    agenda_systems_cache: dict[str, str | None] = {}
    # Pre-fetch item systems once (avoid N_agendas redundant DB calls per item)
    item_system_cache: dict[str, str | None] = {}
    for item in movable_items:
        item_system_cache[item["id"]] = fetch_item_system(item)
    moves: list[dict] = []
    orphans: list[dict] = []
    agenda_cohesion: dict[str, list[float]] = defaultdict(list)

    for i, item in enumerate(movable_items):
        current_agenda_id = item["_agenda_id"]
        sim_row = sim_matrix[i]  # similarities to non-empty agenda centroids

        # Get index of current agenda in non_empty_ids
        try:
            current_idx = non_empty_ids.index(current_agenda_id)
        except ValueError:
            current_idx = -1

        current_score_raw = float(sim_row[current_idx]) if current_idx >= 0 else 0.0

        # Track cohesion (raw score, all items including human-decided)
        if current_idx >= 0:
            agenda_cohesion[current_agenda_id].append(current_score_raw)

        # ── Find best agenda (raw scores) and best adjusted ──
        item_sys = item_system_cache.get(item["id"])
        best_raw_idx = -1
        best_raw_score = -1.0
        best_adj_idx = -1
        best_adj_score = -1.0
        per_agenda_raw: list[float] = []
        per_agenda_adj: list[float] = []
        per_agenda_penalty: list[float] = []

        for j, raw_score in enumerate(sim_row):
            raw = float(raw_score)
            target_ag_id = non_empty_ids[j]

            # Compute adjusted score (raw + system penalty for cross-agenda)
            if j != current_idx and target_ag_id in agenda_map:
                penalty = compute_system_penalty_cached(
                    item_sys, target_ag_id, agenda_map, agenda_systems_cache,
                )
                adj = raw + penalty
            else:
                penalty = 0.0
                adj = raw

            per_agenda_raw.append(raw)
            per_agenda_adj.append(adj)
            per_agenda_penalty.append(penalty)

            if raw > best_raw_score:
                best_raw_score = raw
                best_raw_idx = j
            if adj > best_adj_score:
                best_adj_score = adj
                best_adj_idx = j

        best_raw_agenda_id = non_empty_ids[best_raw_idx] if best_raw_idx >= 0 else None
        best_adj_agenda_id = non_empty_ids[best_adj_idx] if best_adj_idx >= 0 else None

        # ── Verbose: per-item similarity to all agendas ──
        if verbose:
            item_title = item.get("title", "")[:70]
            current_title = item["_agenda_title"][:50]
            log.info("")
            log.info("── Item %s: \"%s\"", item["id"][:8], item_title)
            log.info("   Current: %s (raw=%.4f)", current_title, current_score_raw)

            # Build sorted list from pre-computed scores (reuse from main loop)
            ranked = []
            for j in range(len(non_empty_ids)):
                target_ag_id = non_empty_ids[j]
                target_title = (agenda_map[target_ag_id]["agenda_title"] if target_ag_id in agenda_map else "?")[:55]
                raw = per_agenda_raw[j]
                adj = per_agenda_adj[j]
                pen = per_agenda_penalty[j]
                ranked.append((target_ag_id, target_title, raw, adj, pen))

            ranked.sort(key=lambda x: x[3], reverse=True)  # sort by adjusted score desc

            for rank, (ag_id, ag_title, raw, adj, pen) in enumerate(ranked[:8]):
                marker = ""
                if ag_id == current_agenda_id:
                    marker = " ← current"
                elif ag_id == best_adj_agenda_id:
                    marker = " ← best"
                pen_str = f" (penalty={pen:+.2f})" if pen != 0.0 else ""
                log.info(
                    "   %2d. %s  raw=%.4f  adj=%.4f%s%s",
                    rank + 1, ag_title, raw, adj, pen_str, marker,
                )

            if len(ranked) > 8:
                log.info("   ... (%d more agendas)", len(ranked) - 8)

        # ── Decision logic ──
        # Orphan check: item doesn't match ANY agenda well (raw score)
        if best_raw_score < threshold and current_score_raw < threshold:
            orphans.append({
                "item_id": item["id"],
                "item_title": item.get("title", "")[:80],
                "from_agenda_id": current_agenda_id,
                "from_agenda_title": item["_agenda_title"],
                "best_score": round(best_raw_score, 4),
                "current_score": round(current_score_raw, 4),
            })
        # Mismatch check: item belongs in a different agenda (adjusted score).
        # Note: compares adjusted best (with system penalty) against raw current
        # (no penalty). This makes cross-system moves intentionally harder —
        # an item must be significantly better in another agenda to overcome
        # the structural system boundary.
        elif (best_adj_agenda_id
              and best_adj_agenda_id != current_agenda_id
              and best_adj_score >= threshold
              and best_adj_score > current_score_raw + margin):
            moves.append({
                "item_id": item["id"],
                "item_title": item.get("title", "")[:80],
                "from_agenda_id": current_agenda_id,
                "from_agenda_title": item["_agenda_title"],
                "to_agenda_id": best_adj_agenda_id,
                "to_agenda_title": agenda_map[best_adj_agenda_id]["agenda_title"],
                "score": round(best_adj_score, 4),
                "current_score": round(current_score_raw, 4),
            })

    # ── Compute low-cohesion warnings ──
    low_cohesion: list[dict] = []
    for ag_id, scores in agenda_cohesion.items():
        if len(scores) >= 3:
            mean_cohesion = np.mean(scores)
            if mean_cohesion < 0.55:
                low_cohesion.append({
                    "agenda_id": ag_id,
                    "agenda_title": agenda_map[ag_id]["agenda_title"][:80],
                    "cohesion": round(float(mean_cohesion), 4),
                    "item_count": len(scores),
                })

    stats = {
        "total_items": len(all_items),
        "movable_items": len(movable_items),
        "moves": len(moves),
        "orphans": len(orphans),
        "agendas_checked": len(agendas),
        "low_cohesion_warnings": len(low_cohesion),
    }

    return {
        "moves": moves,
        "orphans": orphans,
        "low_cohesion": low_cohesion,
        "stats": stats,
    }


# ── Apply changes ──────────────────────────────────────────────────────────

def apply_heal(plan: dict, dry_run: bool = True) -> int:
    """Execute the healing plan against the database.

    Returns number of changes applied.
    """
    moves = plan.get("moves", [])
    orphans = plan.get("orphans", [])
    changes = 0
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    if not moves and not orphans:
        log.info("Nothing to heal.")
        return 0

    # Track which agendas are affected for source_count refresh
    affected_agendas: set[str] = set()

    # ── Reassign misplaced items ──
    for move in moves:
        item_id = move["item_id"]
        from_ag = move["from_agenda_id"]
        to_ag = move["to_agenda_id"]

        if dry_run:
            log.info(
                "  [DRY-RUN] Move %s: \"%s\" → %s (score=%.3f, current=%.3f)",
                item_id[:8], move["item_title"][:50],
                to_ag[:8], move["score"], move["current_score"],
            )
            changes += 1
        else:
            sql = f"""
                UPDATE nebula.agenda_items
                SET agenda_id = '{to_ag}'::uuid, updated_at = '{now}'
                WHERE id = '{item_id}'::uuid
                  AND agenda_id = '{from_ag}'::uuid
                  AND included IS NULL;
            """
            rc, out, err = psql(sql)
            if rc == 0:
                log.info(
                    "  ✓ Moved %s → agenda %s: \"%s\"",
                    item_id[:8], to_ag[:8], move["item_title"][:50],
                )
                changes += 1
            else:
                log.error("  ✗ Failed to move %s: %s", item_id[:8], err[:100])

        affected_agendas.add(from_ag)
        affected_agendas.add(to_ag)

    # ── Extract orphans into new single-item agendas ──
    for orphan in orphans:
        item_id = orphan["item_id"]
        from_ag = orphan["from_agenda_id"]
        item_title = orphan["item_title"]

        if dry_run:
            log.info(
                "  [DRY-RUN] Orphan %s: \"%s\" → new agenda (best=%.3f)",
                item_id[:8], item_title[:50], orphan["best_score"],
            )
            changes += 1
        else:
            new_agenda_id = str(uuid.uuid4())
            safe_title = item_title.replace("'", "''")

            # Create new agenda
            sql_ag = f"""
                INSERT INTO nebula.agendas
                    (id, title, scope, status, source_count, metadata, created_at, updated_at)
                VALUES
                    ('{new_agenda_id}'::uuid, '{safe_title}', 'auto-extracted',
                     'draft', 1,
                     '{{"auto_created": true, "healed_orphan": true}}'::jsonb,
                     '{now}', '{now}');
            """
            rc1, _, err1 = psql(sql_ag)

            # Move item to new agenda
            sql_item = f"""
                UPDATE nebula.agenda_items
                SET agenda_id = '{new_agenda_id}'::uuid, updated_at = '{now}'
                WHERE id = '{item_id}'::uuid
                  AND agenda_id = '{from_ag}'::uuid
                  AND included IS NULL;
            """
            rc2, _, err2 = psql(sql_item)

            if rc1 == 0 and rc2 == 0:
                log.info(
                    "  ✓ Orphan → new agenda %s: \"%s\"",
                    new_agenda_id[:8], item_title[:50],
                )
                changes += 1
                affected_agendas.add(new_agenda_id)
            else:
                log.error(
                    "  ✗ Failed to extract orphan %s: agenda=%s item=%s",
                    item_id[:8], err1[:80], err2[:80],
                )

        affected_agendas.add(from_ag)

    # ── Refresh source_count on all affected agendas ──
    if not dry_run and affected_agendas:
        log.info("Refreshing source_count on %d agendas...", len(affected_agendas))
        for ag_id in affected_agendas:
            psql(f"""
                UPDATE nebula.agendas
                SET source_count = (
                    SELECT COUNT(*) FROM nebula.agenda_items WHERE agenda_id = '{ag_id}'
                ),
                updated_at = '{now}'
                WHERE id = '{ag_id}';
            """)

        # Archive agendas that are now empty
        log.info("Checking for empty agendas to archive...")
        for ag_id in affected_agendas:
            rc, out, _ = psql(f"""
                SELECT COUNT(*)::int FROM nebula.agenda_items WHERE agenda_id = '{ag_id}';
            """)
            if rc == 0 and out.strip() == "0":
                psql(f"""
                    UPDATE nebula.agendas
                    SET status = 'archived', updated_at = '{now}'
                    WHERE id = '{ag_id}' AND status != 'archived';
                """)
                log.info("  Archived empty agenda %s", ag_id[:8])

    return changes


# ── Main ────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Heal agenda-item mismatches using embedding-based semantic similarity"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Analyze and report without making changes"
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Apply the reassignments to the database"
    )
    parser.add_argument(
        "--threshold", type=float, default=0.60,
        help="Minimum cosine similarity to consider a match (default: 0.60)"
    )
    parser.add_argument(
        "--margin", type=float, default=0.05,
        help="Minimum improvement over current agenda to justify a move (default: 0.05)"
    )
    parser.add_argument(
        "--model", type=str, default=EMBED_MODEL,
        help=f"Ollama embedding model (default: {EMBED_MODEL})"
    )
    parser.add_argument(
        "--verbose", "-v", action="store_true",
        help="Show per-item similarity details"
    )
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        parser.error("Specify --dry-run (preview) or --apply (execute)")

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # ── Fetch data ──
    log.info("Fetching agendas and items...")
    agendas = fetch_all_agendas_with_items()
    total_items = sum(len(ag["items"]) for ag in agendas)
    movable = sum(1 for ag in agendas for it in ag["items"] if it.get("included") is None)
    log.info(
        "  %d agendas, %d total items (%d movable, %d human-decided)",
        len(agendas), total_items, movable, total_items - movable,
    )

    if len(agendas) < 2:
        log.info("Only %d agenda(s) — nothing to heal.", len(agendas))
        return 0

    # ── Run healing analysis ──
    log.info("Running healing analysis (threshold=%.2f, margin=%.2f)...",
             args.threshold, args.margin)
    plan = heal(agendas, threshold=args.threshold, margin=args.margin,
                model=args.model, verbose=args.verbose)

    stats = plan.get("stats", {})
    moves = plan.get("moves", [])
    orphans = plan.get("orphans", [])
    low_cohesion = plan.get("low_cohesion", [])

    # ── Report ──
    log.info("=" * 60)
    log.info("HEALING ANALYSIS")
    log.info("  Agendas checked: %d", stats.get("agendas_checked", 0))
    log.info("  Total items:     %d", stats.get("total_items", 0))
    log.info("  Movable items:   %d", stats.get("movable_items", 0))
    log.info("  Misplaced:       %d", stats.get("moves", 0))
    log.info("  Orphans:         %d", stats.get("orphans", 0))
    log.info("  Low cohesion:    %d", stats.get("low_cohesion_warnings", 0))

    if moves:
        log.info("")
        log.info("── Misplaced items (will be reassigned) ──")
        for m in moves:
            log.info(
                "  %s: \"%s\"",
                m["item_id"][:8], m["item_title"][:60],
            )
            log.info(
                "    %s → %s  (score=%.3f, current=%.3f)",
                m["from_agenda_title"][:50], m["to_agenda_title"][:50],
                m["score"], m["current_score"],
            )

    if orphans:
        log.info("")
        log.info("── Orphan items (will be extracted to new agendas) ──")
        for o in orphans:
            log.info(
                "  %s: \"%s\"  (best=%.3f, current=%.3f)",
                o["item_id"][:8], o["item_title"][:60],
                o["best_score"], o["current_score"],
            )

    if low_cohesion:
        log.info("")
        log.info("── Low-cohesion agendas (review recommended) ──")
        for lc in low_cohesion:
            log.info(
                "  %s: \"%s\"  cohesion=%.3f (%d items)",
                lc["agenda_id"][:8], lc["agenda_title"][:60],
                lc["cohesion"], lc["item_count"],
            )

    if not moves and not orphans:
        log.info("")
        log.info("✓ All agendas appear well-clustered. No changes needed.")
        return 0

    log.info("=" * 60)

    # ── Apply ──
    if args.apply:
        log.info("")
        log.info("APPLYING CHANGES...")
        changes = apply_heal(plan, dry_run=False)
        log.info("Applied %d changes.", changes)
    elif args.dry_run:
        log.info("")
        log.info("[DRY-RUN] Would apply %d changes. Use --apply to execute.",
                 len(moves) + len(orphans))

    return 0


if __name__ == "__main__":
    sys.exit(main())
