"""
Conftest for substance module tests.

Adds the parent (nexus/python/) to sys.path so that package-qualified
imports (from substance.xxx) resolve correctly, and mocks the optional
redis.asyncio module for testing pure cache helpers without the dependency.
"""

import os
import sys

# Add nexus/python/ to sys.path so imports like "from substance.xxx" work
# when running from any working directory.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT = os.path.abspath(os.path.join(_THIS_DIR, "..", ".."))  # -> nexus/python/
if _PARENT not in sys.path:
    sys.path.insert(0, _PARENT)

# Mock redis.asyncio so cache.py can be imported without the actual package.
# The tests only exercise pure helper functions (_segset_key, _domain_index_key,
# _JSONEncoder) which don't need a live Redis connection.
import unittest.mock

_redis_mock = unittest.mock.MagicMock()
_asyncio_mock = unittest.mock.MagicMock()
_asyncio_mock.Redis = _redis_mock

sys.modules["redis"] = unittest.mock.MagicMock()
sys.modules["redis.asyncio"] = _asyncio_mock

# Mock asyncpg so repository.py and db.py can be imported without the
# actual Postgres driver. The tests are pure — no DB queries are run.
sys.modules["asyncpg"] = unittest.mock.MagicMock()
sys.modules["asyncpg.connection"] = unittest.mock.MagicMock()
sys.modules["asyncpg.pool"] = unittest.mock.MagicMock()
sys.modules["asyncpg"].Connection = unittest.mock.MagicMock()
sys.modules["asyncpg"].Pool = unittest.mock.MagicMock()
