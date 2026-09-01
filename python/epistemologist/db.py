"""
Epistemologist database layer — read audit source_observations, write
concepts/relationships to the resolution ontology and evidence to the
semantics schema.

Built against the verified live schema (2026-08-07; ontology writes
repointed at resolution.* on 2026-09-01 after V134 retired the duplicated
semantics ontology tables — see record 716362c7): reads observation text
from `raw_location` files, joins through canonical_asset for kind filtering,
and uses real evidence_item rows for processing markers (FK constraint).
"""

import os
import re
import logging
import psycopg2
import psycopg2.extras
from typing import Optional
from uuid import uuid4

_log = logging.getLogger("epistemologist.db")

# ── Connection ──────────────────────────────────────────────────────

_DSN = os.environ.get(
    "EPISTEMOLOGIST_PG_DSN",
    os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus"),
)

# ── Root for resolving relative raw_location paths ──────────────────
# source_observation.raw_location stores paths relative to the dev
# checkout (e.g. "nexus/audit/CONDUIT_DATA/session_logs/foo.log" or
# "file:///nexus/plans/0136.md"). This file lives at
# <nexus>/python/epistemologist/db.py, so:
#   dirname x1 = python/epistemologist
#   dirname x2 = python
#   dirname x3 = nexus  (NEXUS_ROOT)
#   dirname x4 = dev    (DEV_ROOT)
_NEXUS_ROOT = os.environ.get(
    "NEXUS_ROOT",
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
)
_DEV_ROOT = os.environ.get("DEV_ROOT", os.path.dirname(_NEXUS_ROOT))


def _connect():
    return psycopg2.connect(_DSN)


# ── Read: audit source_observations ─────────────────────────────────

# Asset kinds that contain structured audit/planning data suitable for
# concept/relationship extraction (as opposed to raw transcripts).
_AUDIT_KINDS = ("plan", "implementation_plan", "session_log")


def fetch_source_observations(
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """
    Fetch source_observations that haven't been processed by the Epistemologist
    yet. Joins through asset_revision → canonical_asset to filter by asset_kind.
    """
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT so.id, so.revision_id, so.platform, so.platform_identifier,
                       so.raw_location, so.raw_hash, so.observed_at,
                       ca.id AS canonical_asset_id, ca.canonical_key, ca.asset_kind
                FROM semantics.source_observation so
                JOIN semantics.asset_revision ar
                  ON ar.id = so.revision_id AND ar.expired_at IS NULL
                JOIN semantics.canonical_asset ca
                  ON ca.id = ar.asset_id AND ca.expired_at IS NULL
                WHERE so.expired_at IS NULL
                  AND ca.asset_kind = ANY(%s)
                  -- Exclude already-processed observations
                  AND NOT EXISTS (
                    SELECT 1 FROM semantics.statement_evidence se
                    WHERE se.statement_type = 'source_observation'
                      AND se.statement_id = so.id
                      AND se.expired_at IS NULL
                      AND se.role = 'epistemologist'
                  )
                ORDER BY so.observed_at ASC NULLS LAST, so.id ASC
                LIMIT %s OFFSET %s
                """,
                (list(_AUDIT_KINDS), limit, offset),
            )
            return [dict(row) for row in cur.fetchall()]


def read_observation_text(observation: dict, max_chars: int = 8000) -> str:
    """
    Read the observation text from its raw_location file. Falls back to
    canonical_key (or its JSON representation) if the file is missing.
    HTML is stripped to plain text.
    """
    import json

    # Resolve the canonical key (may be a JSONB dict from Postgres)
    canonical = observation.get("canonical_key")
    if isinstance(canonical, dict):
        canonical_str = json.dumps(canonical)
    elif canonical:
        canonical_str = str(canonical)
    else:
        canonical_str = ""

    location = observation.get("raw_location") or ""
    text = ""

    # Try reading the file if raw_location looks like a real path
    if location and not location.startswith("nebula."):
        # Strip file:// scheme if present
        if location.startswith("file://"):
            location = location[len("file://"):]
        # Resolve relative paths against DEV_ROOT (e.g. "nexus/audit/...")
        # — raw_location is relative to the dev checkout root, not CWD.
        if not os.path.isabs(location):
            candidate = os.path.join(_DEV_ROOT, location)
            if os.path.exists(candidate):
                location = candidate
            else:
                # Fallback: maybe it's relative to the nexus checkout itself
                candidate2 = os.path.join(_NEXUS_ROOT, location)
                if os.path.exists(candidate2):
                    location = candidate2
        try:
            with open(location, "r", encoding="utf-8", errors="replace") as f:
                text = f.read()
        except OSError as e:
            _log.warning("Cannot read observation %s at %s: %s",
                         observation.get("id"), location, e)

    # If file read failed or location was logical, use canonical key as text
    if not text:
        text = canonical_str

    if not text:
        return ""

    # Crude HTML strip
    text = re.sub(r"<script.*?</script>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


# ── Processed marker ────────────────────────────────────────────────

def mark_observation_processed(observation_id: str) -> None:
    """
    Mark a source_observation as processed by the Epistemologist.
    Creates a real evidence_item row first (FK constraint), then links it
    via statement_evidence with role 'epistemologist'.
    """
    item_id = None
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            marker_type = _get_evidence_type_id(cur, "llm_extraction")
            excerpt = f"Epistemologist processed observation {observation_id}"
            cur.execute(
                """
                INSERT INTO semantics.evidence_item
                    (evidence_type_id, excerpt, note, origin, source_observation_id,
                     captured_at, source_hash, verification_state)
                VALUES (%s, %s, %s, 'epistemologist', %s, NOW(), %s, 'candidate')
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (marker_type, excerpt,
                 "Marker for completed Epistemologist run", observation_id,
                 observation_id),
            )
            row = cur.fetchone()
            if row:
                item_id = row["id"]
            if not item_id:
                # Deduped — find the existing marker
                cur.execute(
                    """
                    SELECT id FROM semantics.evidence_item
                    WHERE source_observation_id = %s AND origin = 'epistemologist'
                      AND excerpt = %s AND expired_at IS NULL
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (observation_id, excerpt),
                )
                row = cur.fetchone()
                if row:
                    item_id = row["id"]
        conn.commit()
    if not item_id:
        _log.warning("Could not create marker evidence item for %s", observation_id)
        return
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO semantics.statement_evidence
                    (evidence_item_id, statement_type, statement_id, role, comment)
                VALUES (%s, 'source_observation', %s, 'epistemologist',
                        'processed by Epistemologist')
                ON CONFLICT (evidence_item_id, statement_type, statement_id, role)
                WHERE expired_at IS NULL
                DO NOTHING
                """,
                (item_id, observation_id),
            )
        conn.commit()


