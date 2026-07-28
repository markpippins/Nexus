#!/usr/bin/env python3
"""
Reconcile Completed — Rule-Based Stage 3 Validation

Fetches completed implementation plans (REVIEW_PASS) and uncompleted harvest
candidates from the database, then uses programmatic semantic matching
(fuzzy title similarity, keyword overlap, DCO execution evidence, explicit
cross-references) to determine which candidates have been implemented.

Also ingests WORK_REQUESTS DCO files from .conduit-data/ to provide concrete
execution evidence (problem statements + produced file paths) alongside each
plan, making the semantic matching more precise.

Candidates matched to a completed plan are marked `completed = true`.

This replaces the Gemini-based inference in batch_mark_completed.py.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/reconcile_completed.py [--dry-run] [--apply] [--threshold 0.45]
    python3 bin/reconcile_completed.py --apply --only-high
    python3 bin/reconcile_completed.py --apply --min-confidence medium
    python3 bin/reconcile_completed.py --skip-dco --dry-run
"""

import argparse
import json
import logging
import re
import sys
from collections import defaultdict
from pathlib import Path

from embed_util import CONFIDENCE_ORDER, DOCKER_PSQL, psql

log = logging.getLogger("reconcile_completed")

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
            'goal', LEFT(p.goal, 500)
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
            'intent', LEFT(COALESCE(hc.intent_description, ''), 500),
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
            'intent', LEFT(COALESCE(hc.intent_description, ''), 500)
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

        # Extract plan ID from derived_from or filename
        derived = d.get("lineage", {}).get("derived_from", [])
        plan_id = derived[0] if derived else f.name.split("-")[1]

        if plan_id not in review_pass_ids:
            continue

        prob = d.get("intent", {}).get("problem_statement", "")
        if prob:
            dcos[plan_id]["work"].add(prob[:300])

        for art in d.get("artifacts", {}).get("produced_files", []):
            path = art.get("path", "")
            if path:
                dcos[plan_id]["files"].add(path)

    # Convert sets to sorted lists
    result = {}
    for pid, data in dcos.items():
        result[pid] = {
            "work": sorted(data["work"]),
            "files": sorted(data["files"]),
        }
    return result


# ── Text normalization ─────────────────────────────────────────────────

_STOP_WORDS = frozenset({
    "a", "an", "the", "and", "or", "of", "for", "to", "in", "on", "by",
    "with", "from", "at", "as", "is", "it", "its", "be", "are", "was",
    "not", "that", "this", "which", "do", "does", "did", "has", "have",
    "had", "will", "would", "can", "could", "should", "may", "might",
    "must", "shall", "if", "then", "else", "when", "how", "what", "who",
    "where", "why", "all", "each", "every", "both", "few", "more", "most",
    "other", "some", "such", "no", "nor", "only", "own", "same", "so",
    "than", "too", "very", "just", "about", "above", "after", "again",
    "also", "any", "because", "before", "between", "into", "through",
    "during", "out", "up", "down", "off", "over", "under", "further",
    "once", "here", "there", "now", "then", "first", "last", "next",
    "new", "old", "add", "create", "build", "implement", "define",
    "design", "develop", "establish", "set", "make", "use",
})

# All lowercase — matches after normalization
_DIAGNOSTIC_WORDS = frozenset({
    "wrp", "nebula", "conduit", "mcp", "ir", "dag", "mweep", "cer",
    "losm", "csg", "peb", "plurality", "nbk", "typespec",
    "bitemporal", "cross-reference", "harvest", "terrain", "tackle",
    "cognitive", "semantic", "projection", "graph", "lease", "kernel",
    "compiler", "traversal", "execution", "runtime", "invariant",
    "role", "governance", "mutation", "temporal", "versioning",
    "scheduler", "validation", "password", "hashing", "authentication",
    "dbt", "olap", "nats", "cascade", "redis", "plurality",
})


def normalize(text: str) -> str:
    """Lowercase, strip punctuation, remove stop words."""
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s\-]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_tokens(text: str) -> set[str]:
    """Extract meaningful tokens from text, stripping stop words."""
    normed = normalize(text)
    tokens = set()
    for word in normed.split():
        if word not in _STOP_WORDS and len(word) > 1:
            tokens.add(word)
    return tokens


# ── Matching engine ────────────────────────────────────────────────────

def title_similarity(a: str, b: str) -> float:
    """Compute similarity between two titles using token overlap."""
    tokens_a = extract_tokens(a)
    tokens_b = extract_tokens(b)

    if not tokens_a or not tokens_b:
        return 0.0

    intersection = tokens_a & tokens_b
    union = tokens_a | tokens_b

    # Base Jaccard
    jaccard = len(intersection) / len(union) if union else 0.0

    # Boost for diagnostic word matches (lowercase set matches lowercase tokens)
    diag_inter = intersection & _DIAGNOSTIC_WORDS
    diag_boost = 0.15 * min(len(diag_inter), 3)

    return min(jaccard + diag_boost, 1.0)


def keyword_overlap(cand_tokens: set[str], reference_tokens: set[str]) -> float:
    """Score based on keyword overlap. Uses candidate token count as denominator
    (recall-oriented: what fraction of the candidate's terms appear in the reference).
    Reusable for both plan goal tokens and DCO work description tokens."""
    if not cand_tokens or not reference_tokens:
        return 0.0

    intersection = cand_tokens & reference_tokens
    return len(intersection) / len(cand_tokens)


