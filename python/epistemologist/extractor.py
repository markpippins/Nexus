"""
Epistemologist extractor — LLM-driven concept, relationship, and evidence extraction.

Takes source_observation text, calls the configured LLM with a structured
extraction prompt, parses the JSON response, and writes results to the
semantics schema.
"""

import json
import logging
import sys
from typing import Optional

from tackle.inference import call_llm

from . import db

_log = logging.getLogger("epistemologist.extractor")

# ── Entity type for evidence (must exist in semantics.evidence_type) ──

DEFAULT_EVIDENCE_TYPE = "llm_extraction"

# ── Extraction prompt ───────────────────────────────────────────────

def _build_extraction_prompt(
    observation_text: str,
    concepts: list[dict],
    relationship_types: list[dict],
) -> str:
    """Build the LLM prompt for concept/relationship/evidence extraction."""
    concept_list = "\n".join(
        f"  - {c['name']}: {c.get('description', '')[:120]}" for c in concepts
    )
    rel_type_list = "\n".join(
        f"  - {r['name']}: {r.get('description', '')[:120]}" for r in relationship_types
    )

    return f"""You are the Epistemologist — a knowledge extraction agent.
Analyze the following audit text and extract structured knowledge.

## Seeded Concepts (11 total)
{concept_list}

## Relationship Types (31 total)
{rel_type_list}

## Audit Text
{observation_text[:8000]}

## Instructions
Extract the following into a JSON object:

1. **concepts**: List of concepts mentioned or implied in the text.
   - `name`: Match against seeded concepts above if possible.
   - `is_new`: true only if no seeded concept fits.
   - `description`: Brief description (1 sentence).

2. **relationships**: List of relationships between concepts.
   - `from_concept`: Concept name (source).
   - `to_concept`: Concept name (target).
   - `type`: Relationship type name from the list above (must be an exact match).
   - `confidence`: 0.0-1.0 how confident you are in this relationship.
   - `evidence_excerpt`: The exact text that supports this relationship.

3. **evidence_items**: Supporting evidence for each assertion.
   - `excerpt`: The exact text fragment.
   - `note`: Why this is evidence.

Return ONLY valid JSON — no markdown, no explanation:
{{"concepts": [...], "relationships": [...], "evidence_items": [...]}}
"""


def _extract_from_text(
    text: str,
    observation_id: str,
    *,
    role: str = "epistemologist",
    dry_run: bool = False,
) -> dict:
    """
    Run extraction on a single source_observation's text.

    Returns a summary dict with counts of what was created.
    """
    if not text or len(text.strip()) < 50:
        _log.info("Skipping observation %s: text too short (%d chars)",
                  observation_id, len(text) if text else 0)
        return {"concepts": 0, "relationships": 0, "evidence": 0, "skipped": True}

    # Fetch ontology for prompt context
    concepts = db.fetch_seeded_concepts()
    rel_types = db.fetch_relationship_types()
    evidence_type_id = db.get_evidence_type_id(DEFAULT_EVIDENCE_TYPE)

    if not evidence_type_id:
        _log.warning("Evidence type '%s' not found in semantics.evidence_type", DEFAULT_EVIDENCE_TYPE)

    prompt = _build_extraction_prompt(text, concepts, rel_types)
    system_prompt = (
        "You are the Epistemologist. Extract structured knowledge from audit text. "
        "Return ONLY valid JSON. Match concepts to the seeded ontology when possible. "
        "Use EXACT relationship type names from the provided list."
    )

    if dry_run:
        _log.info("DRY RUN: would extract from observation %s (%d chars)",
                  observation_id, len(text))
        return {"concepts": 0, "relationships": 0, "evidence": 0, "dry_run": True}

    _log.info("Calling LLM for observation %s (%d chars)...", observation_id, len(text))
    response = call_llm(
        prompt,
        role=role,
        system_prompt=system_prompt,
        temperature=0.1,
        max_tokens=4096,
    )

    if response is None:
        _log.error("LLM call failed for observation %s", observation_id)
        return {"concepts": 0, "relationships": 0, "evidence": 0, "error": "LLM call failed"}

    # Parse the JSON response
    try:
        # Strip any markdown code fences
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
        extracted = json.loads(cleaned)
    except json.JSONDecodeError as e:
        _log.error("Failed to parse LLM response for observation %s: %s\nResponse: %s",
                   observation_id, e, response[:500])
        return {"concepts": 0, "relationships": 0, "evidence": 0, "error": f"JSON parse error: {e}"}

    return _persist_extraction(extracted, observation_id, concepts, rel_types, evidence_type_id)