# ── Read: seeded concepts and relationship types ────────────────────

def fetch_seeded_concepts() -> list[dict]:
    """Fetch all active (non-expired) concepts from the resolution ontology."""
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, name, description
                FROM resolution.concept
                WHERE expired_at IS NULL
                ORDER BY name
                """
            )
            return [dict(row) for row in cur.fetchall()]


def fetch_relationship_types() -> list[dict]:
    """Fetch all active relationship types from the vocabulary."""
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, name, description
                FROM semantics.relationship_type
                WHERE expired_at IS NULL
                ORDER BY name
                """
            )
            return [dict(row) for row in cur.fetchall()]


# ── Write: concepts ─────────────────────────────────────────────────

def find_concept_by_name(name: str) -> Optional[dict]:
    """Find an existing concept by name (case-insensitive)."""
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, name, description
                FROM resolution.concept
                WHERE LOWER(name) = LOWER(%s) AND expired_at IS NULL
                """,
                (name,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def create_concept(name: str, description: str, is_proposal: bool = False) -> dict:
    """
    Create a new concept. If is_proposal, prefix description to flag it.
    Returns the created row.
    """
    desc = f"[PROPOSED] {description}" if is_proposal else description
    concept_id = str(uuid4())
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO resolution.concept (id, name, description)
                VALUES (%s, %s, %s)
                -- resolution.concept has a plain UNIQUE(name) (no partial
                -- active-row index) — upsert on the name, refresh description.
                ON CONFLICT (name)
                DO UPDATE SET description = EXCLUDED.description
                RETURNING id, name, description
                """,
                (concept_id, name, desc),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {"id": concept_id, "name": name, "description": desc}


# ── Write: concept_relationships ────────────────────────────────────

