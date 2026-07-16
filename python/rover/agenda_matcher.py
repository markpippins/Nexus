#!/usr/bin/env python3
"""
agenda_matcher.py — IntentRecord → Agenda Matching Engine

When a new intent_record is created by candidate_promote.py, this engine
determines whether it belongs to an existing Agenda or should be skipped.

Matching uses cosine similarity on Ollama embeddings (nomic-embed-text, 768-dim)
with a structural penalty for cross-system matches.

Agenda = deliberation surface. Items accumulate until a human-in-the-loop
reviews them and marks included=true (→ Spec) or included=false (→ rejected).

Usage:
    from agenda_matcher import match_intent_to_agenda, add_item_to_agenda, create_agenda
"""

import json
import logging
import subprocess
import uuid
from datetime import datetime, timezone

import numpy as np

try:
    from embed_util import embed_texts, cosine_similarity_matrix
except ImportError:
    from rover.embed_util import embed_texts, cosine_similarity_matrix
try:
    from event_emitter import emit_agenda_item_added, emit_requirement_promoted_to_plan
except ImportError:
    from rover.event_emitter import emit_agenda_item_added, emit_requirement_promoted_to_plan

log = logging.getLogger("agenda_matcher")

DOCKER_PSQL = ["docker", "exec", "-i", "pgvector_db", "psql", "-U", "pguser", "-d", "nexus", "-q"]

EMBED_MODEL = "nomic-embed-text"
SYSTEM_MISMATCH_PENALTY = 0.15


# ── DB helpers ─────────────────────────────────────────────────────────────

