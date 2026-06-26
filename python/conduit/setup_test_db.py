#!/usr/bin/env python3
"""setup_test_db.py — create a dedicated test PostgreSQL database for conduit tests.

Usage:
    python setup_test_db.py                  # create test DB and apply schema
    python setup_test_db.py --drop           # drop and recreate test DB
    python setup_test_db.py --schema-only    # only (re)apply schema

Reads CONDUIT_PG_DSN from environment or ../conduit/.env.
Creates a 'nexus_test' database (or falls back to 'conduit_test' schema).
Writes .env.test with connection info for the test database.
"""

import os
import sys
import argparse

import psycopg2
from psycopg2.errors import InsufficientPrivilege, DuplicateDatabase
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SCHEMA_FILE = os.path.join(SCRIPT_DIR, "schema.sql")
ENV_TEST_FILE = os.path.join(SCRIPT_DIR, ".env.test")

SEPARATOR = "=" * 60


def parse_dsn(dsn: str) -> dict[str, str]:
    """Parse a libpq key=value DSN into a dict."""
    result: dict[str, str] = {}
    for pair in dsn.strip().split():
        if "=" not in pair:
            continue
        key, _, val = pair.partition("=")
        result[key] = val
    return result


def dsn_to_cfg(dsn: str) -> dict[str, str]:
    """Extract host/port/user/password/dbname from a DSN string."""
    p = parse_dsn(dsn)
    return {
        "host": p.get("host", "localhost"),
        "port": p.get("port", "5433"),
        "user": p.get("user", ""),
        "password": p.get("password", ""),
        "dbname": p.get("dbname", ""),
    }


def connect_admin(host: str, port: str, user: str, password: str) -> psycopg2.extensions.connection:
    """Connect to the 'postgres' maintenance database."""
    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname="postgres")
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    return conn


def table_count(host: str, port: str, user: str, password: str,
                dbname: str, schema: str = "conduit") -> int:
    """Count tables in the given schema+db."""
    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname)
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) FROM information_schema.tables "
        "WHERE table_schema = %s AND table_type = 'BASE TABLE'",
        (schema,),
    )
    count = cur.fetchone()[0]
    cur.close()
    conn.close()
    return count


def database_exists(host: str, port: str, user: str, password: str, dbname: str) -> bool:
    """Check if a database exists."""
    try:
        conn = connect_admin(host, port, user, password)
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (dbname,))
        exists = cur.fetchone() is not None
        cur.close()
        conn.close()
        return exists
    except Exception:
        return False


def create_database(host: str, port: str, user: str, password: str, dbname: str) -> bool:
    """Try to create a database. Returns True on success, False on permission error."""
    try:
        conn = connect_admin(host, port, user, password)
        cur = conn.cursor()
        cur.execute(f"CREATE DATABASE {dbname}")
        cur.close()
        conn.close()
        return True
    except (InsufficientPrivilege, DuplicateDatabase):
        return False


def apply_schema(host: str, port: str, user: str, password: str, dbname: str) -> int:
    """Apply schema.sql to the given database. Returns table count."""
    if not os.path.exists(SCHEMA_FILE):
        print(f"ERROR: Schema file not found: {SCHEMA_FILE}", file=sys.stderr)
        sys.exit(1)

    sql = open(SCHEMA_FILE).read()

    conn = psycopg2.connect(host=host, port=port, user=user, password=password, dbname=dbname)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    try:
        cur = conn.cursor()
        cur.execute(sql)
        cur.close()
        count = table_count(host, port, user, password, dbname)
        conn.close()
        return count
    except Exception:
        conn.close()
        raise


