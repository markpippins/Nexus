"""
Conftest for rover module tests.

Mocks psycopg2 so event_emitter.py can be imported without a live
Postgres connection. Also adds the parent (nexus/python/) to sys.path
so package-qualified imports resolve correctly.
"""

import os
import sys

# Add nexus/python/ to sys.path so imports like "from rover.xxx" work
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.abspath(os.path.join(_THIS_DIR, "..", ".."))  # -> nexus/python/
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

# Mock psycopg2 so event_emitter.py can be imported without the actual
# Postgres driver. The tests exercise pure functions only — no DB queries.
import unittest.mock

_psycopg2_mock = unittest.mock.MagicMock()
_psycopg2_mock.connect.return_value = unittest.mock.MagicMock()
sys.modules["psycopg2"] = _psycopg2_mock
sys.modules["psycopg2._psycopg"] = unittest.mock.MagicMock()
