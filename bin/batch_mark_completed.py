#!/usr/bin/env python3
"""
Batch Mark Candidates Completed — Stage 3 Validation

Fetches completed implementation plans (REVIEW_PASS) and uncompleted harvest
candidates from the database, then uses Gemini 2.5 Flash to semantically match
candidates to the plans that implemented them.

Also ingests the WORK_REQUESTS DCO files from .conduit-data/ to provide concrete
execution evidence (problem statements + produced file paths) alongside each plan,
making the semantic matching much more precise.

Candidates matched to a completed plan are marked `completed = true`, building
the audit trail for conduit-era work that predates the WRP runtime.

Usage:
    source /home/codex/dev/nexus/python/rover/.venv/bin/activate
    python3 bin/batch_mark_completed.py [--dry-run] [--batch N]
"""

import argparse
import json
import logging
import subprocess
import sys
import time
import os
import urllib.request
import urllib.error
from pathlib import Path

# Add rover source dir so `event_emitter` is importable without PYTHONPATH
# (matches the pattern in analyst_answer_questions.py /
# architect_process_todo.py). `tackle.*` is resolved by the rover venv's
# nexus_python.pth which adds nexus/python/ to sys.path.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "python", "rover"))

from event_emitter import emit_candidate_completed
from collections import defaultdict

from tackle.inference import call_llm

log = logging.getLogger("batch_mark_completed")

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus"]
NEBULA_API = "http://localhost:3101/api"
WORK_REQUESTS_DIR = Path("/home/codex/dev/nexus/.conduit-data/WORK_REQUESTS")
# Model config resolved via tackle-mcp (role: Rover)
# See tackle/inference.py and config bundles at POST /config/ai/bundles/:role

LOG_DIR = Path("/home/codex/dev/nexus/logs")
LOG_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stderr),
        logging.FileHandler(LOG_DIR / "batch_mark_completed.log"),
    ],
)


def psql(sql: str, timeout: int = 30) -> tuple[int, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)"


def nebula_patch(path: str, body: dict) -> dict:
    url = f"{NEBULA_API}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="PATCH")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        log.error("  HTTP %d from PATCH %s: %s", e.code, path, body_text[:200])
        return {"error": body_text}


# ── Data fetching ──────────────────────────────────────────────────────

