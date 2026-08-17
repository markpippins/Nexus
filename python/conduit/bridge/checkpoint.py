"""
Bridge checkpoint — PostgreSQL-backed cursor for receipt polling.

Stores the last-seen receipt (recorded_on_dt, id) in the
``conduit.bridge_checkpoint`` table so the bridge is restartable
and ordering-safe across restarts.  Singleton row (id=1).

Receipts are read from ``nebula.receipts_unified`` (conduit-lineage
``execution.receipts`` UNION frozen ``vision.receipts``; V110/V111). The cursor
uses ``recorded_on_dt`` (TIMESTAMPTZ) as the primary ordering key and
``id`` (TEXT PK) as tiebreaker. Composite PG comparison::

    (recorded_on_dt, id) > (:dt, :id)

Design notes (per BP architectural guidance):
    - The checkpoint MUST survive process restarts.
    - A PG table is the canonical store.  No filesystem involvement
      means the bridge runs without a ``.conduit-data`` directory.
    - The table is self-healing: ``_ensure_table()`` runs on every
      ``load()`` and ``save()`` so it works on fresh databases with
      no manual setup.
"""

import json
import logging
import os

import psycopg2
import psycopg2.extras

_log = logging.getLogger("bridge.checkpoint")

CHECKPOINT_SCHEMA = "conduit"
CHECKPOINT_TABLE = f"{CHECKPOINT_SCHEMA}.bridge_checkpoint"


class Checkpoint:
    """PG-backed cursor for the conduit → kernel receipt bridge."""

    SCHEMA = CHECKPOINT_SCHEMA
    TABLE = CHECKPOINT_TABLE

    def __init__(self) -> None:
        self._conn: psycopg2.extensions.connection | None = None
        self._last_id: str = ""
        self._last_recorded_on_dt: str = ""
        self._dsn = os.environ.get("CONDUIT_PG_DSN", "")
        if not self._dsn:
            raise RuntimeError(
                "CONDUIT_PG_DSN not set. "
                "Example: host=localhost port=5432 user=pguser "
                "password=pgpass dbname=nexus"
            )

    # ── Properties ─────────────────────────────────────────────────────

    @property
    def last_id(self) -> str:
        return self._last_id

    @property
    def last_recorded_on_dt(self) -> str:
        return self._last_recorded_on_dt

    @property
    def exists(self) -> bool:
        """True if a checkpoint has been persisted (non-empty cursor)."""
        if not self._last_id and not self._last_recorded_on_dt:
            # Load from DB to be sure
            self.load()
        return bool(self._last_id and self._last_recorded_on_dt)

    # ── Connection ─────────────────────────────────────────────────────

    def _get_conn(self) -> psycopg2.extensions.connection:
        """Lazy-init PG connection.

        autocommit=True: every statement commits immediately, so the session
        never sits in ``idle in transaction``. PG's
        ``idle_in_transaction_session_timeout`` (30s on this server) would
        otherwise terminate the connection between poll cycles, and the
        ``.closed`` health check cannot detect a server-side kill — the next
        cycle then fails with "server closed the connection unexpectedly".
        """
        if self._conn is None or self._conn.closed:
            self._conn = psycopg2.connect(self._dsn)
            # autocommit via attribute (not connect kwarg — that would be
            # merged into the URI DSN and rejected by libpq)
            self._conn.autocommit = True
            self._ensure_table()
            _log.debug("Checkpoint: connected to PG (autocommit)")
        return self._conn

    def _ensure_table(self) -> None:
        """Create the checkpoint table if it does not exist.

        Singleton design (like circuit_breaker): exactly one row (id=1)
        enforced by CHECK constraint.
        """
        with self._get_conn().cursor() as cur:
            cur.execute(f"""
                CREATE TABLE IF NOT EXISTS {self.TABLE} (
                    id                  INTEGER PRIMARY KEY DEFAULT 1
                                        CHECK(id = 1),
                    last_id             TEXT NOT NULL DEFAULT '',
                    -- TIMESTAMPTZ: conduit-mcp migration (db.ts:2228) converted this
                    -- from TEXT; the '' default was dropped. Keep the bootstrap
                    -- INSERT aligned (real timestamp, not '').
                    last_recorded_on_dt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    last_polled_at      TIMESTAMPTZ,
                    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
                )
            """)
            # Ensure the singleton row exists (cursor semantics: last_id='' means
            # "start from beginning" — sync.py only uses the cursor when both
            # last_id and last_recorded_on_dt are truthy)
            cur.execute(f"""
                INSERT INTO {self.TABLE}
                    (id, last_id, last_recorded_on_dt, last_polled_at, updated_at)
                VALUES (1, '', NOW(), NOW(), NOW())
                ON CONFLICT (id) DO NOTHING
            """)
            self._conn.commit()
            _log.debug("Checkpoint: table %s ensured", self.TABLE)

    def close(self) -> None:
        """Close the PG connection."""
        if self._conn is not None and not self._conn.closed:
            self._conn.close()
            self._conn = None
            _log.debug("Checkpoint: PG connection closed")

    # ── Cursor I/O ─────────────────────────────────────────────────────

    def load(self) -> None:
        """Load checkpoint from PG. No-op if row has empty cursor."""
        conn = self._get_conn()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"SELECT last_id, last_recorded_on_dt FROM {self.TABLE} WHERE id = 1"
            )
            row = cur.fetchone()
            if row:
                self._last_id = row["last_id"] or ""
                self._last_recorded_on_dt = row["last_recorded_on_dt"] or ""
                _log.info(
                    "Checkpoint.load: id=%s dt=%s",
                    self._last_id,
                    self._last_recorded_on_dt,
                )
            else:
                _log.debug("Checkpoint.load: no checkpoint row found")
                self._last_id = ""
                self._last_recorded_on_dt = ""

    def save(self, receipt_id: str, recorded_on_dt: str) -> None:
        """Persist checkpoint after a successful sync cycle.

        Args:
            receipt_id: The last receipt's id in this batch.
            recorded_on_dt: The last receipt's recorded_on_dt timestamp (ISO).
        """
        self._last_id = receipt_id
        self._last_recorded_on_dt = recorded_on_dt
        conn = self._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE {self.TABLE}
                SET last_id = %s,
                    last_recorded_on_dt = %s,
                    last_polled_at = NOW(),
                    updated_at = NOW()
                WHERE id = 1
                """,
                (receipt_id, recorded_on_dt),
            )
            conn.commit()
        _log.info(
            "Checkpoint.save: id=%s dt=%s · PG %s",
            receipt_id,
            recorded_on_dt,
            self.TABLE,
        )

    def reset(self) -> None:
        """Reset checkpoint to empty (resync from beginning)."""
        self._last_id = ""
        self._last_recorded_on_dt = ""
        conn = self._get_conn()
        with conn.cursor() as cur:
            cur.execute(
                f"""
                UPDATE {self.TABLE}
                SET last_id = '',
                    last_recorded_on_dt = NOW(),
                    last_polled_at = NOW(),
                    updated_at = NOW()
                WHERE id = 1
                """
            )
            conn.commit()
        _log.info("Checkpoint.reset: checkpoint cleared in PG")

    def to_dict(self) -> dict:
        """Return current cursor state as a dict (for logging/debug)."""
        return {
            "last_id": self._last_id,
            "last_recorded_on_dt": self._last_recorded_on_dt,
        }