def psql(sql: str, timeout: int = 30) -> tuple[int, str, str]:
    try:
        result = subprocess.run(
            DOCKER_PSQL + ["-t", "-A"],
            input=sql, capture_output=True, text=True, timeout=timeout,
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return 1, "(timeout)", ""


def fetch_intent_record(ir_id: str) -> dict | None:
    """Fetch an intent_record with linked candidate/subsystem info."""
    sql = f"""
        SELECT row_to_json(r)::text FROM (
            SELECT
                ir.id, ir.title, ir.description, ir.tags,
                ir.candidate_id,
                hc.system_id, hc.subsystem_id, hc.feature_id,
                hc.intent_description,
                COALESCE(sys.name, '') AS system_name,
                COALESCE(sub.name, '') AS subsystem_name
            FROM nebula.intent_records ir
            LEFT JOIN nebula.harvest_candidates hc ON hc.id = ir.candidate_id
            LEFT JOIN nebula.systems sys ON sys.id = hc.system_id
            LEFT JOIN nebula.subsystems sub ON sub.id = hc.subsystem_id
            WHERE ir.id = '{ir_id}'
        ) r;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        return None
    try:
        return json.loads(out.splitlines()[0])
    except (json.JSONDecodeError, IndexError):
        return None


def fetch_open_agendas() -> list[dict]:
    """Fetch all non-archived agendas with item counts."""
    sql = """
        SELECT row_to_json(r)::text FROM (
            SELECT
                a.id, a.title, a.status, a.created_at,
                COUNT(ai.id) AS item_count
            FROM nebula.agendas a
            LEFT JOIN nebula.agenda_items ai ON ai.agenda_id = a.id
            WHERE a.status != 'archived'
            GROUP BY a.id
            ORDER BY a.created_at DESC
        ) r;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        return []
    agendas = []
    for line in out.splitlines():
        if not line:
            continue
        try:
            agendas.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return agendas


def fetch_agenda_items(agenda_id: str) -> list[dict]:
    """Fetch all items in an agenda."""
    sql = f"""
        SELECT json_agg(r)::text FROM (
            SELECT
                ai.id, ai.source_type, ai.source_id, ai.title, ai.body,
                ai.decisions, ai.open_questions, ai.supporting_refs,
                ai.included, ai.planner_note, ai.created_at
            FROM nebula.agenda_items ai
            WHERE ai.agenda_id = '{agenda_id}'
            ORDER BY ai.created_at
        ) r;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out or out == "NULL":
        return []
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return []


def fetch_item_system(source_type: str, source_id: str) -> str | None:
    """Fetch system_id from the source record (traverses candidate link for intent_records)."""
    if source_type == "intent_record":
        sql = f"""
            SELECT hc.system_id::text
            FROM nebula.intent_records ir
            JOIN nebula.harvest_candidates hc ON hc.id = ir.candidate_id
            WHERE ir.id = '{source_id}';
        """
    elif source_type == "harvest_candidate":
        sql = f"SELECT system_id::text FROM nebula.harvest_candidates WHERE id = '{source_id}';"
    else:
        return None
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        return None
    return out.strip()


# ── Open agendas cache ─────────────────────────────────────────────────────
_open_agendas_cache: list[dict] | None = None


def _get_open_agendas() -> list[dict]:
    """Fetch open agendas, caching the result for batch operations."""
    global _open_agendas_cache
    if _open_agendas_cache is None:
        _open_agendas_cache = fetch_open_agendas()
    return _open_agendas_cache


def _invalidate_agendas_cache() -> None:
    """Clear the agendas cache so next call re-fetches."""
    global _open_agendas_cache
    _open_agendas_cache = None


# ── Centroid cache ──────────────────────────────────────────────────────────
# Maps agenda_id → (centroid_ndarray, item_count, majority_system).
# Invalidated when items change.
_centroid_cache: dict[str, tuple[np.ndarray, int, str | None]] = {}


def _get_or_compute_centroid(
    agenda_id: str, trust_cache: bool = False
) -> tuple[np.ndarray | None, str | None]:
    """Get cached (centroid, majority_system) or compute from current items.

    When trust_cache=True (batch reclustering), skips the DB verification
    and returns cached centroid directly — the caller guarantees cache validity
    via incremental updates.

    Returns (None, None) for empty agendas or embedding failures.
    """
    if trust_cache:
        cached = _centroid_cache.get(agenda_id)
        if cached is not None:
            return cached[0], cached[2]
        # No cache — this agenda never had items (shouldn't happen in recluster)
        return None, None

    items = fetch_agenda_items(agenda_id)
    if not items:
        _centroid_cache.pop(agenda_id, None)
        return None, None

    item_count = len(items)
    cached = _centroid_cache.get(agenda_id)
    if cached is not None and cached[1] == item_count:
        return cached[0], cached[2]

    # Compute fresh centroid
    item_texts = [_build_item_text(item) for item in items]
    try:
        embeddings = embed_texts(item_texts, model=EMBED_MODEL)
    except Exception as e:
        log.warning("  Embedding failed for agenda %s centroid: %s", agenda_id[:8], e)
        return None, None

    centroid = embeddings.mean(axis=0)

    # Compute majority system (cached alongside centroid to avoid DB queries in hot path)
    system_votes: dict[str, int] = {}
    for item in items:
        item_sys = fetch_item_system(item["source_type"], item["source_id"])
        if item_sys:
            system_votes[item_sys] = system_votes.get(item_sys, 0) + 1
    majority_system = max(system_votes, key=system_votes.get) if system_votes else None

    _centroid_cache[agenda_id] = (centroid, item_count, majority_system)
    return centroid, majority_system


def _invalidate_centroid(agenda_id: str) -> None:
    """Remove cached centroid so next match call recomputes it."""
    _centroid_cache.pop(agenda_id, None)


def _update_centroid_incremental(
    agenda_id: str, new_item_emb: np.ndarray
) -> None:
    """Update cached centroid incrementally (weighted average) for O(1) update.

    Used during batch reclustering to avoid recomputing the entire centroid
    from scratch every time an item is added. Mathematically exact.

    Args:
        agenda_id: The agenda whose centroid to update.
        new_item_emb: Pre-computed embedding for the new item (shape (768,) or (1,768)).
    """
    cached = _centroid_cache.get(agenda_id)
    emb = new_item_emb.squeeze()  # ensure (768,) shape

    if cached is None:
        # First item in a new agenda — initialize the cache
        _centroid_cache[agenda_id] = (emb.copy(), 1, None)
        return

    centroid, count, majority = cached
    centroid_new = (centroid * count + emb) / (count + 1)
    _centroid_cache[agenda_id] = (centroid_new, count + 1, majority)


# ── Similarity (raw centroid comparison, no system penalty) ─────────────────

def _compute_centroid_similarity(
    ir_emb: np.ndarray, centroid: np.ndarray
) -> float:
    """Compute cosine similarity between an intent_record embedding and a centroid."""
    return float(cosine_similarity_matrix(ir_emb, centroid.reshape(1, -1))[0][0])


# ── Text building for embeddings ───────────────────────────────────────────

def _build_ir_text(ir: dict) -> str:
    """Build a rich text representation of an intent_record for embedding."""
    parts = [ir.get("title") or ""]
    desc = ir.get("description") or ir.get("intent_description") or ""
    if desc:
        parts.append(desc)
    system = ir.get("system_name") or ""
    subsystem = ir.get("subsystem_name") or ""
    if system:
        ctx = f"[system: {system}]"
        if subsystem:
            ctx += f" [subsystem: {subsystem}]"
        parts.append(ctx)
    return "\n".join(parts)


def _build_item_text(item: dict) -> str:
    """Build a rich text representation of an agenda item for embedding."""
    parts = [item.get("title") or ""]
    body = item.get("body") or ""
    if body:
        parts.append(body)
    return "\n".join(parts)


# ── Similarity ──────────────────────────────────────────────────────────────

def compute_similarity(ir: dict, agenda_items: list[dict]) -> float:
    """Compute how well an intent_record fits into an existing agenda.

    Uses cosine similarity of Ollama embeddings (nomic-embed-text, 768-dim).
    The new item is compared against the centroid of existing agenda items.

    A system mismatch penalty is applied when the intent_record's system_id
    differs from the majority system of the agenda items.
    """
    if not agenda_items:
        return 0.0

    # Build rich text representations
    ir_text = _build_ir_text(ir)
    item_texts = [_build_item_text(item) for item in agenda_items]

    # Get embeddings for all texts at once (disk-cached)
    all_texts = [ir_text] + item_texts
    try:
        embeddings = embed_texts(all_texts, model=EMBED_MODEL)  # shape: (N+1, 768)
    except Exception as e:
        log.warning("  Embedding failed for agenda similarity: %s", e)
        return 0.0

    ir_emb = embeddings[0:1]       # shape: (1, 768)
    item_embs = embeddings[1:]     # shape: (N, 768)

    # Compute centroid of existing items
    centroid = item_embs.mean(axis=0, keepdims=True)  # shape: (1, 768)

    # Cosine similarity between new item and centroid
    sim = float(cosine_similarity_matrix(ir_emb, centroid)[0][0])

    # ── System mismatch penalty ──
    ir_system = ir.get("system_id")
    if ir_system:
        # Determine majority system of agenda items
        system_votes: dict[str, int] = {}
        for item in agenda_items:
            item_sys = fetch_item_system(item["source_type"], item["source_id"])
            if item_sys:
                system_votes[item_sys] = system_votes.get(item_sys, 0) + 1

        if system_votes:
            majority_system = max(system_votes, key=system_votes.get)
            if ir_system != majority_system:
                sim -= SYSTEM_MISMATCH_PENALTY

    return round(max(0.0, sim), 4)


# ── Match ───────────────────────────────────────────────────────────────────

class AgendaMatch:
    """Result of matching an intent_record against existing agendas."""

    def __init__(
        self,
        agenda_id: str | None = None,
        score: float = 0.0,
        is_new: bool = False,
        skip: bool = False,
    ):
        self.agenda_id = agenda_id
        self.score = score
        self.is_new = is_new
        self.skip = skip

    def __repr__(self):
        if self.skip:
            return f"AgendaMatch(skip=True, best_score={self.score:.3f})"
        if self.is_new:
            return f"AgendaMatch(new=True, score={self.score:.3f})"
        return (
            f"AgendaMatch(agenda_id={self.agenda_id}, "
            f"score={self.score:.3f})"
        )

    def to_dict(self):
        return {
            "agenda_id": self.agenda_id,
            "score": self.score,
            "is_new": self.is_new,
            "skip": self.skip,
        }


def match_intent_to_agenda(
    ir_id: str,
    threshold: float = 0.60,
    allow_new: bool = True,
    precomputed_emb: np.ndarray | None = None,
    skip_fetch: bool = False,
) -> AgendaMatch:
    """Find the best existing agenda for an intent_record.

    Uses embedding-based cosine similarity against each agenda's centroid.
    Centroids are cached and only recomputed when agenda items change.
    A system mismatch penalty of 0.15 is applied when the item's system
    differs from the agenda's majority system (skipped when skip_fetch=True).

    Args:
        ir_id: IntentRecord UUID string
        threshold: Minimum cosine similarity to consider a match (default 0.60).
        allow_new: If False, items that don't match any agenda are skipped.
        precomputed_emb: Pre-computed embedding for this record (shape (1, 768)).
            If provided, skips the per-record embedding call (for batch reclustering).
        skip_fetch: If True, skips fetch_intent_record (no system penalty) and
            uses cached open_agendas. For high-throughput batch reclustering.

    Returns:
        AgendaMatch with one of:
          - matched: agenda_id set, is_new=False, skip=False
          - new: is_new=True, skip=False (only if allow_new=True)
          - skip: skip=True (no match found and allow_new=False)
    """
    if skip_fetch:
        # Fast path: no DB calls for intent_record or open_agendas
        ir_system = None
        open_agendas = _get_open_agendas()
    else:
        ir = fetch_intent_record(ir_id)
        if not ir:
            log.warning("  IntentRecord %s not found, cannot match", ir_id[:8])
            return AgendaMatch(skip=True, score=0.0)
        ir_system = ir.get("system_id")
        open_agendas = fetch_open_agendas()

    if not open_agendas:
        if allow_new:
            log.info("  No open agendas — will create new")
            return AgendaMatch(is_new=True, score=0.0)
        else:
            log.info("  No open agendas — skipping (allow_new=False)")
            return AgendaMatch(skip=True, score=0.0)

    # Embed the new item — use precomputed if provided, else embed now
    if precomputed_emb is not None:
        ir_emb = precomputed_emb
    else:
        ir_text = _build_ir_text(ir)
        try:
            ir_emb = embed_texts([ir_text], model=EMBED_MODEL)[0:1]
        except Exception as e:
            log.warning("  Embedding failed for intent_record: %s", e)
            return AgendaMatch(is_new=True, score=0.0) if allow_new else AgendaMatch(skip=True, score=0.0)

    best = AgendaMatch(skip=True, score=0.0)

    for agenda in open_agendas:
        centroid, majority_system = _get_or_compute_centroid(
            agenda["id"], trust_cache=skip_fetch
        )
        if centroid is None:
            continue

        sim = _compute_centroid_similarity(ir_emb, centroid)

        # ── System mismatch penalty (uses cached majority system, no DB queries) ──
        if ir_system and majority_system and ir_system != majority_system:
            sim -= SYSTEM_MISMATCH_PENALTY

        sim = max(0.0, sim)
        log.debug("  Agenda %s similarity=%.4f (%d items)",
                  agenda["id"][:8], sim, agenda.get("item_count", 0))

        if sim > best.score:
            best = AgendaMatch(agenda_id=agenda["id"], score=round(sim, 4))

    if best.score >= threshold and best.agenda_id:
        log.info("  Matched to agenda %s (score=%.3f)", best.agenda_id[:8], best.score)
        return best
    elif allow_new:
        log.info("  No agenda above threshold (best=%.3f) — creating new", best.score)
        return AgendaMatch(is_new=True, score=best.score)
    else:
        log.info("  No agenda above threshold (best=%.3f) — skipping", best.score)
        return AgendaMatch(skip=True, score=best.score)


# ── Persist ─────────────────────────────────────────────────────────────────

def add_item_to_agenda(
    agenda_id: str,
    ir_id: str,
    ir_title: str | None = None,
    ir_body: str | None = None,
    invalidate_cache: bool = True,
) -> str | None:
    """Add an intent_record as an agenda_item to an existing agenda.

    If ir_title/ir_body are provided, skips fetch_intent_record (fast path for batch).
    Returns the agenda_item UUID or None on failure.
    """
    if ir_title is not None:
        title = ir_title.replace("'", "''")
        body = (ir_body or "").replace("'", "''")
        source_id = ir_id
    else:
        ir = fetch_intent_record(ir_id)
        if not ir:
            return None
        title = (ir.get("title") or "").replace("'", "''")
        body = (ir.get("description") or "").replace("'", "''")
        source_id = ir["id"]

    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    sql = f"""
        INSERT INTO nebula.agenda_items
            (id, agenda_id, source_type, source_id, title, body,
             decisions, open_questions, supporting_refs,
             included, planner_note, created_at, updated_at)
        VALUES
            ('{item_id}'::uuid, '{agenda_id}'::uuid,
             'intent_record', '{source_id}'::uuid,
             '{title}', '{body}',
             '[]'::jsonb, '[]'::jsonb, '[]'::jsonb,
             NULL, NULL,
             '{now}', '{now}')
        RETURNING id;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        details = err[:300] if err else out[:200]
        log.error("  Failed to create agenda_item: %s", details)
        return None

    log.info("  → Agenda item: %s → agenda %s", item_id[:8], agenda_id[:8])

    # Cascade event: agenda.item_added
    try:
        emit_agenda_item_added(
            agenda_id=agenda_id,
            item_id=item_id,
            source_id=source_id,
            source_type="intent_record",
            title=title,
            source="rover.agenda_matcher",
        )
    except Exception as e:
        log.debug("  agenda.item_added emission failed: %s", e)

    # Invalidate cached centroid so next match call recomputes it.
    # Skip when using incremental updates (batch reclustering).
    if invalidate_cache:
        _invalidate_centroid(agenda_id)

    # Refresh source_count on agenda
    psql(f"""
        UPDATE nebula.agendas
        SET source_count = (SELECT COUNT(*) FROM nebula.agenda_items WHERE agenda_id = '{agenda_id}'),
            updated_at = '{now}'
        WHERE id = '{agenda_id}';
    """)

    return item_id


def create_agenda(
    first_ir_id: str,
    ir_title: str | None = None,
    ir_body: str | None = None,
    invalidate_cache: bool = True,
) -> tuple[str | None, str | None]:
    """Create a new agenda with the given intent_record as its first item.

    If ir_title/ir_body are provided, skips fetch_intent_record (fast path for batch).
    Returns (agenda_id, agenda_item_id) or (None, None).
    """
    if ir_title is not None:
        title = ir_title.replace("'", "''")
        scope = (ir_body or "").replace("'", "''")
    else:
        ir = fetch_intent_record(first_ir_id)
        if not ir:
            return None, None
        title = (ir.get("title") or "").replace("'", "''")
        scope = (ir.get("description") or "").replace("'", "''")

    agenda_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    sql = f"""
        INSERT INTO nebula.agendas
            (id, title, scope, status, source_count, metadata, created_at, updated_at)
        VALUES
            ('{agenda_id}'::uuid, '{title}', '{scope}',
             'draft', 1, '{{\"auto_created\": true}}'::jsonb,
             '{now}', '{now}')
        RETURNING id;
    """
    rc, out, err = psql(sql)
    if rc != 0 or not out:
        details = err[:300] if err else out[:200]
        log.error("  Failed to create agenda: %s", details)
        return None, None

    log.info("  → Agenda created: %s", agenda_id[:8])

    # Invalidate open agendas cache so next match call sees the new agenda
    _invalidate_agendas_cache()

    item_id = add_item_to_agenda(agenda_id, first_ir_id,
                                 ir_title=ir_title, ir_body=ir_body,
                                 invalidate_cache=invalidate_cache)
    # add_item_to_agenda already invalidates the centroid
    return agenda_id, item_id


# ── Generic text matching (for assessments, observations, etc.) ────────────

def match_text_to_agenda(
    text: str,
    threshold: float = 0.60,
) -> AgendaMatch:
    """Match arbitrary text against existing open agendas using embeddings.

    This is the generic entry point for non-intent_record sources (e.g.,
    assessments from the NATS assembly_subscriber). Embeds the text and
    compares it against each open agenda's item centroid.

    Args:
        text: Rich text to match (title + body combined).
        threshold: Minimum cosine similarity to consider a match.

    Returns:
        AgendaMatch with agenda_id set if matched, else is_new=True.
        Never returns skip=True (this is a real-time event path that
        always creates an agenda if no match exists).
    """
    if not text or not text.strip():
        return AgendaMatch(is_new=True, score=0.0)

    open_agendas = fetch_open_agendas()
    if not open_agendas:
        log.info("  No open agendas — will create new")
        return AgendaMatch(is_new=True, score=0.0)

    # Embed the incoming text once
    try:
        text_emb = embed_texts([text], model=EMBED_MODEL)[0:1]  # shape: (1, 768)
    except Exception as e:
        log.warning("  Embedding failed for text matching: %s", e)
        return AgendaMatch(is_new=True, score=0.0)

    best = AgendaMatch(is_new=True, score=0.0)

    for agenda in open_agendas:
        centroid, _majority = _get_or_compute_centroid(agenda["id"])
        if centroid is None:
            continue

        sim = _compute_centroid_similarity(text_emb, centroid)

        log.debug("  Agenda %s similarity=%.4f (%d items)",
                  agenda["id"][:8], sim, agenda.get("item_count", 0))

        if sim > best.score:
            best = AgendaMatch(agenda_id=agenda["id"], score=round(sim, 4))

    if best.score >= threshold and best.agenda_id:
        log.info("  Matched to agenda %s (score=%.3f)",
                 best.agenda_id[:8], best.score)
        return best
    else:
        log.info("  No agenda above threshold (best=%.3f) — creating new",
                 best.score)
        return AgendaMatch(is_new=True, score=best.score)


# ── CLI ─────────────────────────────────────────────────────────────────────

def main():
    """CLI entry: match an intent_record to an agenda (for testing)."""
    import argparse

    logging.basicConfig(
        level=logging.DEBUG,
        format="%(asctime)s [%(levelname)s] %(message)s",
        stream=__import__("sys").stderr,
    )

    parser = argparse.ArgumentParser(description="Match intent_record to agenda")
    parser.add_argument("intent_record_id", type=str, help="IntentRecord UUID")
    parser.add_argument("--threshold", type=float, default=0.60, help="Match threshold")
    parser.add_argument("--allow-new", action="store_true", default=False,
                        help="Allow creating a new agenda if no match found")
    parser.add_argument("--dry-run", action="store_true", help="Show match only, no writes")
    args = parser.parse_args()

    match = match_intent_to_agenda(
        args.intent_record_id,
        threshold=args.threshold,
        allow_new=args.allow_new,
    )
    print(json.dumps(match.to_dict(), indent=2))

    if args.dry_run:
        return 0

    if match.skip:
        print("→ Skipping — no matching agenda and allow_new=False")
    elif match.is_new:
        print("→ Creating new agenda...")
        aid, iid = create_agenda(args.intent_record_id)
        print(f"  agenda={aid}  item={iid}")
    elif match.agenda_id:
        print(f"→ Adding to existing agenda {match.agenda_id[:8]}...")
        iid = add_item_to_agenda(match.agenda_id, args.intent_record_id)
        print(f"  item={iid}")

    return 0


if __name__ == "__main__":
    __import__("sys").exit(main())
