"""
Auditor claim extractor — LLM-driven typed claim extraction.

The Auditor reads raw transcript source_observations, calls the configured
LLM with a structured claim-extraction prompt, parses the JSON response,
and writes typed claims (file_change, api_change, bug_fix, design_decision,
tradeoff, blocker) into the semantics schema as evidence_item rows with
origin 'claim_extracted' and verification_state 'candidate', linked to the
source_observation via statement_evidence.

Per the Auditor role prompt (docs/claim-extractor-role-prompt.md):
  - The transcript's source_observation is the primary source (strength 0.95).
  - Claims are deduped via the unique partial index
    (evidence_type_id, source_hash, digest(excerpt, 'sha256')).
  - verification_state stays 'candidate' — confirmation is the owning
    role's job.
"""

import json
import logging
from typing import Optional

from tackle.inference import call_llm

from . import db

_log = logging.getLogger("auditor.claim_extractor")

# ── Claim vocabulary (must exist in semantics.evidence_type) ────────

CLAIM_TYPES = [
    "file_change",
    "api_change",
    "bug_fix",
    "design_decision",
    "tradeoff",
    "blocker",
]

# ── Extraction prompt ───────────────────────────────────────────────

def _build_claim_prompt(transcript_text: str, claim_types: list[dict]) -> str:
    """Build the LLM prompt for typed claim extraction."""
    type_list = "\n".join(
        f"  - {t['name']}: {t.get('description', '')[:120]}" for t in claim_types
    )
    return f"""You are the Auditor — a claim extraction agent.
Analyze the following conversation transcript and extract only claims the
transcript substantiates.

## Claim Types ({len(claim_types)} total)
{type_list}

## Transcript
{transcript_text[:8000]}

## Instructions
Extract the following into a JSON object:

1. **claims**: List of typed claims the transcript substantiates.
   - `type`: One of the claim types above (exact name).
   - `excerpt`: 1-3 sentence summary of the claim — this is the dedup key.
   - `note`: Longer explanation with context, rationale, and cross-refs.
   - `confidence`: 0.0-1.0 how confident you are the transcript supports it.

## Rules
- Do NOT emit a claim for every file mentioned — only claims the transcript
  substantiates.
- A discussion that weighs options but reaches no decision is a `tradeoff`,
  not a `design_decision`.
- If a decision was reached, emit `design_decision`. If code/files changed,
  emit `file_change` and/or `api_change`. If something broke, emit `bug_fix`.
  If work is blocked, emit `blocker`.

Return ONLY valid JSON — no markdown, no explanation:
{{"claims": [{{"type": "...", "excerpt": "...", "note": "...", "confidence": 0.9}}]}}
"""


def _extract_from_transcript(
    text: str,
    observation: dict,
    *,
    role: str = "auditor",
    dry_run: bool = False,
) -> dict:
    """
    Run claim extraction on a single transcript source_observation.

    Returns a summary dict with counts of what was created.
    """
    if not text or len(text.strip()) < 50:
        _log.info("Skipping observation %s: text too short (%d chars)",
                  observation["id"], len(text) if text else 0)
        return {"claims": 0, "skipped": True}

    # Fetch the claim vocabulary for prompt context
    claim_types = db.fetch_claim_evidence_types()
    type_by_name = {t["name"]: t for t in claim_types}

    prompt = _build_claim_prompt(text, claim_types)
    system_prompt = (
        "You are the Auditor. Extract typed, verifiable claims from the "
        "transcript. Return ONLY valid JSON. Use EXACT claim type names "
        "from the provided list. Never invent claims the transcript does "
        "not substantiate."
    )

    if dry_run:
        _log.info("DRY RUN: would extract claims from observation %s (%d chars)",
                  observation["id"], len(text))
        return {"claims": 0, "dry_run": True}

    _log.info("Calling LLM for observation %s (%d chars)...", observation["id"], len(text))
    response = call_llm(
        prompt,
        role=role,
        system_prompt=system_prompt,
        temperature=0.1,
        max_tokens=4096,
    )

    if response is None:
        _log.error("LLM call failed for observation %s", observation["id"])
        return {"claims": 0, "error": "LLM call failed"}

    # Parse the JSON response
    try:
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        extracted = json.loads(cleaned)
    except json.JSONDecodeError as e:
        _log.error("Failed to parse LLM response for observation %s: %s\nResponse: %s",
                   observation["id"], e, response[:500])
        return {"claims": 0, "error": f"JSON parse error: {e}"}

    return _persist_claims(extracted, observation, type_by_name)


