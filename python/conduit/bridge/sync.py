"""
Conduit → Kernel Bridge — projection consumer for the WRP Kernel Runtime.

Design principle (from BP architectural guidance):
    This is a **projection consumer**, not a query tool.
    It polls PostgreSQL for new receipts, converts them deterministically
    to KernelDeltas, and POSTs them to the kernel API.

Design constraints:
    - Idempotent: re-sending the same receipt batch produces identical state
    - Re-runnable: crash between POST and checkpoint → next poll re-sends
    - Ordering-safe: receipts ordered by (recorded_on_dt ASC, id ASC)
    - Deterministic mapping: same receipts → same KernelDelta every time

Caveat (BP):
    The hard part is semantic mapping correctness, not code size.
    A "receipt" in conduit terms is a state-transition event.
    In kernel terms, it's one entry in a KernelDelta.receipts list.
    The batching unit (one poll cycle = one KernelDelta) must be stable.

Table locations (discovered empirically):
    vision.receipts      — receipt events (source of truth)
    conduit.plans        — plan metadata (enrichment: deps, files_affected)

Cursor column:
    recorded_on_dt (TIMESTAMPTZ) — primary ordering key
    id (TEXT PK)                 — tiebreaker (unique within timestamp)

Usage:
    # One-shot sync (for cron):
    python -c "from bridge.sync import syncer; syncer.sync_once()"

    # Continuous daemon (for dev):
    python -c "from bridge.sync import syncer; syncer.run_daemon(interval=30)"
"""

import json
import logging
import os
import time
from urllib.request import Request, urlopen
from urllib.error import URLError

import psycopg2
import psycopg2.extras

from bridge.checkpoint import Checkpoint

_log = logging.getLogger("bridge.sync")

# ── Defaults ──────────────────────────────────────────────────────────

KERNEL_API_URL = os.environ.get("KERNEL_API_URL", "http://localhost:3103")
POLL_INTERVAL_SECONDS = 30
MAX_RECEIPTS_PER_BATCH = 500

# ── PG query helpers ──────────────────────────────────────────────────

RECEIPT_SCHEMA = "vision"
PLAN_SCHEMA = "conduit"

# Columns we read from vision.receipts — must stay stable
_RECEIPT_COLS = """
    id, plan_id, type, agent_role, session_id,
    summary, metadata_json, ticket_id, tokens_used,
    created_at, recorded_on_dt
"""


def _get_receipts_since(
    conn,
    last_id: str,
    last_recorded_on_dt: str,
    limit: int = MAX_RECEIPTS_PER_BATCH,
) -> list[dict]:
    """Fetch new receipts since checkpoint, ordered by (recorded_on_dt, id).

    Uses composite row-value comparison for ordering safety:
        (recorded_on_dt, id) > (:dt, :id)

    Args:
        conn: psycopg2 connection.
        last_id: Last processed receipt ID (empty = none).
        last_recorded_on_dt: Last processed recorded_on_dt (ISO, empty = none).
        limit: Max rows to fetch.

    Returns:
        List of receipt dicts.
    """
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        if last_id and last_recorded_on_dt:
            cur.execute(
                f"""
                SELECT {_RECEIPT_COLS}
                FROM {RECEIPT_SCHEMA}.receipts
                WHERE (recorded_on_dt, id) > (%s, %s)
                ORDER BY recorded_on_dt ASC, id ASC
                LIMIT %s
                """,
                (last_recorded_on_dt, last_id, limit),
            )
        else:
            # First run — no cursor, start from beginning
            cur.execute(
                f"""
                SELECT {_RECEIPT_COLS}
                FROM {RECEIPT_SCHEMA}.receipts
                ORDER BY recorded_on_dt ASC, id ASC
                LIMIT %s
                """,
                (limit,),
            )
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def _enrich_with_plan_data(conn, plan_ids: set[str]) -> dict[str, dict]:
    """Fetch plan metadata for enrichment.

    Args:
        conn: psycopg2 connection.
        plan_ids: Set of plan IDs to look up.

    Returns:
        Dict mapping plan_id → {dependencies, files_affected}.
    """
    if not plan_ids:
        return {}
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            f"""
            SELECT id, dependencies, files_affected
            FROM {PLAN_SCHEMA}.plans
            WHERE id = ANY(%s)
            """,
            (list(plan_ids),),
        )
        rows = cur.fetchall()
    return {
        r["id"]: {
            "dependencies": r.get("dependencies", "[]"),
            "files_affected": r.get("files_affected", "[]"),
        }
        for r in rows
    }


