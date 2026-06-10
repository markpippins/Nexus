"""Shared environment configuration loader.

Loads KEY=VALUE pairs from a ``.env`` file (inline, no dependency on
``python-dotenv``).  Both ``main.py`` and ``executor_cloud.py`` import
this module so the same defaults and loading logic apply everywhere.
"""

import os


def load_env(path: str | None = None) -> dict[str, str]:
    """Load KEY=VALUE pairs from a .env file.

    Reads from *path* or the file named ``.env`` next to this module.
    Empty lines and lines starting with ``#`` are ignored.
    Does **not** override variables already set in the environment.
    Returns the parsed dictionary for inspection.
    """
    if path is None:
        path = os.path.join(os.path.dirname(__file__), ".env")
    env_vars: dict[str, str] = {}
    if not os.path.isfile(path):
        return env_vars
    with open(path) as fh:
        for raw in fh:
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = val
                env_vars[key] = val
    return env_vars


# ── Load .env at import time ─────────────────────────────────────────
load_env()