def _persist_claims(
    extracted: dict,
    observation: dict,
    type_by_name: dict,
) -> dict:
    """Write extracted claims to the DB as evidence_item + statement_evidence."""
    stats = {"claims": 0}
    transcript_so_id = observation["id"]
    source_hash = observation.get("raw_hash") or observation.get("id")

    for c in extracted.get("claims", []):
        claim_type = (c.get("type") or "").strip().lower()
        excerpt = (c.get("excerpt") or "").strip()[:2000]
        note = c.get("note", "")
        confidence = c.get("confidence")

        if not claim_type or not excerpt:
            continue
        claim_type_row = type_by_name.get(claim_type)
        if not claim_type_row:
            _log.debug("Skipping claim: unknown type '%s'", claim_type)
            continue

        try:
            confidence_f = float(confidence) if confidence is not None else None
        except (TypeError, ValueError):
            confidence_f = None
        if confidence_f is not None:
            confidence_f = max(0.0, min(1.0, confidence_f))

        ev = db.create_evidence_item(
            evidence_type_id=claim_type_row["id"],
            excerpt=excerpt,
            note=note or f"Claim extracted from transcript {transcript_so_id}",
            origin="claim_extracted",
            source_hash=source_hash,
            source_observation_id=transcript_so_id,
            metadata={"transcript_asset": observation.get("canonical_asset_id"),
                      "claim_type": claim_type},
            verification_state="candidate",
        )
        if ev.get("id") is None:
            _log.debug("Claim deduped (skipped): %s — %s", claim_type, excerpt[:80])
            continue

        # Link to the transcript as primary source
        db.link_evidence_to_statement(
            evidence_item_id=ev["id"],
            statement_type="source_observation",
            statement_id=transcript_so_id,
            role="observer",
            strength=confidence_f if confidence_f is not None else 0.95,
            comment="Primary source: conversation transcript",
        )
        stats["claims"] += 1
        _log.info("  + [%s] %s (confidence %s)", claim_type, excerpt[:80], confidence_f)

    return stats


# ── Public API ──────────────────────────────────────────────────────

def process_transcripts(
    limit: int = 50,
    role: str = "auditor",
    dry_run: bool = False,
) -> dict:
    """
    Main extraction loop: fetch unprocessed transcript source_observations,
    extract typed claims from each, write them to the semantics schema.

    Returns aggregate stats.
    """
    observations = db.fetch_transcript_observations(limit=limit)
    _log.info("Found %d unprocessed transcript observations", len(observations))

    total = {"observations": len(observations), "claims": 0,
             "errors": 0, "skipped": 0}

    for i, obs in enumerate(observations):
        _log.info("[%d/%d] Processing observation %s (%s)",
                  i + 1, len(observations), obs["id"], obs.get("raw_location", "?"))

        try:
            text = db.read_transcript_text(obs)
            result = _extract_from_transcript(text, obs, role=role, dry_run=dry_run)
            total["claims"] += result.get("claims", 0)
            if result.get("error"):
                total["errors"] += 1
            if result.get("skipped") or result.get("dry_run"):
                total["skipped"] += 1
            else:
                # Mark as processed
                if not dry_run:
                    db.mark_transcript_processed(obs["id"])
        except Exception as e:
            _log.error("Error processing observation %s: %s", obs["id"], e, exc_info=True)
            total["errors"] += 1

    return total
