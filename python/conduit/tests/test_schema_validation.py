"""
Unit test: conduit _get_schema() identifier validation.

The security fix validates the resolved schema name against
/^[a-zA-Z_][a-zA-Z0-9_]*$/ before it is interpolated into
SET search_path DDL. This test verifies that _get_schema:
  1. Accepts valid PostgreSQL identifiers
  2. Rejects invalid identifiers with ValueError
  3. Still rejects 'public' (existing behavior)
  4. Resolves from explicit arg, env var, and default

Run: python -m pytest tests/test_schema_validation.py -v
     python -m unittest tests.test_schema_validation -v
"""

import os
import sys
import unittest
from unittest.mock import patch

# ── Path setup (matches existing test_db_adapter_pg_init.py pattern) ──
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from db_adapter import _get_schema


class TestGetSchemaValidation(unittest.TestCase):
    """Test the _get_schema() identifier validation security fix."""

    # ── Valid schemas should be accepted ──

    def test_valid_default_conduit(self):
        """Default schema 'conduit' is accepted."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CONDUIT_PG_SCHEMA", None)
            self.assertEqual(_get_schema(), "conduit")

    def test_valid_simple_identifier(self):
        """Simple lowercase identifier is accepted."""
        self.assertEqual(_get_schema("tackle"), "tackle")

    def test_valid_with_underscores(self):
        """Identifier with underscores is accepted."""
        self.assertEqual(_get_schema("test_conduit_123"), "test_conduit_123")

    def test_valid_starts_with_underscore(self):
        """Identifier starting with underscore is accepted."""
        self.assertEqual(_get_schema("_private"), "_private")

    def test_valid_single_char(self):
        """Single-character identifier is accepted."""
        self.assertEqual(_get_schema("a"), "a")

    def test_valid_mixed_case(self):
        """Mixed-case identifier is accepted."""
        self.assertEqual(_get_schema("ConduitTest"), "ConduitTest")

    def test_valid_from_env_var(self):
        """Schema from CONDUIT_PG_SCHEMA env var is accepted."""
        with patch.dict(os.environ, {"CONDUIT_PG_SCHEMA": "nebula_test"}):
            self.assertEqual(_get_schema(), "nebula_test")

    # ── Invalid schemas should be rejected ──

    def test_rejects_public(self):
        """'public' is rejected (existing behavior, not from regex)."""
        with self.assertRaises(ValueError) as ctx:
            _get_schema("public")
        self.assertIn("public", str(ctx.exception))

    def test_rejects_sql_injection_semicolon(self):
        """SQL injection with semicolon is rejected."""
        with self.assertRaises(ValueError) as ctx:
            _get_schema("conduit'; DROP TABLE users--")
        self.assertIn("Invalid schema name", str(ctx.exception))

    def test_rejects_starts_with_digit(self):
        """Identifier starting with a digit is rejected."""
        with self.assertRaises(ValueError) as ctx:
            _get_schema("1numeric")
        self.assertIn("Invalid schema name", str(ctx.exception))

    def test_rejects_hyphen(self):
        """Identifier with hyphen is rejected."""
        with self.assertRaises(ValueError) as ctx:
            _get_schema("my-schema")
        self.assertIn("Invalid schema name", str(ctx.exception))

    def test_rejects_space(self):
        """Identifier with space is rejected."""
        with self.assertRaises(ValueError) as ctx:
            _get_schema("my schema")
        self.assertIn("Invalid schema name", str(ctx.exception))

    def test_empty_string_falls_through_to_default(self):
        """Empty string is falsy, so `explicit or ...` falls through to env/default.

        This is CORRECT behavior — _get_schema('') does not return '' because
        the `or` operator evaluates the right side when the left is falsy.
        The regex validation only runs on the RESOLVED value, not the raw arg."""
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("CONDUIT_PG_SCHEMA", None)
            result = _get_schema("")
            self.assertEqual(result, "conduit")

    def test_rejects_double_quote(self):
        """Identifier with double quote is rejected."""
        with self.assertRaises(ValueError) as ctx:
            _get_schema('quoted"name')
        self.assertIn("Invalid schema name", str(ctx.exception))

    def test_rejects_dollar_sign(self):
        """Identifier with dollar sign is rejected."""
        with self.assertRaises(ValueError) as ctx:
            _get_schema("dollar$name")
        self.assertIn("Invalid schema name", str(ctx.exception))

    def test_rejects_drop_keyword(self):
        """Identifier with DROP keyword and injection pattern is rejected."""
        with self.assertRaises(ValueError) as ctx:
            _get_schema("conduit; DROP TABLE plans; --")
        self.assertIn("Invalid schema name", str(ctx.exception))

    def test_rejects_from_env_var(self):
        """Invalid schema from CONDUIT_PG_SCHEMA env var is rejected."""
        with patch.dict(os.environ, {"CONDUIT_PG_SCHEMA": "evil; DROP"}):
            with self.assertRaises(ValueError) as ctx:
                _get_schema()
            self.assertIn("Invalid schema name", str(ctx.exception))

    # ── Resolution priority ──

    def test_explicit_arg_takes_priority_over_env(self):
        """Explicit arg takes priority over env var."""
        with patch.dict(os.environ, {"CONDUIT_PG_SCHEMA": "from_env"}):
            self.assertEqual(_get_schema("from_arg"), "from_arg")

    def test_env_var_takes_priority_over_default(self):
        """Env var takes priority over default 'conduit'."""
        with patch.dict(os.environ, {"CONDUIT_PG_SCHEMA": "custom_schema"}):
            self.assertEqual(_get_schema(), "custom_schema")

    def test_none_explicit_falls_through_to_env(self):
        """None explicit arg falls through to env var."""
        with patch.dict(os.environ, {"CONDUIT_PG_SCHEMA": "env_schema"}):
            self.assertEqual(_get_schema(None), "env_schema")


if __name__ == "__main__":
    unittest.main()
