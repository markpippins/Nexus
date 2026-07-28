#!/usr/bin/env python3
"""
Reconcile Embeddings — Semantic Similarity Stage 3 Validation

Fetches completed implementation plans (REVIEW_PASS) and uncompleted harvest
candidates from the database, then uses a local Ollama embedding model to
compute dense semantic similarity between candidate intent and plan text
(including DCO execution evidence). This replaces the sparse keyword matching
in reconcile_completed.py with true vector-space semantic alignment.

Candidates matched to a completed plan are marked `completed = true`.

Embeddings are cached to disk so re-runs are fast.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/reconcile_embeddings.py --dry-run
    python3 bin/reconcile_embeddings.py --apply --threshold 0.65
    python3 bin/reconcile_embeddings.py --apply --only-high --model nomic-embed-text
    python3 bin/reconcile_embeddings.py --dry-run --top-k 3 --output /tmp/embed_matches.json
    python3 bin/reconcile_embeddings.py --dry-run --limit 20
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import urllib.error
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np

from embed_util import (
    CONFIDENCE_ORDER,
    CACHE_DIR,
    DEFAULT_MODEL,
    DOCKER_PSQL,
    OLLAMA_API,
    build_candidate_text,
    cosine_similarity_matrix,
    embed_texts,
    psql,
)

log = logging.getLogger("reconcile_embeddings")

WORK_REQUESTS_DIR = Path("/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stderr,
)


# ── Data fetching ──────────────────────────────────────────────────────

def fetch_completed_plans() -> list[dict]:
    """Fetch all REVIEW_PASS plans with their titles and goals."""
    _, data = psql("""
        SELECT json_agg(json_build_object(
            'id', p.id,
            'title', p.title,
            'goal', LEFT(p.goal, 800)
        ) ORDER BY p.id)
        FROM nebula.plan_status ps
        JOIN nebula.plans p ON p.id = ps.id
        WHERE ps.derived_status = 'REVIEW_PASS'
    """)
    if not data or data == "NULL":
        return []
    return json.loads(data)


def fetch_uncompleted_candidates() -> list[dict]:
    """Fetch all candidates with completed=false."""
    _, explicit = psql("""
        SELECT json_agg(json_build_object(
            'id', hc.id,
            'title', hc.title,
            'intent', LEFT(COALESCE(hc.intent_description, ''), 800),
            'plan_ref', cr.target_id,
            'plan_status', ps.derived_status
        ) ORDER BY hc.created_at DESC)
        FROM nebula.harvest_candidates hc
        JOIN nebula.cross_references cr ON cr.source_id = hc.id::text
            AND cr.rel_type = 'spawns_plan' AND cr.source_type = 'harvest_candidate'
        LEFT JOIN nebula.plan_status ps ON ps.id = cr.target_id
        WHERE hc.completed = false
    """)
    _, implicit = psql("""
        SELECT json_agg(json_build_object(
            'id', hc.id,
            'title', hc.title,
            'intent', LEFT(COALESCE(hc.intent_description, ''), 800)
        ) ORDER BY hc.created_at DESC)
        FROM nebula.harvest_candidates hc
        WHERE hc.completed = false
        AND NOT EXISTS (
            SELECT 1 FROM nebula.cross_references cr
            WHERE cr.source_id = hc.id::text
            AND cr.rel_type = 'spawns_plan' AND cr.source_type = 'harvest_candidate'
        )
    """)
    result = []
    if explicit and explicit != "NULL":
        result.extend(json.loads(explicit))
    if implicit and implicit != "NULL":
        result.extend(json.loads(implicit))
    return result


def fetch_dco_summary(review_pass_ids: set[str]) -> dict[str, dict]:
    """Read WORK_REQUESTS DCO files and build a per-plan summary of work
    descriptions and produced file paths. Only includes plans in the
    review_pass_ids set. Returns {plan_id: {"work": [str], "files": [str]}}."""
    if not WORK_REQUESTS_DIR.is_dir():
        log.warning("WORK_REQUESTS directory not found at %s", WORK_REQUESTS_DIR)
        return {}

    dcos = defaultdict(lambda: {"work": set(), "files": set()})
    for f in WORK_REQUESTS_DIR.glob("*.json"):
        try:
            d = json.loads(f.read_text())
        except (json.JSONDecodeError, OSError):
            continue

        derived = d.get("lineage", {}).get("derived_from", [])
        plan_id = derived[0] if derived else f.name.split("-")[1]

        if plan_id not in review_pass_ids:
            continue

        prob = d.get("intent", {}).get("problem_statement", "")
        if prob:
            dcos[plan_id]["work"].add(prob[:400])

        for art in d.get("artifacts", {}).get("produced_files", []):
            path = art.get("path", "")
            if path:
                dcos[plan_id]["files"].add(path)

    result = {}
    for pid, data in dcos.items():
        result[pid] = {
            "work": sorted(data["work"]),
            "files": sorted(data["files"]),
        }
    return result


# ── Text preparation ───────────────────────────────────────────────────

def build_plan_text(plan: dict, dco_summary: dict[str, dict]) -> str:
    """Build a rich text representation of a plan for embedding."""
    parts = [f"Plan: {plan.get('title', '')}"]
    goal = plan.get("goal", "")
    if goal:
        parts.append(f"Goal: {goal}")

    pid = plan["id"]
    dco = dco_summary.get(pid, {})

    work_items = dco.get("work", [])
    if work_items:
        parts.append("Work performed:")
        for w in work_items[:5]:
            parts.append(f"  - {w}")

    files = dco.get("files", [])
    if files:
        parts.append("Files produced:")
        for f in files[:10]:
            parts.append(f"  - {f}")

    return "\n".join(parts)


# ── Matching engine ────────────────────────────────────────────────────

def match_candidates(
    candidates_to_embed: list[dict],
    candidate_embeddings: np.ndarray,
    plans: list[dict],
    plan_embeddings: np.ndarray,
    threshold: float,
    top_k: int = 1,
) -> tuple[list[dict], list[dict]]:
    """Match candidates to plans using cosine similarity of embeddings.
    Returns (matched, unmatched)."""
    sim_matrix = cosine_similarity_matrix(candidate_embeddings, plan_embeddings)
    matched = []
    unmatched = []

    for i, candidate in enumerate(candidates_to_embed):
        sim_row = sim_matrix[i]
        best_indices = np.argsort(sim_row)[::-1][:top_k]
        best_score = float(sim_row[best_indices[0]])

        if best_score >= threshold:
            matched_plan_ids = [str(plans[idx]["id"]) for idx in best_indices if sim_row[idx] >= threshold]

            if best_score >= 0.80:
                confidence = "high"
            elif best_score >= 0.65:
                confidence = "medium"
            else:
                confidence = "low"

            reasoning_parts = [f"cosine_sim={best_score:.3f}"]
            if len(matched_plan_ids) > 1:
                reasoning_parts.append(f"multi_match={len(matched_plan_ids)}")

            matched.append({
                "candidate_id": candidate["id"],
                "candidate_title": candidate.get("title", ""),
                "matched_plan_ids": matched_plan_ids,
                "confidence": confidence,
                "reasoning": ", ".join(reasoning_parts),
                "similarity": best_score,
            })
        else:
            best_plan_id = str(plans[best_indices[0]]["id"]) if len(plans) > 0 else "none"
            unmatched.append({
                "candidate_id": candidate["id"],
                "candidate_title": candidate.get("title", ""),
                "reason": f"Best similarity {best_score:.3f} to plan {best_plan_id} below threshold {threshold}",
                "best_similarity": best_score,
                "best_plan_id": best_plan_id,
            })

    return matched, unmatched


# ── Main ───────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Match completed plans to candidates using embedding-based semantic similarity"
    )
    parser.add_argument("--dry-run", action="store_true", help="Don't update candidates")
    parser.add_argument("--apply", action="store_true", help="Mark matched candidates as completed")
    parser.add_argument(
        "--threshold", type=float, default=0.45,
        help="Minimum cosine similarity threshold (default: 0.45)"
    )
    parser.add_argument(
        "--top-k", type=int, default=1,
        help="Return top-K plan matches per candidate (default: 1)"
    )
    parser.add_argument(
        "--min-confidence", type=str, default=None,
        choices=["low", "medium", "high"],
        help="Only apply matches at or above this confidence level"
    )
    parser.add_argument(
        "--only-high", action="store_true",
        help="Shorthand for --min-confidence high"
    )
    parser.add_argument(
        "--skip-dco", action="store_true",
        help="Skip DCO file ingestion (less context, faster)"
    )
    parser.add_argument(
        "--model", type=str, default=DEFAULT_MODEL,
        help=f"Ollama embedding model to use (default: {DEFAULT_MODEL})"
    )
    parser.add_argument(
        "--clear-cache", action="store_true",
        help="Clear the embedding cache before running"
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Only process the first N candidates (useful for quick tests)"
    )
    parser.add_argument(
        "--output", type=str, default=None,
        help="Write match results to JSON file for review"
    )
    args = parser.parse_args()

    if args.top_k < 1:
        parser.error("--top-k must be >= 1")

    if args.only_high:
        args.min_confidence = "high"

    if args.min_confidence and not args.apply and not args.dry_run:
        log.warning("--min-confidence / --only-high without --apply has no effect")

    if args.clear_cache and CACHE_DIR.is_dir():
        log.info("Clearing embedding cache at %s", CACHE_DIR)
        for f in CACHE_DIR.glob("*.npy"):
            f.unlink()

    # Pre-flight Ollama health check
    try:
        with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=5) as r:
            models = json.loads(r.read().decode()).get("models", [])
            model_names = {m["name"] for m in models}
            if args.model not in model_names and f"{args.model}:latest" not in model_names:
                log.warning("Model %s not found in Ollama. Available: %s", args.model, ", ".join(sorted(model_names)[:10]))
    except Exception as e:
        log.error("Ollama not reachable at localhost:11434 — %s", e)
        return 1

    log.info("Fetching completed plans...")
    plans = fetch_completed_plans()
    log.info("  %d REVIEW_PASS plans found", len(plans))

    if not plans:
        log.info("No REVIEW_PASS plans found. Nothing to match against.")
        return 0

    review_pass_ids = {p["id"] for p in plans}

    dco_summary = {}
    if not args.skip_dco:
        log.info("Reading WORK_REQUESTS DCO files...")
        dco_summary = fetch_dco_summary(review_pass_ids)
        log.info("  %d of %d plans have DCO execution evidence",
                 len(dco_summary), len(plans))
        total_work = sum(len(d["work"]) for d in dco_summary.values())
        total_files = sum(len(d["files"]) for d in dco_summary.values())
        log.info("  %d unique work descriptions, %d unique file paths",
                 total_work, total_files)

    log.info("Fetching uncompleted candidates...")
    candidates = fetch_uncompleted_candidates()
    log.info("  %d uncompleted candidates found", len(candidates))

    if not candidates:
        log.info("All candidates already completed. Nothing to do.")
        return 0

    if args.limit is not None and args.limit > 0:
        candidates = candidates[:args.limit]
        log.info("  --limit %d applied; processing %d candidates", args.limit, len(candidates))

    # Separate explicit spawns_plan matches to skip embedding them
    explicit_matches = []
    candidates_to_embed = []
    for c in candidates:
        plan_ref = c.get("plan_ref")
        plan_status = c.get("plan_status")
        if plan_ref and plan_status == "REVIEW_PASS":
            explicit_matches.append({
                "candidate_id": c["id"],
                "candidate_title": c.get("title", ""),
                "matched_plan_ids": [str(plan_ref)],
                "confidence": "high",
                "reasoning": f"Explicit spawns_plan link to REVIEW_PASS plan {plan_ref}",
                "similarity": 1.0,
            })
        else:
            candidates_to_embed.append(c)

    # Build texts
    log.info("Building plan texts...")
    plan_texts = [build_plan_text(p, dco_summary) for p in plans]

    # Embed plans
    log.info("Embedding %d plans via Ollama (%s)...", len(plan_texts), args.model)
    plan_embeddings = embed_texts(plan_texts, model=args.model)
    log.info("  Plan embeddings shape: %s", plan_embeddings.shape)

    # Embed candidates (only those without explicit spawns_plan links)
    embed_matched: list[dict] = []
    all_unmatched: list[dict] = []
    if candidates_to_embed:
        log.info("Building candidate texts...")
        candidate_texts = [build_candidate_text(c) for c in candidates_to_embed]

        batch_size = 128
        candidate_embeddings_list = []
        log.info("Embedding %d candidates in batches of %d...", len(candidate_texts), batch_size)
        for start in range(0, len(candidate_texts), batch_size):
            end = min(start + batch_size, len(candidate_texts))
            batch = candidate_texts[start:end]
            log.info("  Batch %d/%d (%d texts)...",
                     start // batch_size + 1,
                     (len(candidate_texts) + batch_size - 1) // batch_size,
                     len(batch))
            emb = embed_texts(batch, model=args.model)
            candidate_embeddings_list.append(emb)
        candidate_embeddings = np.concatenate(candidate_embeddings_list, axis=0)
        log.info("  Candidate embeddings shape: %s", candidate_embeddings.shape)

        # Match
        log.info("Computing similarity matrix and matching...")
        embed_matched, all_unmatched = match_candidates(
            candidates_to_embed, candidate_embeddings, plans, plan_embeddings,
            threshold=args.threshold, top_k=args.top_k,
        )
    else:
        log.info("All remaining candidates have explicit spawns_plan links — skipping embedding.")

    all_matched = explicit_matches + embed_matched

    # Summary
    matched_count = len(all_matched)
    unmatched_count = len(all_unmatched)
    log.info("=" * 60)
    log.info(
        "RESULTS: %d matched, %d unmatched across %d candidates",
        matched_count, unmatched_count, matched_count + unmatched_count,
    )
    if matched_count > 0:
        high = sum(1 for m in all_matched if m.get("confidence") == "high")
        med = sum(1 for m in all_matched if m.get("confidence") == "medium")
        low = sum(1 for m in all_matched if m.get("confidence") == "low")
        log.info("  Confidence breakdown: high=%d, medium=%d, low=%d", high, med, low)

        # Show top matches by similarity
        log.info("")
        log.info("Top matches by similarity:")
        for m in sorted(all_matched, key=lambda x: x.get("similarity", 0), reverse=True)[:20]:
            log.info(
                "  [%s] sim=%.3f %s -> plans %s (%s)",
                m["confidence"], m.get("similarity", 0),
                m["candidate_title"][:55],
                ",".join(m["matched_plan_ids"]),
                m["reasoning"][:55],
            )
    log.info("=" * 60)

    # Write results to file if requested
    if args.output:
        output = {"matched": all_matched, "unmatched": all_unmatched}
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
        log.info("Results written to %s", args.output)

    # Filter by min-confidence for --apply
    to_apply = all_matched
    if args.min_confidence:
        min_level = CONFIDENCE_ORDER.get(args.min_confidence, 0)
        to_apply = [
            m for m in all_matched
            if CONFIDENCE_ORDER.get(m.get("confidence", "low"), 0) >= min_level
        ]
        log.info(
            "Filtering to --min-confidence=%s: %d of %d matches eligible",
            args.min_confidence, len(to_apply), len(all_matched),
        )

    # Apply updates
    if args.apply and not args.dry_run:
        log.info("Applying %d matches via direct SQL UPDATE...", len(to_apply))
        ids = [m["candidate_id"] for m in to_apply]
        if ids:
            # IDs are trusted UUIDs from the same database; safe for string interpolation
            id_list = ",".join(f"'{i}'" for i in ids)
            sql = f"UPDATE nebula.harvest_candidates SET completed = true WHERE id IN ({id_list});"
            rc, stdout = psql(sql, timeout=60)
            if rc == 0:
                # stdout format: "UPDATE N"
                parts = stdout.split()
                count = parts[1] if len(parts) > 1 else "?"
                log.info("Marked %s candidates as completed", count)
            else:
                log.error("SQL UPDATE failed: %s", stdout)
    elif args.dry_run:
        log.info("[DRY-RUN] Would mark %d candidates as completed", len(to_apply))
    elif not args.apply:
        log.info("Use --apply to mark candidates as completed, or --output to save results")

    return 0


if __name__ == "__main__":
    sys.exit(main())