def main():
    parser = argparse.ArgumentParser(description="Set up conduit test database")
    parser.add_argument("--drop", action="store_true",
                        help="Drop and recreate test database")
    parser.add_argument("--schema-only", action="store_true",
                        help="Only (re)apply schema to existing test database")
    args = parser.parse_args()

    # ── Resolve DSN ─────────────────────────────────────────────
    dsn = os.environ.get("CONDUIT_PG_DSN", "")
    if not dsn:
        env_file = os.path.join(SCRIPT_DIR, ".env")
        if os.path.exists(env_file):
            for line in open(env_file):
                line = line.strip()
                if line.startswith("CONDUIT_PG_DSN="):
                    dsn = line.split("=", 1)[1].strip()
                    break
    if not dsn:
        print("ERROR: CONDUIT_PG_DSN not set and no .env file found.", file=sys.stderr)
        print("Set CONDUIT_PG_DSN or create a .env file first.", file=sys.stderr)
        sys.exit(1)

    cfg = dsn_to_cfg(dsn)
    host, port, user, password = cfg["host"], cfg["port"], cfg["user"], cfg["password"]
    print(SEPARATOR)
    print("  conduit test database setup")
    print(f"  Host: {host}:{port}")
    print(f"  User: {user}")
    print(SEPARATOR)

    # ── Target database ─────────────────────────────────────────
    TEST_DB = "nexus_test"
    used_separate_db = False

    if args.drop:
        print(f"\n--- Dropping test database {TEST_DB} ---")
        try:
            conn = connect_admin(host, port, user, password)
            cur = conn.cursor()
            cur.execute(
                "SELECT pg_terminate_backend(pg_stat_activity.pid) "
                "FROM pg_stat_activity "
                "WHERE pg_stat_activity.datname = %s AND pid <> pg_backend_pid()",
                (TEST_DB,),
            )
            cur.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
            cur.close()
            conn.close()
            print(f"  Dropped {TEST_DB}.")
        except Exception as e:
            print(f"  Could not drop {TEST_DB}: {e}")

    if not args.schema_only:
        print(f"\n--- Creating test database {TEST_DB} ---")
        if database_exists(host, port, user, password, TEST_DB):
            print(f"  Database {TEST_DB} already exists.")
            used_separate_db = True
        else:
            ok = create_database(host, port, user, password, TEST_DB)
            if ok:
                print(f"  Created database {TEST_DB}.")
                used_separate_db = True
            else:
                print(f"  WARNING: Could not create database {TEST_DB} (insufficient privileges).")
                print(f"  Using existing database '{cfg['dbname']}' (reusing 'conduit' schema).")
                TEST_DB = cfg["dbname"]

    # ── Apply schema ────────────────────────────────────────────
    print(f"\n--- Applying schema to {TEST_DB} ---")
    count = apply_schema(host, port, user, password, TEST_DB)
    print(f"  Schema applied. {count} tables created.")

    # ── Write .env.test ─────────────────────────────────────────
    test_dsn = f"host={host} port={port} user={user} password={password} dbname={TEST_DB}"
    with open(ENV_TEST_FILE, "w") as f:
        f.write("# Test database environment — generated by setup_test_db.py\n")
        f.write("# Source before running tests:  source .env.test\n")
        f.write(f"CONDUIT_PG_DSN={test_dsn}\n")
        f.write("CONDUIT_PG_SCHEMA=conduit\n")
    print(f"\n  Wrote {ENV_TEST_FILE}")

    # ── Verify ──────────────────────────────────────────────────
    print(f"\n--- Verification ---")
    if count >= 8:
        print(f"  \u2713 Test database ready ({count} tables in 'conduit' schema).")
    else:
        print(f"  \u26a0 Expected at least 8 tables, found {count}.")

    if used_separate_db:
        print(f"  Using separate database: {TEST_DB}")
    else:
        print(f"  Sharing database '{cfg['dbname']}' (separate DB not available).")

    print(f"\nTo run tests against the test database:")
    print(f"  cd {SCRIPT_DIR}")
    print(f"  export CONDUIT_PG_DSN='{test_dsn}'")
    print(f"  export CONDUIT_PG_SCHEMA=conduit")
    print(f"  python -m pytest test_guard.py tests/ -v")
    print()


if __name__ == "__main__":
    main()
