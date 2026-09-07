"""C6 ticket-lane dispositions (Lilac plan 8261639) — idempotent, bounded.

The C6 retirement gate's ticket-seam condition (V141 `c6_retirement_gate()`,
condition 3) requires EVERY vision.tickets row to carry a
resolution.migration_disposition entry (source_schema='vision',
source_table='tickets'), and the still-open/claimed/stale set to reach zero.

Disposition semantics per the ratified C4 vocabulary
(e29eb6a1 → 1b02c07c: unlinked | quarantined | mapped | discarded | retired):

  terminal status (completed/failed/cancelled/expired/closed)
      → 'retired'  — outcome preserved in the canonical receipt stream and
                     the accepted historical audit trail (C4 ruling); the
                     ticket itself is not carried into resolution.*.
  open / claimed / stale
      → 'unlinked' — genuinely live work; NOT closed by this pass (closing
                     live tickets would falsify the plan state). The gate's
                     non_closed check stays red until the work completes —
                     disclosed, never masked.

Ticket dispositions use migration_version='C6' to keep the receipts lane
('C4') separable. Idempotent: existing 'C6' rows are skipped. Bounded:
--limit / --max-seconds; rerun until remaining reaches 0. --dry-run
classifies without writing.

Usage:
  CONDUIT_PG_DSN='...' python3 disposition_c6_tickets.py [--dry-run]
      [--limit 2000] [--max-seconds 120] [--legacy-schema vision]
      [--canonical-schema resolution]
"""
import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))

import psycopg2

MIGRATION_VERSION = "C6"
RECORDED_BY = "disposition_c6_tickets"

TERMINAL_STATUSES = ("completed", "failed", "cancelled", "expired", "closed")

_DISPOSITION_SQL = """
    INSERT INTO {canonical_schema}.migration_disposition
      (source_schema, source_table, source_pk, migration_version,
       disposition_class, target_refs, recorded_by)
    VALUES ('vision', 'tickets', %s, %s, %s, %s, %s)
    ON CONFLICT (source_schema, source_table, source_pk, migration_version)
    DO NOTHING
"""


def _fetch_pending(cur, legacy_schema: str, limit: int,
                   canonical_schema: str = "resolution"):
    """Tickets with no C6 disposition yet."""
    cur.execute(
        f"""SELECT t.id, t.status, t.plan_id, t.role
            FROM {legacy_schema}.tickets t
            WHERE NOT EXISTS (
              SELECT 1 FROM {canonical_schema}.migration_disposition d
              WHERE d.source_schema = 'vision' AND d.source_table = 'tickets'
                AND d.source_pk = t.id AND d.migration_version = %s
            )
            ORDER BY t.created_at ASC
            LIMIT %s""",
        (MIGRATION_VERSION, limit),
    )
    return [dict(zip(("id", "status", "plan_id", "role"), row))
            for row in cur.fetchall()]


def classify(ticket: dict) -> tuple:
    """→ (disposition_class, target_refs dict) for one ticket."""
    if ticket["status"] in TERMINAL_STATUSES:
        return "retired", {
            "final_status": ticket["status"],
            "plan_id": ticket["plan_id"],
            "role": ticket["role"],
            "note": "terminal outcome preserved in receipt stream + audit trail "
                    "(C4 ruling e29eb6a1: best-effort, else discard)",
        }
    return "unlinked", {
        "status": ticket["status"],
        "plan_id": ticket["plan_id"],
        "role": ticket["role"],
        "note": "live ticket at disposition time; must close naturally "
                "before c6_retirement_gate condition 3 is satisfied",
    }


def process_row(conn, canonical_schema: str, ticket: dict, dry_run: bool) -> dict:
    cls, refs = classify(ticket)
    if not dry_run:
        with conn.cursor() as cur:
            cur.execute(
                _DISPOSITION_SQL.format(canonical_schema=canonical_schema),
                (ticket["id"], MIGRATION_VERSION, cls, json.dumps(refs),
                 RECORDED_BY),
            )
        conn.commit()
    return {"id": ticket["id"], "class": cls}


def run(conn, legacy_schema: str = "vision",
        canonical_schema: str = "resolution", dry_run: bool = False,
        limit: int = 2000, max_seconds: float = 120.0) -> dict:
    started = time.monotonic()
    cur = conn.cursor()
    pending = _fetch_pending(cur, legacy_schema, limit, canonical_schema)
    counts = {}
    unlinked = []
    for ticket in pending:
        result = process_row(conn, canonical_schema, ticket, dry_run)
        counts[result["class"]] = counts.get(result["class"], 0) + 1
        if result["class"] == "unlinked":
            unlinked.append(result["id"])
        if time.monotonic() - started > max_seconds:
            break

    # Remaining = undisposed tickets (any version) — the gate's exact shape.
    cur.execute(
        f"""SELECT count(*) FROM {legacy_schema}.tickets t
            WHERE NOT EXISTS (
              SELECT 1 FROM {canonical_schema}.migration_disposition d
              WHERE d.source_schema = 'vision' AND d.source_table = 'tickets'
                AND d.source_pk = t.id
            )""")
    remaining = cur.fetchone()[0]
    conn.rollback()
    return {"dry_run": dry_run, "processed": len(pending), "counts": counts,
            "remaining_undisposed": remaining, "unlinked_ids": unlinked,
            "elapsed_seconds": round(time.monotonic() - started, 2)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=2000)
    parser.add_argument("--max-seconds", type=float, default=120.0)
    parser.add_argument("--legacy-schema", default="vision")
    parser.add_argument("--canonical-schema",
                        default=os.environ.get("CONDUIT_LILAC_SCHEMA", "resolution"))
    args = parser.parse_args()

    dsn = os.environ.get("CONDUIT_PG_DSN", "")
    if not dsn:
        print("CONDUIT_PG_DSN must be set", file=sys.stderr)
        return 2
    conn = psycopg2.connect(dsn)
    report = run(conn, args.legacy_schema, args.canonical_schema,
                 dry_run=args.dry_run, limit=args.limit,
                 max_seconds=args.max_seconds)
    conn.close()
    print(json.dumps(report, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