def _persist_extraction(
    extracted: dict,
    observation_id: str,
    seeded_concepts: list[dict],
    rel_types: list[dict],
    evidence_type_id: Optional[str],
) -> dict:
    """Write extracted concepts, relationships, and evidence to the DB."""
    stats = {"concepts": 0, "relationships": 0, "evidence": 0}
    concept_map: dict[str, str] = {}  # name → id

    # Index seeded concepts by lowercase name
    seeded_by_name = {c["name"].lower(): c for c in seeded_concepts}
    # Index relationship types by lowercase name
    rel_by_name = {r["name"].lower(): r for r in rel_types}

    # ── 1. Concepts ────────────────────────────────────────────────
    for c in extracted.get("concepts", []):
        name = (c.get("name") or "").strip()
        if not name:
            continue
        is_new = c.get("is_new", False)
        description = c.get("description", "")

        existing = seeded_by_name.get(name.lower())
        if existing and not is_new:
            concept_map[name] = existing["id"]
        else:
            created = db.create_concept(name, description, is_proposal=is_new)
            concept_map[name] = created["id"]
        stats["concepts"] += 1

    # ── 2. Relationships ──────────────────────────────────────────
    for r in extracted.get("relationships", []):
        from_name = (r.get("from_concept") or "").strip()
        to_name = (r.get("to_concept") or "").strip()
        rel_type_name = (r.get("type") or "").strip().lower()
        confidence = r.get("confidence")
        evidence_excerpt = r.get("evidence_excerpt", "")

        # Map to concept UUIDs
        from_id = concept_map.get(from_name)
        to_id = concept_map.get(to_name)

        # If concepts weren't in the extracted set, try the seeded set
        if not from_id:
            existing = seeded_by_name.get(from_name.lower())
            if existing:
                from_id = existing["id"]
                concept_map[from_name] = from_id
            else:
                created = db.create_concept(from_name, f"Extracted from audit data", is_proposal=True)
                from_id = created["id"]
                concept_map[from_name] = from_id

        if not to_id:
            existing = seeded_by_name.get(to_name.lower())
            if existing:
                to_id = existing["id"]
                concept_map[to_name] = to_id
            else:
                created = db.create_concept(to_name, f"Extracted from audit data", is_proposal=True)
                to_id = created["id"]
                concept_map[to_name] = to_id

        # Resolve relationship type
        rel_type = rel_by_name.get(rel_type_name)
        if not rel_type:
            _log.debug("Skipping relationship: unknown type '%s' (from=%s, to=%s)",
                      rel_type_name, from_name, to_name)
            continue

        rel = db.create_concept_relationship(
            from_concept_id=from_id,
            to_concept_id=to_id,
            relationship_type=rel_type["name"],
            confidence=confidence,
            evidence_note=evidence_excerpt[:500] if evidence_excerpt else None,
        )
        stats["relationships"] += 1

        # ── Attach evidence to the relationship ───────────────────
        if evidence_type_id and evidence_excerpt:
            ev = db.create_evidence_item(
                evidence_type_id=evidence_type_id,
                excerpt=evidence_excerpt[:2000],
                note=f"Evidence for concept_relationship: {from_name} --[{rel_type_name}]--> {to_name}",
                origin="epistemologist",
                source_observation_id=observation_id,
            )
            db.link_evidence_to_statement(
                evidence_item_id=ev["id"],
                statement_type="concept_relationship",
                statement_id=rel["id"],
                role="epistemologist",
                strength=confidence,
                comment=evidence_excerpt[:200],
            )

    # ── 3. Standalone evidence items ──────────────────────────────
    for e in extracted.get("evidence_items", []):
        excerpt = (e.get("excerpt") or "")[:2000]
        note = e.get("note", "")
        if not excerpt:
            continue
        if evidence_type_id:
            ev = db.create_evidence_item(
                evidence_type_id=evidence_type_id,
                excerpt=excerpt,
                note=note or "Extracted evidence from audit data",
                origin="epistemologist",
                source_observation_id=observation_id,
            )
            stats["evidence"] += 1

    return stats


# ── Public API ──────────────────────────────────────────────────────

def process_observations(
    limit: int = 50,
    role: str = "epistemologist",
    dry_run: bool = False,
) -> dict:
    """
    Main extraction loop: fetch unprocessed source_observations and
    extract concepts/relationships/evidence from each.

    Returns aggregate stats.
    """
    observations = db.fetch_source_observations(limit=limit)
    _log.info("Found %d unprocessed source_observations", len(observations))

    total = {"observations": len(observations), "concepts": 0,
             "relationships": 0, "evidence": 0, "errors": 0, "skipped": 0}

    for i, obs in enumerate(observations):
        obs_id = obs["id"]
        # Read actual file content — raw_location is a path, not text
        text = db.read_observation_text(obs)

        _log.info("[%d/%d] Processing observation %s (%s, %d chars)",
                  i + 1, len(observations), obs_id,
                  obs.get("asset_kind", "?"), len(text))

        try:
            result = _extract_from_text(text, obs_id, role=role, dry_run=dry_run)
            total["concepts"] += result.get("concepts", 0)
            total["relationships"] += result.get("relationships", 0)
            total["evidence"] += result.get("evidence", 0)
            if result.get("error"):
                total["errors"] += 1
            if result.get("skipped") or result.get("dry_run"):
                total["skipped"] += 1
            else:
                # Mark as processed
                if not dry_run:
                    db.mark_observation_processed(obs_id)
        except Exception as e:
            _log.error("Error processing observation %s: %s", obs_id, e, exc_info=True)
            total["errors"] += 1

    return total