# ── Semantic mapping (the critical layer per BP) ──────────────────────

def _conduit_receipt_to_kernel_receipt(
    conduit_receipt: dict,
    plan_enrichment: dict | None,
) -> dict:
    """Map a single conduit receipt row to the kernel's internal receipt format.

    This is the **critical semantic mapping** (per BP's guidance).
    Every field maps deterministically. Plan enrichment brings in dependency
    and file data so the kernel graph engine builds proper edges.

    Mapping rules:
        conduit_receipt.id           → kernel_receipt["id"]
        conduit_receipt.plan_id      → kernel_receipt["plan_id"]
        conduit_receipt.type         → kernel_receipt["type"]
        conduit_receipt.agent_role   → kernel_receipt["agent_role"]
        conduit_receipt.metadata_json → kernel_receipt["metadata"]
        plan.dependencies            → kernel_receipt["dependencies"]
        plan.files_affected          → kernel_receipt["files_affected"]

    Args:
        conduit_receipt: Row dict from vision.receipts.
        plan_enrichment: Plan data dict (dependencies/files_affected)
                         or None if plan not found.

    Returns:
        Kernel-compatible receipt dict.
    """
    plan_id = conduit_receipt["plan_id"]

    # Parse enrichment
    deps: list[str] = []
    files: list[str] = []
    if plan_enrichment:
        try:
            deps = json.loads(plan_enrichment.get("dependencies", "[]"))
        except (json.JSONDecodeError, TypeError):
            deps = []
        try:
            files = json.loads(plan_enrichment.get("files_affected", "[]"))
        except (json.JSONDecodeError, TypeError):
            files = []

    # Parse metadata
    metadata: dict = {}
    try:
        metadata = json.loads(conduit_receipt.get("metadata_json", "{}"))
    except (json.JSONDecodeError, TypeError):
        pass

    # Tag the receipt type into metadata for kernel engine access
    metadata["receipt_type"] = conduit_receipt["type"]

    return {
        "id": conduit_receipt["id"],
        "plan_id": plan_id,
        "type": conduit_receipt["type"],
        "agent_role": conduit_receipt["agent_role"],
        "session_id": conduit_receipt.get("session_id"),
        "ticket_id": conduit_receipt.get("ticket_id"),
        "summary": conduit_receipt.get("summary", ""),
        "metadata": metadata,
        "tokens_used": conduit_receipt.get("tokens_used", 0),
        "created_at": conduit_receipt.get("created_at", ""),
        # Enriched from plan table — enables graph edge construction
        "dependencies": deps,
        "files_affected": files,
    }


def _build_kernel_delta(
    batch_id: str,
    kernel_receipts: list[dict],
) -> dict:
    """Build a KernelDelta-compatible JSON payload for the kernel API.

    Args:
        batch_id: Stable identifier for this batch.
        kernel_receipts: Mapped kernel-compatible receipt dicts.

    Returns:
        Dict ready for POST to /delta/.
    """
    affected_plans = list({r["plan_id"] for r in kernel_receipts})
    delta_id = f"bridge-{batch_id}"

    return {
        "delta_id": delta_id,
        "batch_id": batch_id,
        "receipts": kernel_receipts,
        "affected_plans": affected_plans,
        "invalidated_plans": [],
    }


def _post_delta(payload: dict) -> bool:
    """POST a KernelDelta payload to the kernel API.

    Args:
        payload: The KernelDelta JSON payload.

    Returns:
        True if the kernel accepted (success=true), False otherwise.
    """
    url = f"{KERNEL_API_URL}/delta/"
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")

    try:
        with urlopen(req, timeout=30) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            if body.get("success"):
                _log.info("POST /delta/: OK id=%s version=%d plans=%d rcpts=%d",
                          payload["delta_id"],
                          body.get("version", 0),
                          body.get("plan_count", 0),
                          body.get("receipt_count", 0))
                return True
            else:
                _log.warning("POST /delta/: FAILED id=%s error=%s",
                             payload["delta_id"], body.get("error", "unknown"))
                return False
    except URLError as exc:
        _log.error("POST /delta/: connection failed: %s", exc)
        return False


# ── Syncer ────────────────────────────────────────────────────────────