def create_concept_relationship(
    from_concept_id: str,
    to_concept_id: str,
    relationship_type: str,
    path: Optional[str] = None,
    confidence: Optional[float] = None,
    evidence_note: Optional[str] = None,
) -> dict:
    """Create a concept_relationship row."""
    rel_id = str(uuid4())
    # Build notes from confidence + evidence_note if provided
    notes_parts = []
    if confidence is not None:
        notes_parts.append(f"confidence={confidence}")
    if evidence_note:
        notes_parts.append(evidence_note)
    notes = "; ".join(notes_parts) if notes_parts else None
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO resolution.concept_relationship
                    (id, from_concept_id, to_concept_id, relationship_type,
                     path, notes)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING id, from_concept_id, to_concept_id, relationship_type
                """,
                (rel_id, from_concept_id, to_concept_id, relationship_type,
                 path, notes),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row)


# ── Write: evidence items and statement_evidence ────────────────────

def create_evidence_item(
    evidence_type_id: str,
    excerpt: Optional[str] = None,
    note: Optional[str] = None,
    origin: str = "epistemologist",
    source_hash: Optional[str] = None,
    source_observation_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    verification_state: str = "candidate",
) -> dict:
    """
    Create an evidence_item row. Dedup via the unique partial index
    (evidence_type_id, source_hash, digest(excerpt, 'sha256')) on active rows.
    """
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO semantics.evidence_item
                    (evidence_type_id, excerpt, note, origin, source_hash,
                     source_observation_id, metadata, verification_state,
                     captured_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (evidence_type_id, source_hash, digest(excerpt, 'sha256'))
                WHERE recorded_until_dt = '9999-12-31 23:59:59+00'
                  AND expired_at IS NULL
                DO NOTHING
                RETURNING id
                """,
                (evidence_type_id, excerpt, note, origin, source_hash,
                 source_observation_id,
                 psycopg2.extras.Json(metadata) if metadata else None,
                 verification_state),
            )
            row = cur.fetchone()
        conn.commit()
    if row:
        return dict(row)
    return {"deduped": True, "id": None}


def link_evidence_to_statement(
    evidence_item_id: str,
    statement_type: str,
    statement_id: str,
    role: str = "epistemologist",
    strength: Optional[float] = None,
    comment: Optional[str] = None,
) -> dict:
    """Link an evidence_item to a statement via statement_evidence."""
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO semantics.statement_evidence
                    (evidence_item_id, statement_type, statement_id, role, strength, comment)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (evidence_item_id, statement_type, statement_id, role)
                WHERE expired_at IS NULL
                DO NOTHING
                RETURNING id
                """,
                (evidence_item_id, statement_type, statement_id, role, strength, comment),
            )
            row = cur.fetchone()
        conn.commit()
    if row:
        return dict(row)
    return {"deduped": True, "id": None}


def get_evidence_type_id(type_name: str) -> Optional[str]:
    """Resolve an evidence type name to its UUID."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id FROM semantics.evidence_type
                WHERE LOWER(name) = LOWER(%s) AND expired_at IS NULL
                """,
                (type_name,),
            )
            row = cur.fetchone()
            return row[0] if row else None


# ── Internal helpers ────────────────────────────────────────────────

def _get_evidence_type_id(cur, type_name: str) -> Optional[str]:
    """Resolve an evidence type name within an existing cursor/transaction."""
    cur.execute(
        """
        SELECT id FROM semantics.evidence_type
        WHERE LOWER(name) = LOWER(%s) AND expired_at IS NULL
        """,
        (type_name,),
    )
    row = cur.fetchone()
    return row["id"] if row else None


# ── Write: resolution.proposition + frame + evidence link (T24) ────

# Default execution_backend frame_dimension_value UUIDs (seeded via
# de641f38 shared vocabulary migration).
_EXECUTION_BACKEND_VALUE_IDS: dict[str, str] = {
    "freebuff": "6d03abed-cd17-4623-b723-9d96e900f5f2",
    "ollama": "940ff000-8293-4d92-97fd-a61d048477f4",
    "opencode": "7dc2dab2-49cb-4f88-934f-e0f77704c9e3",
}
_EXECUTION_BACKEND_DIM_ID = None  # resolved lazily


def _get_execution_backend_dim_id(cur) -> Optional[str]:
    """Resolve the execution_backend frame_dimension UUID."""
    global _EXECUTION_BACKEND_DIM_ID
    if _EXECUTION_BACKEND_DIM_ID is None:
        cur.execute(
            """
            SELECT id FROM resolution.frame_dimension
            WHERE name = 'execution_backend'
            """,
        )
        row = cur.fetchone()
        _EXECUTION_BACKEND_DIM_ID = row["id"] if row else None
    return _EXECUTION_BACKEND_DIM_ID


def mint_proposition(
    title: str,
    description: str,
    value: bool = True,
    semantic_type: Optional[str] = None,
    *,
    cur=None,
    conn=None,
) -> dict:
    """Create a resolution.proposition row.

    Returns dict with id + title. Caller owns framing + evidence linking.
    If cur/conn are provided (from an outer transaction), uses them;
    otherwise opens its own connection + commits.
    """
    own_conn = conn is None
    if own_conn:
        conn = _connect()
    try:
        if cur is None:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO resolution.proposition
                (title, description, value, semantic_type_id)
            VALUES (%s, %s, %s,
                    (SELECT id FROM resolution.semantic_type
                     WHERE LOWER(name) = LOWER(%s) LIMIT 1))
            RETURNING id, title, description, value
            """,
            (title, description, value, semantic_type),
        )
        row = cur.fetchone()
        if own_conn:
            conn.commit()
        return dict(row) if row else {}
    finally:
        if own_conn:
            try:
                conn.close()
            except Exception:
                pass


