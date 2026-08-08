"""
Voyager-adapter database layer — writes to semantics.source_observation,
canonical_asset / asset_revision, and asset_identity_claim.
"""

import json
import os
import logging
import psycopg2
import psycopg2.extras
from uuid import uuid4
from datetime import datetime, timezone
from typing import Optional

_log = logging.getLogger("voyager-adapter.db")

_DSN = os.environ.get(
    "VOYAGER_ADAPTER_PG_DSN",
    os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus"),
)


def _connect():
    return psycopg2.connect(_DSN)


# ── source_observation ──────────────────────────────────────────────

def _ensure_asset_revision(
    cur,
    *,
    raw_location: str,
    raw_hash: Optional[str] = None,
    asset_kind: str = "file",
    device_id: Optional[str] = None,
    inode: Optional[str] = None,
) -> str:
    """
    Ensure a canonical_asset + asset_revision pair exists for an observation.
    Creates new rows when no match is found. Returns the revision_id.
    Uses an existing transaction (cur).
    """
    # Look for existing asset by hash
    if raw_hash:
        cur.execute(
            """
            SELECT ar.id FROM semantics.asset_revision ar
            WHERE ar.content_hash = %s AND ar.expired_at IS NULL
            LIMIT 1
            """,
            (raw_hash,),
        )
        row = cur.fetchone()
        if row:
            return row["id"]

    # Build canonical_key with path + optional physical identity
    key_parts = {"path": raw_location}
    if device_id:
        key_parts["device_id"] = device_id
    if inode:
        key_parts["inode"] = inode
    canonical_key_json = json.dumps(key_parts)

    # Create new canonical_asset
    asset_id = str(uuid4())
    canonical_asset_text_id = raw_hash or raw_location
    cur.execute(
        """
        INSERT INTO semantics.canonical_asset (id, canonical_asset_id, canonical_key, asset_kind)
        VALUES (%s, %s, %s::jsonb, %s)
        ON CONFLICT (canonical_asset_id) DO UPDATE SET canonical_key = EXCLUDED.canonical_key
        RETURNING id
        """,
        (asset_id, canonical_asset_text_id, canonical_key_json, asset_kind),
    )
    row = cur.fetchone()
    if row:
        asset_id = row["id"]
    else:
        # ON CONFLICT with no RETURNING (unlikely with DO UPDATE, but defensive)
        cur.execute(
            "SELECT id FROM semantics.canonical_asset WHERE canonical_asset_id = %s",
            (canonical_asset_text_id,),
        )
        asset_id = cur.fetchone()["id"]

    # Create asset_revision
    revision_id = str(uuid4())
    revision_text_id = raw_hash or raw_location
    cur.execute(
        """
        INSERT INTO semantics.asset_revision (id, revision_id, asset_id, content_hash)
        VALUES (%s, %s, %s, %s)
        RETURNING id
        """,
        (revision_id, revision_text_id, asset_id, raw_hash),
    )
    row = cur.fetchone()
    return row["id"] if row else revision_id


def insert_source_observation(
    *,
    platform: str,
    platform_identifier: str,
    raw_location: str,
    raw_hash: Optional[str] = None,
    namespace: Optional[str] = None,
    ingestion_run_id: Optional[str] = None,
    observed_at: Optional[datetime] = None,
    asset_kind: str = "file",
    device_id: Optional[str] = None,
    inode: Optional[str] = None,
) -> dict:
    """Insert a row into semantics.source_observation. Returns the created row."""
    obs_id = str(uuid4())
    now = observed_at or datetime.now(timezone.utc)
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # Ensure asset_revision exists (revision_id is NOT NULL)
            revision_id = _ensure_asset_revision(
                cur,
                raw_location=raw_location,
                raw_hash=raw_hash,
                asset_kind=asset_kind,
                device_id=device_id,
                inode=inode,
            )
            cur.execute(
                """
                INSERT INTO semantics.source_observation
                    (id, revision_id, platform, platform_identifier, raw_location,
                     raw_hash, namespace, ingestion_run_id, observed_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, revision_id, platform, platform_identifier,
                          raw_location, raw_hash, observed_at, ingestion_run_id
                """,
                (obs_id, revision_id, platform, platform_identifier, raw_location,
                 raw_hash, namespace, ingestion_run_id, now),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {}


def update_observation_revision(observation_id: str, revision_id: str) -> None:
    """Re-link a source_observation to a different asset_revision (strong match)."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE semantics.source_observation SET revision_id = %s WHERE id = %s",
                (revision_id, observation_id),
            )
        conn.commit()


# ── canonical_asset lookup ──────────────────────────────────────────

def find_asset_by_hash(content_hash: str) -> Optional[dict]:
    """Look up a canonical_asset by content hash via its latest asset_revision."""
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT ca.id, ca.canonical_key, ca.asset_kind,
                       ar.id AS revision_id, ar.content_hash
                FROM semantics.canonical_asset ca
                JOIN semantics.asset_revision ar
                  ON ar.asset_id = ca.id AND ar.expired_at IS NULL
                WHERE ca.expired_at IS NULL
                  AND ar.content_hash = %s
                ORDER BY ar.created_at DESC
                LIMIT 1
                """,
                (content_hash,),
            )
            row = cur.fetchone()
            return dict(row) if row else None


def find_asset_by_physical_id(device_id: str, inode: str) -> Optional[dict]:
    """Look up a canonical_asset by physical device_id + inode."""
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT ca.id, ca.canonical_key, ca.asset_kind
                FROM semantics.canonical_asset ca
                WHERE ca.expired_at IS NULL
                  AND ca.canonical_key ->> 'device_id' = %s
                  AND ca.canonical_key ->> 'inode' = %s
                LIMIT 1
                """,
                (device_id, inode),
            )
            row = cur.fetchone()
            return dict(row) if row else None


# ── asset_identity_claim ────────────────────────────────────────────

def insert_identity_claim(
    *,
    asset_id: Optional[str],
    candidate_asset_id: Optional[str],
    claim_type: str,
    confidence: float,
    basis: str,
) -> dict:
    """Create an asset_identity_claim with the given confidence and basis."""
    claim_id = str(uuid4())
    with _connect() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO semantics.asset_identity_claim
                    (id, asset_id, candidate_asset_id, claim_type, confidence,
                     basis, status, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, 'proposed', NOW())
                RETURNING id, asset_id, candidate_asset_id, claim_type, confidence, status
                """,
                (claim_id, asset_id, candidate_asset_id, claim_type, confidence, basis),
            )
            row = cur.fetchone()
        conn.commit()
    return dict(row) if row else {}