def fetch_completed_plans() -> list[dict]:
    """Fetch all REVIEW_PASS plans with their titles and goals."""
    _, data = psql("""
        SELECT json_agg(json_build_object(
            'id', p.id,
            'title', p.title,
            'goal', LEFT(p.goal, 300)
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
    _, data = psql("""
        SELECT json_agg(json_build_object(
            'id', hc.id,
            'title', hc.title,
            'intent', LEFT(COALESCE(hc.intent_description, ''), 300),
            'plan_ref', cr.target_id,
            'plan_status', ps.derived_status
        ) ORDER BY hc.created_at DESC)
        FROM nebula.harvest_candidates hc
        LEFT JOIN nebula.cross_references cr ON cr.source_id = hc.id::text
            AND cr.rel_type = 'spawns_plan' AND cr.source_type = 'harvest_candidate'
        LEFT JOIN nebula.plan_status ps ON ps.id = cr.target_id
        WHERE hc.completed = false
    """)
    if not data or data == "NULL":
        return []
    return json.loads(data)


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


# ── Gemini prompt ──────────────────────────────────────────────────────

VALIDATION_PROMPT = """You are an audit validation agent for the Nexus WorkRequest Pipeline.

Your task: determine which of the provided harvest candidates have been **implemented** by one or more of the completed implementation plans.

You will be given three sections of data:
1. **Completed Implementation Plans** — each plan has an ID, title, and goal.
2. **Execution Evidence (DCO)** — for each plan, the actual work descriptions and file paths that were produced when the plan was executed. These come from the WORK_REQUESTS directory and show what was *really* built.
3. **Harvest Candidates** — architectural concepts extracted from conversations that represent work items.

## Criteria for "implemented"

A candidate counts as implemented if:
1. A completed plan's title/goal substantially addresses the candidate's title or intent.
2. **OR** the execution evidence (DCO work descriptions and produced file paths) shows that concrete work matching the candidate's intent was actually performed.
3. **OR** the candidate has an explicit `spawns_plan` cross-reference to a REVIEW_PASS plan (these are already certain — confirm and include them).

Use the DCO execution evidence as your strongest signal. If a candidate says "Build a cross-references table" and the DCO for plan 0147 shows files like `migrations/...cross_references.sql` and `routes: POST /api/cross-references`, that is strong evidence the work was done — even if the plan title is less descriptive.

File paths are particularly useful for matching. Cross-reference candidate intent keywords against the actual files produced.

## What NOT to match

- Plans that are PROPOSED, CANCELLED, REQUEUED, or have no derived_status — these are NOT completed.
- Candidates that represent ongoing architectural direction rather than discrete implemented work — these are aspirational, not completed.
- Candidates where the plan only partially addresses the candidate's intent — use your judgment; if significant scope remains, don't mark it.

## Output format

Return a JSON object with this structure:
{
  "matched": [
    {
      "candidate_id": "<uuid>",
      "candidate_title": "<title>",
      "matched_plan_ids": ["<plan_id>"],
      "confidence": "high|medium|low",
      "reasoning": "Brief explanation of why this candidate is addressed by the matched plan(s), referencing the execution evidence where applicable"
    }
  ],
  "unmatched": [
    {
      "candidate_id": "<uuid>",
      "candidate_title": "<title>",
      "reason": "Why this candidate was not matched to any completed plan"
    }
  ]
}

Rules:
- Return ONLY valid JSON. No markdown fences, no commentary outside the JSON.
- Every candidate in the input must appear in either `matched` or `unmatched`.
- Use "high" confidence for explicit spawns_plan links to REVIEW_PASS plans.
- Use "medium" for strong semantic matches supported by DCO evidence.
- Use "low" for plausible but uncertain matches (these will be reviewed manually).
- If a candidate matches multiple plans, list all plan IDs.
"""


# ── Gemini call ────────────────────────────────────────────────────────

def call_llm_validation(plans: list[dict], candidates: list[dict],
                         dco_summary: dict[str, dict]) -> dict | None:
    """Send a batch to the LLM and parse the matched candidates response.
    
    Model config is resolved via tackle-mcp (role: Rover), not hardcoded.
    """
    # Build plans section — compact
    plan_lines = []
    for p in plans:
        pid = p["id"]
        dco = dco_summary.get(pid, {})

        # Base plan info
        plan_lines.append(f"[{pid}] {p['title']}")

        # DCO execution evidence (if available)
        work_items = dco.get("work", [])
        if work_items:
            for w in work_items[:3]:  # max 3 work descriptions per plan
                plan_lines.append(f"  Work: {w[:200]}")
            if len(work_items) > 3:
                plan_lines.append(f"  (+ {len(work_items) - 3} more work descriptions)")

        files = dco.get("files", [])
        if files:
            # Dedup to extension-level for display
            shown = [f for f in files[:8]]
            for f in shown:
                plan_lines.append(f"  File: {f}")
            if len(files) > 8:
                plan_lines.append(f"  (+ {len(files) - 8} more files)")

    plans_text = "\n".join(plan_lines)

    # Build candidates section — each candidate with its spawns_plan link if any
    candidates_text = json.dumps(candidates, indent=2)

    user_msg = f"""## Completed Implementation Plans with Execution Evidence ({len(plans)} total)

{plans_text}

## Uncompleted Harvest Candidates ({len(candidates)} total)

{candidates_text}

## Task

For each candidate above, determine if it has been implemented by any of the completed plans. Use both the plan descriptions and the DCO execution evidence (work descriptions + produced file paths) to make your determination. Return a JSON object with "matched" and "unmatched" arrays as specified."""

    try:
        text = call_llm(
            prompt=user_msg,
            role="Rover",
            system_prompt=VALIDATION_PROMPT,
            temperature=0.1,
            max_tokens=8192,
        )
        if text is None:
            log.error("  call_llm returned None — API error")
            return None

        text = text.strip()
        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            text = "\n".join(lines).strip()
        result = json.loads(text)
        return result
    except json.JSONDecodeError as e:
        log.error("  JSON parse error: %s", e)
        log.error("  Raw response (first 500): %s", text[:500])
        return None
    except Exception as e:
        log.error("  LLM API error: %s", e)
        return None


# ── Main ───────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="Match completed plans to candidates and mark as completed")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually update candidates")
    parser.add_argument("--batch", type=int, default=50, help="Candidates per Gemini batch (default 50)")
    parser.add_argument("--skip-dco", action="store_true", help="Skip DCO file ingestion (less context)")
    args = parser.parse_args()

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
        total_dcos = sum(len(d["work"]) for d in dco_summary.values())
        total_files = sum(len(d["files"]) for d in dco_summary.values())
        log.info("  %d unique work descriptions, %d unique file paths",
                 total_dcos, total_files)

    log.info("Fetching uncompleted candidates...")
    candidates = fetch_uncompleted_candidates()
    log.info("  %d uncompleted candidates found", len(candidates))

    if not candidates:
        log.info("All candidates already completed. Nothing to do.")
        return 0

    # Batch candidates
    batch_size = args.batch
    all_matched = []
    all_unmatched = []

    for batch_start in range(0, len(candidates), batch_size):
        batch = candidates[batch_start:batch_start + batch_size]
        batch_label = f"batch {batch_start // batch_size + 1}/{(len(candidates) + batch_size - 1) // batch_size}"
        log.info("Processing %s (%d candidates)...", batch_label, len(batch))

        result = call_llm_validation(plans, batch, dco_summary)
        if result is None:
            log.error("  Skipping %s due to API error", batch_label)
            continue

        matched = result.get("matched", [])
        unmatched = result.get("unmatched", [])
        all_matched.extend(matched)
        all_unmatched.extend(unmatched)

        log.info("  %s: %d matched, %d unmatched", batch_label, len(matched), len(unmatched))

        # Apply updates
        for m in matched:
            cid = m["candidate_id"]
            conf = m.get("confidence", "low")
            reasoning = m.get("reasoning", "")
            if args.dry_run:
                log.info("  [DRY-RUN] Would mark %s as completed (confidence=%s): %s",
                         cid, conf, reasoning[:80])
            else:
                result = nebula_patch(f"/api/harvest-candidates/{cid}", {"completed": True})
                if "error" not in result:
                    log.info("  Marked %s completed (confidence=%s): %s",
                             cid, conf, reasoning[:80])

                    # Cascade event: candidate.completed
                    try:
                        plan_ids = m.get("matched_plan_ids", [])
                        plan_id = plan_ids[0] if plan_ids else None
                        emit_candidate_completed(
                            candidate_id=cid,
                            plan_id=plan_id,
                            confidence=conf,
                            source="rover.batch_mark_completed",
                        )
                    except Exception as e:
                        log.debug("  candidate.completed emission failed: %s", e)
                else:
                    log.error("  Failed to update %s: %s", cid, result.get("error", "unknown"))

        # Brief pause between batches to avoid rate limits
        if batch_start + batch_size < len(candidates):
            time.sleep(2)

    # Summary
    matched_count = len(all_matched)
    unmatched_count = len(all_unmatched)
    log.info("=" * 60)
    log.info("RESULTS: %d matched, %d unmatched across %d candidates",
             matched_count, unmatched_count, matched_count + unmatched_count)
    if matched_count > 0:
        high = sum(1 for m in all_matched if m.get("confidence") == "high")
        med = sum(1 for m in all_matched if m.get("confidence") == "medium")
        low = sum(1 for m in all_matched if m.get("confidence") == "low")
        log.info("  Confidence breakdown: high=%d, medium=%d, low=%d", high, med, low)
    log.info("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