def frame_proposition(
    proposition_id: str,
    dimension_id: str,
    *,
    reference_value_id: Optional[str] = None,
    scalar_value: Optional[str] = None,
    cur=None,
    conn=None,
) -> dict:
    """Link a proposition to a frame_dimension via proposition_frame_value.

    Exactly one of reference_value_id or scalar_value must be provided.
    """
    own_conn = conn is None
    if own_conn:
        conn = _connect()
    try:
        if cur is None:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO resolution.proposition_frame_value
                (proposition_id, dimension_id, reference_value_id, scalar_value)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (proposition_id, dimension_id) DO NOTHING
            RETURNING id
            """,
            (proposition_id, dimension_id, reference_value_id, scalar_value),
        )
        row = cur.fetchone()
        if own_conn:
            conn.commit()
        return dict(row) if row else {"deduped": True}
    finally:
        if own_conn:
            try:
                conn.close()
            except Exception:
                pass


def frame_proposition_for_backend(
    proposition_id: str,
    backend: str = "freebuff",
    *,
    cur=None,
    conn=None,
) -> dict:
    """Frame a proposition against execution_backend=backend.

    Uses the seeded frame_dimension_values from de641f38.
    Falls back to freebuff if backend unknown.
    """
    ref_id = _EXECUTION_BACKEND_VALUE_IDS.get(
        backend, _EXECUTION_BACKEND_VALUE_IDS["freebuff"]
    )
    dim_id = _get_execution_backend_dim_id(cur) if cur else None
    if dim_id is None:
        with _connect() as c:
            with c.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as c2:
                dim_id = _get_execution_backend_dim_id(c2)
    return frame_proposition(
        proposition_id=proposition_id,
        dimension_id=dim_id,
        reference_value_id=ref_id,
        cur=cur,
        conn=conn,
    )


def link_evidence_to_proposition(
    evidence_item_id: str,
    proposition_id: str,
    role: str = "epistemologist",
    strength: Optional[float] = None,
    comment: Optional[str] = None,
    cur=None,
    conn=None,
) -> dict:
    """Link evidence_item → resolution.proposition via statement_evidence.

    Uses statement_type='resolution_proposition' — the V120 trigger
    (trg_statement_evidence_check_statement) validates the proposition exists.
    """
    own_conn = conn is None
    if own_conn:
        conn = _connect()
    try:
        if cur is None:
            cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(
            """
            INSERT INTO semantics.statement_evidence
                (evidence_item_id, statement_type, statement_id, role, strength, comment)
            VALUES (%s, 'resolution_proposition', %s, %s, %s, %s)
            ON CONFLICT (evidence_item_id, statement_type, statement_id, role)
            WHERE expired_at IS NULL
            DO NOTHING
            RETURNING id
            """,
            (evidence_item_id, proposition_id, role, strength, comment),
        )
        row = cur.fetchone()
        if own_conn:
            conn.commit()
        return dict(row) if row else {"deduped": True}
    finally:
        if own_conn:
            try:
                conn.close()
            except Exception:
                pass


def get_frame_dimension_id_by_name(cur, name: str) -> Optional[str]:
    """Resolve a frame_dimension UUID by name within an existing cursor."""
    cur.execute(
        """
        SELECT id FROM resolution.frame_dimension
        WHERE name = %s
        """,
        (name,),
    )
    row = cur.fetchone()
    return row["id"] if row else None
