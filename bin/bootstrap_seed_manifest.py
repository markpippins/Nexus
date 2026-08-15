#!/usr/bin/env python3
r"""
bootstrap_seed_manifest.py — reconstruct the tackle schema from the committed
seed-manifest.json (typescript/tackle-seeds/seed-manifest.json).

Used by CI (see .github/workflows/seed-guard.yml and `make seed-guard-bootstrap`)
to give the AC1-AC4 live-compare tests real tackle.memory / tackle.role_memory
tables to compare the rendered seed against — WITHOUT a production DB. The
manifest is a full-content snapshot of the canonical DB (emitted by
bin/regenerate_memory_seed.py), so seeding from it is exactly the canonical
state.

Safety: only the seed tables (memory, role_memory) are created/inserted. If
the target schema already contains OTHER tables (providers, roles, harnesses,
config_bundle, ... — i.e. it looks like a real live DB), the script REFUSES
to run unless --force is given. CI's throwaway Postgres has no such tables.

Usage:
    python3 bin/bootstrap_seed_manifest.py [--dsn DSN] [--schema tackle] [--force]

Env: CONDUIT_PG_DSN (default postgresql://pguser:pgpass@localhost:5432/nexus)
Exit 0 on success (schema bootstrapped), 1 on refusal/failure.
"""

import argparse
import json
import os
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # nexus/
sys.path.insert(0, os.path.join(REPO, "python"))

from nexus_core.wrp.seed_manifest import (  # noqa: E402
    MANIFEST_PATH,
    apply_manifest,
)

DSN = os.environ.get("CONDUIT_PG_DSN", "postgresql://pguser:pgpass@localhost:5432/nexus")

def looks_like_live_db(conn, schema: str) -> list:
    """Return the names of non-seed tables present in the target schema.

    A REAL live tackle schema contains many tables beyond the two the seed
    touches (memory, role_memory) — providers, roles, harnesses, config_bundle,
    sessions, agent_scheduler, prompts, tasks, projection_configs, system_logs,
    agent_timeclock, role_leases, ... Any such table means the target is the
    canonical DB and must not be clobbered by a bootstrap. Checking "any table
    other than the seed tables" instead of a curated list means this cannot go
    stale when migrations add new tables.
    """
    cur = conn.cursor()
    cur.execute(
        """SELECT table_name FROM information_schema.tables
           WHERE table_schema = %s""",
        (schema,),
    )
    present = {r[0] for r in cur.fetchall()}
    return sorted(present - {"memory", "role_memory"})


def main() -> int:
    ap = argparse.ArgumentParser(description="Bootstrap tackle schema from the committed seed manifest")
    ap.add_argument("--dsn", default=DSN, help="Postgres DSN (default: $CONDUIT_PG_DSN)")
    ap.add_argument("--schema", default="tackle", help="schema to bootstrap (default: tackle)")
    ap.add_argument("--force", action="store_true",
                    help="allow bootstrap even if the target schema looks like a live DB")
    args = ap.parse_args()

    if not os.path.exists(MANIFEST_PATH):
        print(f"ERROR: manifest not found at {MANIFEST_PATH} — "
              "run `python3 bin/regenerate_memory_seed.py` first", file=sys.stderr)
        return 1

    with open(MANIFEST_PATH, encoding="utf-8") as f:
        manifest = json.load(f)

    import psycopg2

    conn = psycopg2.connect(args.dsn)
    try:
        conn.autocommit = True
        other_tables = looks_like_live_db(conn, args.schema)
        if other_tables and not args.force:
            print(
                f"REFUSED: target schema '{args.schema}' contains non-seed tables "
                f"{', '.join(other_tables)} — this looks like the canonical DB. "
                "Bootstrap only targets a throwaway schema. Use --force only if you "
                "know the target is disposable.",
                file=sys.stderr,
            )
            return 1
        if args.force and other_tables:
            print(
                f"WARNING: --force on a schema with non-seed tables ({', '.join(other_tables)}). "
                "Only tackle.memory/tackle.role_memory are touched (recreated from the "
                "manifest); other tables are left alone, but any live data in the seed "
                "tables — including their created_at/updated_at timestamps — is replaced "
                "by the manifest snapshot.",
                file=sys.stderr,
            )
        result = apply_manifest(conn, manifest, schema=args.schema, reset=True)
        print(f"bootstrapped {args.schema}: {result['cards']} cards, {result['roles']} role rows "
              f"from {os.path.basename(MANIFEST_PATH)}")
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
