"""
Auditor database layer — read transcript source_observations, write typed
claims to the semantics schema (evidence_item + statement_evidence).

Built against the verified live schema (2026-08-07): the auditor reads
raw transcript text from `raw_location` files (the semantics tables do not
carry content columns), and writes evidence rows using the six
`claim_extracted` evidence types.
"""

import os
import logging
import psycopg2
import psycopg2.extras
from typing import Optional

_log = logging.getLogger("auditor.db")

# ── Connection ──────────────────────────────────────────────────────

_DSN = os.environ.get(
    "AUDITOR_PG_DSN",
    os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus"),
)


def _connect():
    return psycopg2.connect(_DSN)


# ── Read: transcript source_observations ────────────────────────────

def fetch_transcript_observations(
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """
    Fetch source_observations that are raw conversation transcripts
    (canonical asset kind 'transcript') and have not been processed by the
    Auditor yet. Processed = any active statement_evidence row with
    role 'auditor' tied to the observation.
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
                  AND ca.asset_kind = 'transcript'
                  -- Exclude already-processed observations
                  AND NOT EXISTS (
                    SELECT 1 FROM semantics.statement_evidence se
                    WHERE se.statement_type = 'source_observation'
                      AND se.statement_id = so.id
                      AND se.expired_at IS NULL
                      AND se.role = 'auditor'
                  )
                ORDER BY so.observed_at ASC NULLS LAST, so.id ASC
                LIMIT %s OFFSET %s
                """,
                (limit, offset),
            )
            return [dict(row) for row in cur.fetchall()]


def read_transcript_text(observation: dict, max_chars: int = 8000) -> str:
    """
    Read the transcript text from its raw_location file. Falls back to the
    canonical_key if the file is missing. HTML is stripped to text.
    """
    location = observation.get("raw_location") or ""
    text = ""
    try:
        with open(location, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError as e:
        _log.warning("Cannot read transcript %s at %s: %s",
                     observation.get("id"), location, e)
        text = observation.get("canonical_key") or ""
    if not text:
        return ""
    # Crude HTML strip for chat transcripts
    import re
    text = re.sub(r"<script.*?</script>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<style.*?</style>", " ", text, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def mark_transcript_processed(observation_id: str) -> None:
    """
    Mark a source_observation as processed by the Auditor by linking a marker
    evidence_item to it with role 'auditor' (statement_type must be one of
    the CHECK-enforced values, and evidence_item_id must be a real row).
    """
    item_id = None
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Marker evidence item (llm_extraction type is generic audit evidence)
            marker_type = get_evidence_type_id("llm_extraction")
            cur.execute(
                """
                INSERT INTO semantics.evidence_item
                    (evidence_type_id, excerpt, note, origin, source_observation_id,
                     captured_at, source_hash, verification_state)
                VALUES (%s, %s, %s, 'auditor', %s, NOW(), %s, 'candidate')
                ON CONFLICT DO NOTHING
                RETURNING id
                """,
                (marker_type, f"Auditor processed transcript {observation_id}",
                 "No claims extracted, or marker for completed run", observation_id,
                 observation_id),
            )
            row = cur.fetchone()
            if row:
                item_id = row["id"]
            # If deduped, reuse the existing marker for this observation
            if not item_id:
                cur.execute(
                    """
                    SELECT id FROM semantics.evidence_item
                    WHERE source_observation_id = %s AND origin = 'auditor'
                      AND excerpt = %s AND expired_at IS NULL
                    ORDER BY created_at DESC LIMIT 1
                    """,
                    (observation_id, f"Auditor processed transcript {observation_id}"),
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
                VALUES (%s, 'source_observation', %s, 'auditor', 'processed by Auditor')
                ON CONFLICT (evidence_item_id, statement_type, statement_id, role)
                WHERE expired_at IS NULL
                DO NOTHING
                """,
                (item_id, observation_id),
            )
        conn.commit()


# ── Read: claim evidence types ──────────────────────────────────────

def fetch_claim_evidence_types() -> list[dict]:
    """Fetch the six claim_extracted evidence types (the Auditor's vocabulary)."""
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT id, name, description
                FROM semantics.evidence_type
                WHERE origin_category = 'claim_extracted' AND expired_at IS NULL
                ORDER BY name
                """
            )
            return [dict(row) for row in cur.fetchall()]


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


# ── Write: evidence items and statement_evidence ────────────────────

def create_evidence_item(
    evidence_type_id: str,
    excerpt: Optional[str] = None,
    note: Optional[str] = None,
    origin: str = "claim_extracted",
    source_hash: Optional[str] = None,
    source_observation_id: Optional[str] = None,
    metadata: Optional[dict] = None,
    verification_state: str = "candidate",
) -> dict:
    """
    Create an evidence_item row. Dedup is automatic via the unique partial
    index (evidence_type_id, source_hash, digest(excerpt, 'sha256')) on
    active rows — matching the Auditor role prompt's INSERT pattern.
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
                 source_observation_id, psycopg2.extras.Json(metadata) if metadata else None,
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
    role: str = "observer",
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