def dco_file_match_score(cand_tokens: set[str], dco_files: list[str]) -> float:
    """Score based on overlap between candidate intent tokens and DCO file paths.
    Uses substring containment against the full normalized path, which is more
    effective than token splitting for matching file names to concepts
    (e.g. 'cross_references' matches candidate token 'cross-reference').
    Requires tokens >= 3 chars to avoid false positives on short substrings."""
    if not cand_tokens or not dco_files:
        return 0.0

    # Normalize all file paths to lowercase with hyphens→underscores for matching
    path_text = " ".join(dco_files).lower().replace("-", "_")
    if not path_text:
        return 0.0

    # Count how many candidate tokens appear as substrings in any file path
    # Skip short tokens (< 3 chars) to avoid false positives like 'ir' in 'config.ts'
    eligible = [t for t in cand_tokens if len(t) >= 3]
    if not eligible:
        return 0.0

    matched = 0
    for tok in eligible:
        # Normalize the token: cross-reference → cross_reference
        norm_tok = tok.replace("-", "_")
        if norm_tok in path_text:
            matched += 1

    return matched / len(eligible)


def match_candidate(
    candidate: dict, plans: list[dict], dco_summary: dict[str, dict], threshold: float
) -> dict | None:
    """Match a single candidate against all completed plans, using DCO evidence."""
    cand_title = candidate.get("title", "")
    cand_tokens = extract_tokens(f"{cand_title} {candidate.get('intent', '')}")

    best_plan = None
    best_score = 0.0
    best_reasoning = ""

    # Check explicit spawns_plan reference first
    plan_ref = candidate.get("plan_ref")
    plan_status = candidate.get("plan_status")
    if plan_ref and plan_status == "REVIEW_PASS":
        return {
            "candidate_id": candidate["id"],
            "candidate_title": cand_title,
            "matched_plan_ids": [str(plan_ref)],
            "confidence": "high",
            "reasoning": f"Explicit spawns_plan link to REVIEW_PASS plan {plan_ref}",
        }

    for plan in plans:
        plan_title = plan.get("title", "")
        plan_goal = plan.get("goal", "")
        plan_tokens = extract_tokens(f"{plan_title} {plan_goal}")
        pid = plan["id"]

        # Score 1: Title-to-title similarity
        t_sim = title_similarity(cand_title, plan_title)

        # Score 2: Keyword overlap (recall-oriented)
        kw_score = keyword_overlap(cand_tokens, plan_tokens)

        # Score 3: DCO file path matching (strong signal)
        dco = dco_summary.get(pid, {})
        file_score = dco_file_match_score(cand_tokens, dco.get("files", []))

        # Score 4: DCO work description matching (reuse keyword_overlap)
        work_tokens = extract_tokens(" ".join(dco.get("work", []))) if dco.get("work") else set()
        work_score = keyword_overlap(cand_tokens, work_tokens)

        # Combined score: base (title + keywords) + DCO bonus
        # Base weights are always 0.6/0.4 so title similarity contributes
        # the same amount regardless of DCO presence.
        base_score = 0.6 * t_sim + 0.4 * kw_score
        dco_bonus = 0.2 * file_score + 0.15 * work_score
        score = min(base_score + dco_bonus, 1.0)

        if score > best_score:
            best_score = score
            best_plan = plan
            parts = [f"title={t_sim:.2f}", f"kw={kw_score:.2f}"]
            if dco.get("files") or dco.get("work"):
                parts.extend([f"file={file_score:.2f}", f"work={work_score:.2f}"])
            best_reasoning = f"{', '.join(parts)}, combined={score:.2f}"

    if best_plan and best_score >= threshold:
        if best_score >= 0.7:
            confidence = "high"
        elif best_score >= 0.55:
            confidence = "medium"
        else:
            confidence = "low"

        return {
            "candidate_id": candidate["id"],
            "candidate_title": cand_title,
            "matched_plan_ids": [str(best_plan["id"])],
            "confidence": confidence,
            "reasoning": best_reasoning,
        }

    return None


# ── Main ───────────────────────────────────────────────────────────────


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Match completed plans to candidates using rule-based matching"
    )
    parser.add_argument("--dry-run", action="store_true", help="Don't update candidates")
    parser.add_argument("--apply", action="store_true", help="Mark matched candidates as completed")
    parser.add_argument(
        "--threshold", type=float, default=0.35,
        help="Minimum match score threshold (default: 0.35)"
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
        "--output", type=str, default=None,
        help="Write match results to JSON file for review"
    )
    args = parser.parse_args()

    if args.only_high:
        args.min_confidence = "high"

    if args.min_confidence and not args.apply and not args.dry_run:
        log.warning("--min-confidence / --only-high without --apply has no effect")

    log.info("Fetching completed plans...")
    plans = fetch_completed_plans()
    log.info("  %d REVIEW_PASS plans found", len(plans))

    review_pass_ids = {p["id"] for p in plans}

    # DCO summary
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

    # Match each candidate
    all_matched = []
    all_unmatched = []

    for candidate in candidates:
        result = match_candidate(candidate, plans, dco_summary, args.threshold)
        if result:
            all_matched.append(result)
        else:
            all_unmatched.append({
                "candidate_id": candidate["id"],
                "candidate_title": candidate.get("title", ""),
                "reason": "No completed plan matches above threshold",
            })

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
        log.info("")
        log.info("Top matches:")
        for m in sorted(all_matched, key=lambda x: x.get("reasoning", ""), reverse=True)[:20]:
            log.info(
                "  [%s] %s -> plans %s (%s)",
                m["confidence"], m["candidate_title"][:60],
                ",".join(m["matched_plan_ids"]),
                m["reasoning"][:60],
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
