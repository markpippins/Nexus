"""Unit tests for _CursorProxy — verifying dict_fetchone/dict_fetchall behavior
after the _Row class was removed and replaced with plain tuples."""

import os
import sys
import unittest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from db_adapter import _CursorProxy


def _make_description(col_names):
    """Build a mock cursor.description from a list of column name strings.

    Each entry is a namedtuple-like object with a .name attribute.
    """
    desc_entries = []
    for name in col_names:
        entry = MagicMock()
        entry.name = name
        desc_entries.append(entry)
    return desc_entries


class TestCursorProxyDictFetchone(unittest.TestCase):
    """Tests for _CursorProxy.dict_fetchone()."""

    def test_returns_dict_with_correct_keys(self):
        """dict_fetchone maps column names to values for a single row."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["id", "name", "status"])
        mock_cur.rowcount = 1
        mock_cur.fetchone.return_value = ("abc", "hello", "open")

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchone()

        self.assertEqual(result, {"id": "abc", "name": "hello", "status": "open"})
        mock_cur.fetchone.assert_called_once()

    def test_returns_none_when_no_rows(self):
        """dict_fetchone returns None when the cursor has no rows."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["id", "value"])
        mock_cur.rowcount = 0
        mock_cur.fetchone.return_value = None

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchone()

        self.assertIsNone(result)
        mock_cur.fetchone.assert_called_once()

    def test_preserves_null_values(self):
        """None/Null values are preserved as None in the dict."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["a", "b", "c"])
        mock_cur.rowcount = 1
        mock_cur.fetchone.return_value = (1, None, "text")

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchone()

        self.assertEqual(result, {"a": 1, "b": None, "c": "text"})

    def test_single_column(self):
        """Single-column queries produce a single-key dict."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["count"])
        mock_cur.rowcount = 1
        mock_cur.fetchone.return_value = (42,)

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchone()

        self.assertEqual(result, {"count": 42})

    def test_ddl_cursor_no_description(self):
        """DDL cursors (description=None): fetchone returns None, so dict_fetchone returns None."""
        mock_cur = MagicMock()
        mock_cur.description = None
        mock_cur.rowcount = -1
        mock_cur.fetchone.return_value = None  # DDL doesn't return rows

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchone()

        self.assertIsNone(result)  # fetchone returned None before we even build dict

    def test_does_not_affect_fetchone(self):
        """dict_fetchone does not change plain fetchone behavior."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["x", "y"])
        mock_cur.rowcount = 1
        mock_cur.fetchone.return_value = ("foo", "bar")

        proxy = _CursorProxy(mock_cur)
        tuple_result = proxy.fetchone()

        self.assertEqual(tuple_result, ("foo", "bar"))
        self.assertIsInstance(tuple_result, tuple)


class TestCursorProxyDictFetchall(unittest.TestCase):
    """Tests for _CursorProxy.dict_fetchall()."""

    def test_returns_list_of_dicts(self):
        """dict_fetchall maps each row to a column-keyed dict."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["id", "name"])
        mock_cur.rowcount = 2
        mock_cur.fetchall.return_value = [
            ("1", "Alice"),
            ("2", "Bob"),
        ]

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchall()

        self.assertEqual(result, [
            {"id": "1", "name": "Alice"},
            {"id": "2", "name": "Bob"},
        ])
        mock_cur.fetchall.assert_called_once()

    def test_returns_empty_list_when_no_rows(self):
        """dict_fetchall returns [] when no rows match."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["col"])
        mock_cur.rowcount = 0
        mock_cur.fetchall.return_value = []

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchall()

        self.assertEqual(result, [])

    def test_preserves_null_values_in_all_rows(self):
        """None values in any row are preserved."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["a", "b"])
        mock_cur.rowcount = 2
        mock_cur.fetchall.return_value = [
            (None, "hello"),
            ("world", None),
        ]

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchall()

        self.assertEqual(result, [
            {"a": None, "b": "hello"},
            {"a": "world", "b": None},
        ])

    def test_single_column_multi_row(self):
        """Single-column multi-row query produces list of single-key dicts."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["name"])
        mock_cur.rowcount = 3
        mock_cur.fetchall.return_value = [("x",), ("y",), ("z",)]

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchall()

        self.assertEqual(result, [
            {"name": "x"},
            {"name": "y"},
            {"name": "z"},
        ])

    def test_ddl_cursor_no_description(self):
        """DDL cursor with no description: _columns is [], fetchall returns []. dicts are all empty."""
        mock_cur = MagicMock()
        mock_cur.description = None
        mock_cur.rowcount = -1
        mock_cur.fetchall.return_value = []

        proxy = _CursorProxy(mock_cur)
        result = proxy.dict_fetchall()

        self.assertEqual(result, [])

    def test_does_not_affect_fetchall(self):
        """dict_fetchall does not change plain fetchall behavior."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["x"])
        mock_cur.rowcount = 2
        mock_cur.fetchall.return_value = [("a",), ("b",)]

        proxy = _CursorProxy(mock_cur)

        tuple_result = proxy.fetchall()

        self.assertEqual(tuple_result, [("a",), ("b",)])
        self.assertIsInstance(tuple_result[0], tuple)

    def test_multiple_calls_return_fresh_results(self):
        """Subsequent dict_fetchall calls read from the cursor again (not cached)."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["key"])
        mock_cur.rowcount = 1

        # First call
        mock_cur.fetchall.return_value = [("first",)]
        proxy = _CursorProxy(mock_cur)
        r1 = proxy.dict_fetchall()
        self.assertEqual(r1, [{"key": "first"}])

        # Second call — cursor returns different data
        mock_cur.fetchall.return_value = [("second",)]
        r2 = proxy.dict_fetchall()
        self.assertEqual(r2, [{"key": "second"}])


class TestCursorProxyRowcount(unittest.TestCase):
    """Tests for _CursorProxy.rowcount passthrough."""

    def test_rowcount_passthrough(self):
        """rowcount is copied from the underlying cursor on init."""
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["x"])
        mock_cur.rowcount = 7

        proxy = _CursorProxy(mock_cur)
        self.assertEqual(proxy.rowcount, 7)

    def test_rowcount_zero(self):
        mock_cur = MagicMock()
        mock_cur.description = _make_description(["x"])
        mock_cur.rowcount = 0

        proxy = _CursorProxy(mock_cur)
        self.assertEqual(proxy.rowcount, 0)


if __name__ == "__main__":
    unittest.main()
