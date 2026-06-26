"""Regression test for the work_requests-in-PG-mode bug.

The bug: db_adapter.DBAdapter._init_db() gated the CREATE statements for
work_requests and pipeline_cursor on 'if not self._use_pg:'.  When
CONDUIT_PG_DSN was set, those tables were never created, and the first
call to add_work_request() (from main._dispatch_one, line ~303) failed
with 'relation "work_requests" does not exist'.

The fix: remove the 'if not self._use_pg:' gate.  The DDL is identical
for SQLite and PostgreSQL (TEXT, REFERENCES, and CREATE TABLE IF NOT
EXISTS work in both backends), so the CREATE must run unconditionally.

Now that SQLite support has been removed and PostgreSQL is mandatory,
this test verifies the DBAdapter creates manager-owned tables in PG mode.
"""

import os
import unittest
from unittest.mock import MagicMock, patch

from db_adapter import DBAdapter, _ConnectionProxy, _get_schema


class TestManagerTablesCreatedInPGMode(unittest.TestCase):
    """Regression: work_requests and pipeline_cursor must be created in PG mode."""

    def test_work_requests_created_in_pg_mode(self):
        """Manager-table CREATE must run before the MCP-table existence check.

        We mock _get_connection to return a _ConnectionProxy wrapping a
        mock psycopg2 connection.  The mock cursor returns empty results
        for the MCP-table check so _init_db raises RuntimeError — but
        the captured SQL proves manager-table CREATEs ran first."""
        sql_capture = []

        mock_cursor = MagicMock()
        mock_cursor.fetchone.return_value = (0,)  # tables not found → RuntimeError (tuple since _Row removed)
        mock_cursor.fetchall.return_value = []
        mock_cursor.description = None
        mock_cursor.rowcount = 0

        def capture_execute(sql, params=None):
            sql_capture.append(sql)
            return mock_cursor

        mock_cursor.execute = MagicMock(side_effect=capture_execute)

        mock_conn = MagicMock()
        mock_conn.cursor.return_value = mock_cursor

        # Wrap in a real _ConnectionProxy so execute() routes through
        # the proxy's translate logic and our capture side-effect fires.
        proxy = _ConnectionProxy(mock_conn, schema=_get_schema())

        cm = MagicMock()
        cm.__enter__ = MagicMock(return_value=proxy)
        cm.__exit__ = MagicMock(return_value=False)

        with patch.object(DBAdapter, "_get_connection", return_value=cm):
            # Bypass __init__'s _init_db; we call it ourselves with the mock
            db = DBAdapter.__new__(DBAdapter)
            db.db_path = "mock-dsn"
            db._schema = _get_schema()
            with self.assertRaises(RuntimeError):
                db._init_db()

        full_sql = " ".join(sql_capture)

        self.assertIn(
            "CREATE TABLE IF NOT EXISTS work_requests", full_sql,
            "work_requests must be created in PG mode (regression: was gated on "
            "'if not self._use_pg:')"
        )
        self.assertIn(
            "CREATE TABLE IF NOT EXISTS pipeline_cursor", full_sql,
            "pipeline_cursor must be created in PG mode (regression: was gated on "
            "'if not self._use_pg:')"
        )

        # Ordering invariant: CREATE must run BEFORE the MCP-table check.
        wr_pos = full_sql.find("CREATE TABLE IF NOT EXISTS work_requests")
        verify_pos = full_sql.find("information_schema.tables")
        self.assertNotEqual(wr_pos, -1, "work_requests CREATE must appear in captured SQL")
        self.assertNotEqual(
            verify_pos, -1,
            "sqlite_master→information_schema.tables translation must appear "
            "in captured SQL"
        )
        self.assertLess(
            wr_pos, verify_pos,
            "work_requests CREATE must run before the MCP-table existence check "
            "(the fix is fundamentally about ordering, not just existence)"
        )


if __name__ == "__main__":
    unittest.main()
