"""
Shared test helpers for conduit integration tests.

Provides safe schema creation/destruction with try/finally guards
and pre-test cleanup of orphaned schemas from crashed test runs.

Usage:
    from tests.test_helpers import (
        cleanup_orphaned_test_schemas,
        create_test_schema,
        drop_test_schema,
        TestSchema,
    )

    # At module level, before any test runs:
    cleanup_orphaned_test_schemas(DSN)

    # In setUp:
    self._schema = TestSchema(self._raw_conn, "test_e2e")

    # In tearDown (automatically called by __exit__ if using context manager):
    self._schema.drop()
"""

import psycopg2

# Schema prefixes that are safe to auto-clean (only test isolation schemas)
_TEST_SCHEMA_PREFIXES = ("test_e2e_", "test_lifecycle_", "test_debug_")


def cleanup_orphaned_test_schemas(dsn: str) -> int:
    """Drop any leftover test schemas from previous crashed test runs.

    Called once at module load time to clean up before any tests run.
    Only drops schemas matching the test isolation prefixes — never
    touches production schemas.

    Returns the number of schemas dropped.
    """
    conn = psycopg2.connect(dsn)
    conn.set_isolation_level(0)  # autocommit for DDL
    cur = conn.cursor()

    try:
        # Find all orphaned test schemas
        cur.execute(
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name LIKE 'test_e2e_%' "
            "   OR schema_name LIKE 'test_lifecycle_%' "
            "   OR schema_name LIKE 'test_debug_%'"
        )
        orphaned = [row[0] for row in cur.fetchall()]

        dropped = 0
        for schema_name in orphaned:
            try:
                cur.execute(f"DROP SCHEMA {schema_name} CASCADE")
                dropped += 1
            except Exception:
                pass  # schema may have been dropped between list and drop

        return dropped
    finally:
        cur.close()
        conn.close()


def create_test_schema(conn, schema_prefix: str) -> str:
    """Create an isolated test schema with a unique name.

    Args:
        conn: Raw psycopg2 connection (not a DBAdapter proxy).
        schema_prefix: Prefix like "test_e2e" — a random hex suffix is appended.

    Returns:
        The generated schema name (e.g., "test_e2e_a1b2c3d4").
    """
    import os
    schema_name = f"{schema_prefix}_{os.urandom(4).hex()}"
    cur = conn.cursor()
    cur.execute(f"CREATE SCHEMA {schema_name}")
    cur.execute(f"SET search_path TO {schema_name}")
    cur.close()
    return schema_name


def drop_test_schema(dsn: str, schema_name: str) -> bool:
    """Safely drop a test schema. Returns True on success, False on failure.

    Uses a fresh connection (not the test connection) so that any open
    transactions or locks on the old connection don't block the DROP.
    """
    try:
        conn = psycopg2.connect(dsn)
        conn.set_isolation_level(0)  # autocommit
        cur = conn.cursor()
        cur.execute(f"DROP SCHEMA IF EXISTS {schema_name} CASCADE")
        cur.close()
        conn.close()
        return True
    except Exception as exc:
        # Log but don't raise — test cleanup should never fail the test
        import sys
        print(f"WARNING: Failed to drop test schema {schema_name}: {exc}",
              file=sys.stderr)
        return False
