import sqlite3
import json
import os
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta

# ── v079: Ticket lifecycle constants ─────────────────────────────
DEFAULT_TICKET_TTL_HOURS = 24  # tickets expire after 24h of inactivity
DEFAULT_STALE_SECONDS = 3600 * 6  # claimed tickets become stale after 6h idle


class DBAdapter:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        """Ensure the manager-owned tables exist.

        MCP-owned tables (plans, receipts, tickets, sessions,
        circuit_breaker) are NOT created here — the MCP server is the
        sole schema authority for those.  If they're missing, fail fast
        with a clear message so the operator knows to start MCP first.
        """
        with self._get_connection() as conn:
            # ── Manager-owned tables ────────────────────────────
            conn.execute("""
                CREATE TABLE IF NOT EXISTS work_requests (
                    id TEXT PRIMARY KEY,
                    plan_id TEXT REFERENCES plans(id),
                    status TEXT NOT NULL,
                    dco_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS pipeline_cursor (
                    role TEXT PRIMARY KEY,
                    last_processed_plan_id TEXT,
                    last_work_request_id TEXT,
                    updated_at TEXT NOT NULL
                )
            """)

            # ── Fail fast if MCP-owned tables are missing ───────
            for table in ("plans", "receipts", "tickets", "sessions", "circuit_breaker"):
                exists = conn.execute(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name=?",
                    (table,),
                ).fetchone()[0]
                if not exists:
                    raise RuntimeError(
                        f"Table '{table}' not found in {self.db_path}. "
                        f"Start the MCP server first to initialize the database schema."
                    )

            # ── Verify critical columns on MCP-owned tables ─────
            # These columns are added by MCP migrations (v078+).
            # If missing, the MCP server hasn't completed migrations.
            required_columns = {
                "receipts": ["ticket_id", "tokens_used"],
                "tickets": ["objective", "owner", "spawn_reason"],
                "circuit_breaker": ["paused"],
                "sessions": ["cost_usd"],
            }
            for table, cols in required_columns.items():
                existing = {
                    r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()
                }
                missing = [c for c in cols if c not in existing]
                if missing:
                    raise RuntimeError(
                        f"Columns {missing} missing from '{table}' in {self.db_path}. "
                        f"The MCP server may need to run pending migrations."
                    )

            conn.commit()

    # ── Tickets (v078) ────────────────────────────────────────────

    def create_ticket_if_missing(
        self, plan_id: str, role: str, created_by_receipt: str, created_at: str,
        objective: str = "", completion_criteria: str = "",
        owner: str = "", parent_ticket_id: Optional[str] = None,
        spawn_reason: str = "", replacement_of: Optional[str] = None,
    ) -> Optional[str]:
        """Create an open Ticket with constraint fields (v079).  Idempotent via partial unique index.

        If the deterministic ID already exists AND there is no open ticket for
        the (plan_id, role) pair, a new ticket with a unique ID is created
        instead of failing silently.  This handles restart scenarios where old
        tickets are in terminal states (completed, failed, etc.) and the caller
        needs fresh authorization.
        """
        ticket_id = f"ticket-{plan_id}-{role}-{created_by_receipt}"
        expires_at = (datetime.fromisoformat(created_at.replace("Z", "")) + timedelta(hours=DEFAULT_TICKET_TTL_HOURS)).isoformat() + "Z"
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                INSERT OR IGNORE INTO tickets
                    (id, plan_id, role, status, created_by_receipt, created_at,
                     objective, completion_criteria, owner, parent_ticket_id,
                     spawn_reason, last_activity, expires_at, replacement_of)
                VALUES (?, ?, ?, 'open', ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?)
                """,
                (ticket_id, plan_id, role, created_by_receipt, created_at,
                 objective or "", completion_criteria or "", owner or role,
                 parent_ticket_id, spawn_reason or "", created_at, expires_at,
                 replacement_of),
            )
            conn.commit()
            if cursor.rowcount > 0:
                return ticket_id

            # Deterministic ID already exists.  If there's an open ticket use it.
            row = conn.execute(
                "SELECT id FROM tickets WHERE plan_id=? AND role=? AND status='open'",
                (plan_id, role),
            ).fetchone()
            if row:
                return row[0]

            # No open ticket exists — create a new one with a unique ID.
            ts = int(datetime.utcnow().timestamp())
            ticket_id = f"ticket-{plan_id}-{role}-{ts}"
            cursor2 = conn.execute(
                """
                INSERT OR IGNORE INTO tickets
                    (id, plan_id, role, status, created_by_receipt, created_at,
                     objective, completion_criteria, owner, parent_ticket_id,
                     spawn_reason, last_activity, expires_at, replacement_of)
                VALUES (?, ?, ?, 'open', ?, ?,
                        ?, ?, ?, ?,
                        ?, ?, ?, ?)
                """,
                (ticket_id, plan_id, role, created_by_receipt, created_at,
                 objective or "", completion_criteria or "", owner or role,
                 parent_ticket_id, spawn_reason or "", created_at, expires_at,
                 replacement_of),
            )
            conn.commit()
            if cursor2.rowcount > 0:
                return ticket_id
            return None

    def claim_ticket(self, plan_id: str, role: str, session_id: str) -> Optional[str]:
        """Atomically claim an open Ticket.  Returns the ticket_id on success, None if already claimed.
        v079: sets last_activity on claim."""
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT id FROM tickets WHERE plan_id=? AND role=? AND status='open'",
                (plan_id, role),
            ).fetchone()
            if not row:
                return None
            ticket_id = row[0]
            cursor = conn.execute(
                """
                UPDATE tickets SET
                    status = 'claimed', session_id = ?, claimed_at = ?,
                    last_activity = ?
                WHERE id = ? AND status = 'open'
                """,
                (session_id, now, now, ticket_id),
            )
            conn.commit()
            return ticket_id if cursor.rowcount > 0 else None

    def close_ticket(
        self, plan_id: str, role: str, session_id: str, terminal_status: str = "completed"
    ) -> bool:
        """Close a claimed Ticket into a terminal state.  v079: sets last_activity."""
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE tickets SET
                    status = ?, closed_at = ?, last_activity = ?
                WHERE plan_id=? AND role=? AND session_id=? AND status='claimed'
                """,
                (terminal_status, now, now, plan_id, role, session_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    def release_ticket(self, plan_id: str, role: str, session_id: str) -> bool:
        """Release a claimed Ticket back to 'open'.  v079: sets last_activity."""
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE tickets SET
                    status = 'open', session_id = NULL, claimed_at = NULL,
                    last_activity = ?
                WHERE plan_id=? AND role=? AND session_id=? AND status='claimed'
                """,
                (now, plan_id, role, session_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    def abandon_ticket(self, plan_id: str, role: str, session_id: str) -> bool:
        """Mark a claimed Ticket as abandoned.  v079: sets last_activity."""
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE tickets SET
                    status = 'abandoned', closed_at = ?, last_activity = ?
                WHERE plan_id=? AND role=? AND session_id=? AND status='claimed'
                """,
                (now, now, plan_id, role, session_id),
            )
            conn.commit()
            return cursor.rowcount > 0

    def release_session_tickets(self, session_id: str) -> int:
        """Release all Tickets claimed by *session_id* back to 'open'.  v079: sets last_activity."""
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE tickets SET
                    status = 'open', session_id = NULL, claimed_at = NULL,
                    last_activity = ?
                WHERE session_id = ? AND status = 'claimed'
                """,
                (now, session_id),
            )
            conn.commit()
            return cursor.rowcount

    # ── Invariant 5: next-Ticket creation (v079) ─────────────────
    # Tickets own the authorization chain.  When a Ticket reaches a
    # terminal state, this function creates the next Ticket(s).  Each
    # child Ticket inherits parent_ticket_id and spawn_reason for
    # auditable lineage (Constraint 5).

    def create_next_tickets(
        self, plan_id: str, ticket_role: str, terminal_status: str,
        parent_ticket_id: str = "", objective: str = "",
        completion_criteria: str = "", owner: str = "",
    ) -> int:
        """After a Ticket reaches a terminal state, spawn the next Ticket(s).

        Determistic mapping:
          builder completed  → reviewer
          builder failed     → (nothing — plan blocked)
          reviewer completed → (nothing — terminal REVIEW_PASS)
          reviewer failed    → builder (re-implementation)
          planner completed  → builder + critic
          critic completed   → builder

        Guard: if the plan's derived_status is already terminal (REVIEW_PASS,
        BLOCK, PLAN_BLOCK), no new tickets are spawned regardless of role
        transition.  This prevents late-arriving ticket completions (e.g.
        critic finishing after the plan was already REVIEW_PASS) from
        dispatching unnecessary work.
        """
        # ── Guard: skip if plan's latest receipt is terminal ──
        # Check the LATEST receipt (by created_at) rather than any
        # receipt in history.  A subsequent IMPLEMENTATION overrides
        # a previous BLOCK, so the plan is not terminal if the latest
        # receipt is IMPLEMENTATION.
        with self._get_connection() as conn:
            latest = conn.execute(
                """
                SELECT type FROM receipts
                WHERE plan_id = ?
                ORDER BY created_at DESC LIMIT 1
                """,
                (plan_id,),
            ).fetchone()
            if latest and latest[0] in ('REVIEW_PASS', 'BLOCK', 'PLAN_BLOCK'):
                print(f"  Guard: plan {plan_id} latest receipt is {latest[0]} — skipping ticket creation for {ticket_role} {terminal_status}.")
                return 0

        next_roles: list[str] = []

        if terminal_status == "completed":
            if ticket_role == "builder":
                next_roles = ["reviewer"]
            elif ticket_role == "planner":
                next_roles = ["builder", "critic"]
            elif ticket_role == "critic":
                next_roles = ["builder"]
        elif terminal_status == "failed":
            if ticket_role == "reviewer":
                next_roles = ["builder"]
            elif ticket_role == "planner":
                next_roles = ["planner"]

        if not next_roles:
            return 0

        now = datetime.utcnow().isoformat() + "Z"
        expires_at = (datetime.utcnow() + timedelta(hours=DEFAULT_TICKET_TTL_HOURS)).isoformat() + "Z"
        count = 0
        with self._get_connection() as conn:
            for role in next_roles:
                ticket_id = f"ticket-{plan_id}-{role}-{int(datetime.utcnow().timestamp())}"
                spawn_reason = f"{ticket_role} {terminal_status} → {role}"
                cursor = conn.execute(
                    """
                    INSERT OR IGNORE INTO tickets
                        (id, plan_id, role, status, created_at,
                         objective, completion_criteria, owner,
                         parent_ticket_id, spawn_reason,
                         last_activity, expires_at)
                    VALUES (?, ?, ?, 'open', ?,
                            ?, ?, ?,
                            ?, ?,
                            ?, ?)
                    """,
                    (ticket_id, plan_id, role, now,
                     objective or "", completion_criteria or "", owner or role,
                     parent_ticket_id or "", spawn_reason,
                     now, expires_at),
                )
                if cursor.rowcount > 0:
                    count += 1
            conn.commit()
        return count

    # ── Eligibility (v079 — ticket-driven, excludes stale/expired) ──

    def get_eligible_plans(self, role: str) -> List[Dict[str, Any]]:
        """Query plans that have an open, non-stale, non-expired Ticket for the given role."""
        # v079: status = 'open' already excludes stale/expired — no need to double-filter
        if role == "reviewer":
            query = """
                SELECT ps.* FROM plan_status ps
                JOIN tickets t ON t.plan_id = ps.id
                WHERE t.role = 'reviewer' AND t.status = 'open'
                AND datetime(substr(t.created_at, 1, 19))
                    <= datetime('now', '-60 seconds')
                ORDER BY ps.created_at ASC
            """
        else:
            query = """
                SELECT ps.* FROM plan_status ps
                JOIN tickets t ON t.plan_id = ps.id
                WHERE t.role = ? AND t.status = 'open'
                ORDER BY ps.created_at ASC
            """

        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            if role == "reviewer":
                rows = conn.execute(query).fetchall()
            else:
                rows = conn.execute(query, (role,)).fetchall()
            return [dict(row) for row in rows]

    def get_blocked_plans(self) -> List[Dict[str, Any]]:
        """Query plans that are currently blocked."""
        query = "SELECT * FROM plan_status WHERE derived_status = 'BLOCK'"
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(query).fetchall()
            return [dict(row) for row in rows]

    def is_circuit_breaker_tripped(self) -> bool:
        query = "SELECT tripped FROM circuit_breaker WHERE id = 1"
        try:
            with self._get_connection() as conn:
                row = conn.execute(query).fetchone()
                return bool(row[0]) if row else False
        except:
            return False

    def is_conduit_paused(self) -> bool:
        query = "SELECT paused FROM circuit_breaker WHERE id = 1"
        try:
            with self._get_connection() as conn:
                row = conn.execute(query).fetchone()
                return bool(row[0]) if row else False
        except:
            return False

    def get_last_session_activity(self, session_id: str) -> Optional[str]:
        query = "SELECT last_activity FROM sessions WHERE id = ?"
        with self._get_connection() as conn:
            row = conn.execute(query, (session_id,)).fetchone()
            return row[0] if row else None

    def update_session_activity(self, session_id: str, pid: Optional[int] = None):
        now = datetime.utcnow().isoformat() + "Z"
        query = "UPDATE sessions SET last_activity = ?"
        params = [now]
        if pid is not None:
            query += ", pid = ?"
            params.append(pid)
        query += " WHERE id = ?"
        params.append(session_id)
        with self._get_connection() as conn:
            conn.execute(query, tuple(params))
            conn.commit()

    def add_session_work_time(self, session_id: str, work_seconds: float) -> None:
        """Accumulate actual execution time on a session.

        Only counts time spent running subprocesses, not waiting/retry sleeps.
        The watchdog uses total_work_seconds to determine staleness.
        """
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE sessions SET total_work_seconds = COALESCE(total_work_seconds, 0) + ? WHERE id = ?",
                (work_seconds, session_id),
            )
            conn.commit()

    # ── Receipts (v078 — ticket_id required) ─────────────────────

    def insert_receipt(
        self,
        plan_id: str,
        receipt_type: str,
        agent_role: str,
        session_id: str,
        ticket_id: str,
        summary: str = "",
        artifact_path: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        tokens_used: int = 0,
    ):
        """Insert a receipt linked to exactly one Ticket (Invariant 2)."""
        now = datetime.utcnow().isoformat() + "Z"
        receipt_id = f"rec-{plan_id}-{receipt_type}-{uuid.uuid4().hex[:8]}"
        meta_json = json.dumps(metadata or {})
        query = """
            INSERT INTO receipts (id, plan_id, type, agent_role, session_id,
                ticket_id, summary, artifact_path, metadata_json, tokens_used, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        with self._get_connection() as conn:
            conn.execute(query, (
                receipt_id, plan_id, receipt_type, agent_role, session_id,
                ticket_id, summary, artifact_path, meta_json, tokens_used, now,
            ))
            conn.execute("UPDATE plans SET updated_at = ? WHERE id = ?", (now, plan_id))
            conn.commit()

    def add_work_request(self, wr_id: str, plan_id: str, dco_json: str):
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO work_requests (id, plan_id, status, dco_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                (wr_id, plan_id, 'pending', dco_json, now, now),
            )
            conn.commit()

    def update_work_request_status(self, wr_id: str, status: str):
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            conn.execute("UPDATE work_requests SET status = ?, updated_at = ? WHERE id = ?", (status, now, wr_id))
            conn.commit()

    def get_active_session(self, agent_role: str) -> Optional[Dict[str, Any]]:
        query = "SELECT * FROM sessions WHERE agent_role = ? AND is_running = 1 LIMIT 1"
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(query, (agent_role,)).fetchone()
            return dict(row) if row else None

    def get_all_active_sessions(self) -> List[Dict[str, Any]]:
        query = "SELECT * FROM sessions WHERE is_running = 1 ORDER BY start_iso ASC"
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(query).fetchall()
            return [dict(row) for row in rows]

    def trip_circuit_breaker(
        self, error: str, detail: str = "", source: str = "orchestrator", retry_after: int = 1800,
    ) -> None:
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            conn.execute(
                """
                UPDATE circuit_breaker SET tripped=1, tripped_at=?, retry_after=?,
                    error=?, detail=?, source=?, updated_at=?
                WHERE id=1
                """,
                (now, retry_after, error, detail, source, now),
            )
            conn.commit()

    def set_conduit_paused(self, paused: bool) -> None:
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            conn.execute("UPDATE circuit_breaker SET paused=?, updated_at=? WHERE id=1", (1 if paused else 0, now))
            conn.commit()

    def delete_receipt(self, plan_id: str, receipt_type: str, session_id: str) -> bool:
        with self._get_connection() as conn:
            cursor = conn.execute("DELETE FROM receipts WHERE plan_id=? AND type=? AND session_id=?", (plan_id, receipt_type, session_id))
            conn.commit()
            return cursor.rowcount > 0

    def get_plan_by_id(self, plan_id: str) -> Optional[Dict[str, Any]]:
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
            return dict(row) if row else None

    def create_session(self, session_id: str, agent_role: str, plan_ids: List[str], pid: Optional[int] = None):
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            conn.execute(
                "INSERT INTO sessions (id, agent_role, start_iso, plans_processed, plan_count, is_running, created_at, last_activity, pid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (session_id, agent_role, now, json.dumps(plan_ids), len(plan_ids), 1, now, now, pid),
            )
            conn.commit()

    def close_session(self, session_id: str, exit_code: int):
        """Close a session.  Caller must release Tickets before calling."""
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE sessions SET end_iso=?, is_running=0, exit_code=?, last_activity=? WHERE id=?",
                (now, exit_code, now, session_id),
            )
            conn.commit()

    # ── v079: Stale / expired detection ──────────────────────────

    def increment_ticket_tokens(self, ticket_id: str, tokens: int) -> None:
        """Accumulate tokens_used on a Ticket after work completes."""
        with self._get_connection() as conn:
            conn.execute(
                "UPDATE tickets SET tokens_used = COALESCE(tokens_used, 0) + ? WHERE id = ?",
                (tokens, ticket_id),
            )
            conn.commit()

    def detect_stale_tickets(self) -> int:
        """Mark claimed Tickets with no recent activity as 'stale'.

        Constraint 3+7: Tickets that sit idle in 'claimed' state become
        stale, forcing reauthorization.  A stale Ticket is not eligible
        for dispatch until explicitly reset.
        """
        now = datetime.utcnow().isoformat() + "Z"
        threshold = (datetime.utcnow() - timedelta(seconds=DEFAULT_STALE_SECONDS)).isoformat() + "Z"
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE tickets SET status = 'stale'
                WHERE status = 'claimed'
                AND last_activity IS NOT NULL
                AND last_activity < ?
                """,
                (threshold,),
            )
            conn.commit()
            return cursor.rowcount

    def detect_expired_tickets(self) -> int:
        """Mark open/claimed/stale Tickets past their expiration as 'expired'.

        Constraint 3: Expired Tickets require explicit reauthorization.
        Only open/claimed/stale tickets can expire — terminal states
        (completed/failed/abandoned) are already closed.
        """
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE tickets SET status = 'expired'
                WHERE status IN ('open', 'claimed', 'stale')
                AND expires_at IS NOT NULL
                AND expires_at < ?
                """,
                (now,),
            )
            conn.commit()
            return cursor.rowcount

    # ── v080: Supersede / cancel ticket actions ─────────────────

    def supersede_ticket(self, ticket_id: str, reason: str = "") -> Dict[str, Any]:
        """Supersede a ticket — mark it as 'superseded' (terminal).

        Only open/claimed/stale tickets can be superseded.
        v080: writes closure reason to dedicated closure_reason column.
        v081: returns old ticket data for optional replacement logic.
        Returns dict with 'superseded' bool and optionally 'old_ticket' data.
        """
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            old = conn.execute(
                "SELECT plan_id, role, objective, owner FROM tickets WHERE id = ? AND status IN ('open', 'claimed', 'stale')",
                (ticket_id,),
            ).fetchone()
            if not old:
                return {"superseded": False}

            conn.execute(
                """
                UPDATE tickets SET
                    status = 'superseded', closed_at = ?, last_activity = ?,
                    closure_reason = ?
                WHERE id = ?
                AND status IN ('open', 'claimed', 'stale')
                """,
                (now, now, reason or "superseded", ticket_id),
            )
            conn.commit()
            return {
                "superseded": True,
                "old_ticket": {
                    "plan_id": old[0],
                    "role": old[1],
                    "objective": old[2],
                    "owner": old[3] or "",  # v081: fallback handled at creation site
                },
            }

    def cancel_ticket(self, ticket_id: str, reason: str = "") -> int:
        """Cancel a ticket — explicit denial of authorization (terminal).

        Only open/claimed/stale tickets can be cancelled.
        v080: writes closure reason to dedicated closure_reason column.
        Returns the number of tickets cancelled (0 or 1).
        """
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            cursor = conn.execute(
                """
                UPDATE tickets SET
                    status = 'cancelled', closed_at = ?, last_activity = ?,
                    closure_reason = ?
                WHERE id = ?
                AND status IN ('open', 'claimed', 'stale')
                """,
                (now, now, reason or "cancelled", ticket_id),
            )
            conn.commit()
            return cursor.rowcount

    # ── v080: Token consumption reporting ───────────────────────

    def get_token_usage_by_plan(self, plan_id: str) -> Dict[str, Any]:
        """Aggregate token consumption for a plan from its receipts."""
        with self._get_connection() as conn:
            row = conn.execute(
                """
                SELECT COALESCE(SUM(tokens_used), 0) as total_tokens, COUNT(*) as receipts
                FROM receipts WHERE plan_id = ?
                """,
                (plan_id,),
            ).fetchone()
            return {
                "plan_id": plan_id,
                "total_tokens": row[0] if row else 0,
                "receipts": row[1] if row else 0,
            }

    def get_token_usage_by_role(self, role: str) -> Dict[str, Any]:
        """Aggregate token consumption for all work by a given agent role."""
        with self._get_connection() as conn:
            row = conn.execute(
                """
                SELECT COALESCE(SUM(tokens_used), 0) as total_tokens, COUNT(*) as receipts
                FROM receipts WHERE agent_role = ?
                """,
                (role,),
            ).fetchone()
            return {
                "role": role,
                "total_tokens": row[0] if row else 0,
                "receipts": row[1] if row else 0,
            }

    def get_token_usage_by_ticket(self, ticket_id: str) -> Dict[str, Any]:
        """Query token consumption from the tickets.tokens_used column (per-objective view)."""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT COALESCE(tokens_used, 0) FROM tickets WHERE id = ?",
                (ticket_id,),
            ).fetchone()
            return {
                "ticket_id": ticket_id,
                "tokens_used": row[0] if row else 0,
            }

    def get_ticket_lineage(self, plan_id: str) -> List[Dict[str, Any]]:
        """Return the full ticket lineage chain for a plan.

        Each row includes id, role, status, tokens_used, parent_ticket_id,
        spawn_reason, replacement_of, and closure_reason — enough to
        reconstruct the full parent→child→replacement audit trail.
        """
        with self._get_connection() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT id, role, status, tokens_used,
                       parent_ticket_id, spawn_reason,
                       replacement_of, closure_reason,
                       created_at, closed_at
                FROM tickets WHERE plan_id = ?
                ORDER BY created_at ASC
                """,
                (plan_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    # ── Cursor ────────────────────────────────────────────────────

    def get_cursor(self, role: str) -> Optional[str]:
        with self._get_connection() as conn:
            row = conn.execute("SELECT last_processed_plan_id FROM pipeline_cursor WHERE role=?", (role,)).fetchone()
            return row[0] if row else None

    def advance_cursor(self, role: str, plan_id: str, wr_id: str):
        now = datetime.utcnow().isoformat() + "Z"
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO pipeline_cursor (role, last_processed_plan_id, last_work_request_id, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(role) DO UPDATE SET
                    last_processed_plan_id=excluded.last_processed_plan_id,
                    last_work_request_id=excluded.last_work_request_id,
                    updated_at=excluded.updated_at
                """,
                (role, plan_id, wr_id, now),
            )
            conn.commit()

    def get_role_model_config(self, role: str) -> Optional[Dict[str, str]]:
        """Resolve the harness + model for a role from the AI config tables.

        Returns a dict with 'harness' (binary short name) and 'model'
        (model_identifier), or None if the role has no config or the
        tables are empty.

        The harness binary is extracted from invocation_semantics JSON
        so it maps to the short names used by resolve_executor():
          "opencode", "ollama", "codex"
        """
        with self._get_connection() as conn:
            row = conn.execute(
                """
                SELECT h.invocation_semantics, m.model_identifier
                FROM ai_role_config rc
                JOIN ai_harnesses h ON rc.harness_id = h.id
                JOIN ai_models m ON rc.model_id = m.id
                WHERE rc.role = ?
                """,
                (role,),
            ).fetchone()
            if not row:
                return None
            semantics_str, model_id = row
            try:
                semantics = json.loads(semantics_str or '{}')
            except json.JSONDecodeError:
                return None
            harness_binary = semantics.get('binary', '')
            if not harness_binary:
                return None
            return {'harness': harness_binary, 'model': model_id}