class Syncer:
    """Conduit → Kernel bridge syncer.

    Orchestrates one poll cycle:
        1. Load checkpoint from disk
        2. Query new receipts from vision.receipts
        3. Enrich with plan data from conduit.plans
        4. Map each receipt to kernel format
        5. Build KernelDelta payload
        6. POST to kernel API
        7. Save checkpoint

    Usage:
        s = Syncer()
        s.sync_once()               # one-shot
        s.run_daemon(interval=30)   # continuous
    """

    def __init__(self) -> None:
        self.checkpoint = Checkpoint()
        self._pg_conn = None

    # ── PG connection ──────────────────────────────────────────────

    def _get_pg(self):
        """Lazy-init PG connection from CONDUIT_PG_DSN env var."""
        if self._pg_conn is None or self._pg_conn.closed:
            dsn = os.environ.get("CONDUIT_PG_DSN", "")
            if not dsn:
                raise RuntimeError(
                    "CONDUIT_PG_DSN not set. "
                    "Example: host=localhost port=5432 user=pguser "
                    "password=pgpass dbname=nexus"
                )
            self._pg_conn = psycopg2.connect(dsn)
            _log.debug("Syncer: connected to PG")
        return self._pg_conn

    def close(self) -> None:
        """Close PG connection and checkpoint."""
        if self._pg_conn and not self._pg_conn.closed:
            self._pg_conn.close()
            _log.debug("Syncer: PG connection closed")
        self.checkpoint.close()

    # ── Core sync cycle ────────────────────────────────────────────

    def sync_once(self) -> int:
        """Run one sync cycle.

        Returns:
            Number of receipts synced (0 = nothing new, -1 = API rejected).
        """
        # Step 1: Load checkpoint
        self.checkpoint.load()
        _log.debug("sync_once: checkpoint id=%s dt=%s",
                   self.checkpoint.last_id, self.checkpoint.last_recorded_on_dt)

        # Step 2: Query new receipts from vision.receipts
        conn = self._get_pg()
        receipts = _get_receipts_since(
            conn,
            last_id=self.checkpoint.last_id,
            last_recorded_on_dt=self.checkpoint.last_recorded_on_dt,
        )

        if not receipts:
            _log.debug("sync_once: no new receipts")
            return 0

        _log.info("sync_once: fetched %d receipt(s) since %s",
                  len(receipts),
                  self.checkpoint.last_id or "(beginning)")

        # Step 3: Enrich with plan data (deps, files_affected)
        plan_ids = {r["plan_id"] for r in receipts}
        plan_data = _enrich_with_plan_data(conn, plan_ids)
        _log.debug("sync_once: enriched %d plan(s)", len(plan_data))

        # Step 4: Map each receipt to kernel format
        kernel_receipts = [
            _conduit_receipt_to_kernel_receipt(r, plan_data.get(r["plan_id"]))
            for r in receipts
        ]

        # Step 5: Build KernelDelta payload
        batch_id = (
            f"sync-{receipts[0]['id'][:12]}"
            f"-{receipts[-1]['id'][:12]}"
            f"-{int(time.time())}"
        )
        payload = _build_kernel_delta(batch_id, kernel_receipts)

        # Step 6: POST to kernel API
        success = _post_delta(payload)
        if not success:
            _log.warning("sync_once: kernel APi rejected delta — checkpoint NOT saved")
            return -1

        # Step 7: Save checkpoint with last receipt
        last = receipts[-1]
        # recorded_on_dt comes back as a datetime from psycopg2; serialize to ISO
        dt_str = str(last["recorded_on_dt"])
        self.checkpoint.save(
            receipt_id=last["id"],
            recorded_on_dt=dt_str,
        )

        _log.info("sync_once: synced %d receipt(s) → kernel version=%s",
                  len(receipts), payload.get("delta_id", "?"))
        return len(receipts)

    # ── Daemon mode ────────────────────────────────────────────────

    def run_daemon(self, interval: int = POLL_INTERVAL_SECONDS) -> None:
        """Run sync in a continuous poll loop.

        Args:
            interval: Seconds between poll cycles.
        """
        _log.info("run_daemon: starting (interval=%ds)", interval)
        try:
            while True:
                try:
                    self.sync_once()
                except Exception as exc:
                    _log.error("run_daemon: sync cycle failed: %s", exc)
                time.sleep(interval)
        except KeyboardInterrupt:
            _log.info("run_daemon: shutting down")
        finally:
            self.close()


# ── Module-level convenience ─────────────────────────────────────────

syncer = Syncer()

def sync_once() -> int:
    return syncer.sync_once()

def run_daemon(interval: int = POLL_INTERVAL_SECONDS) -> None:
    syncer.run_daemon(interval)
