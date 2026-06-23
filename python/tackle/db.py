#!/usr/bin/env python3
"""tackle.db — Resolved role config queries via the tackle-mcp HTTP API.

This module has **zero database dependencies**.  All config lookups are
served by the tackle-mcp TypeScript server (port 3400), which is the
canonical schema authority for the ``tackle.*`` PostgreSQL tables.

Usage::

    from tackle.db import get_role_config, get_fallback_models

    cfg = get_role_config("planner")
    # -> { model_identifier, provider_type, api_key, endpoint_url,
    #      harness_name, invocation_semantics, fallback_models }

    fallbacks = get_fallback_models("planner")
    # -> [{ priority, model_identifier, provider_type, ... }, ...]
"""

import json
import logging
import os
import time
import urllib.request
from typing import Any, Dict, List, Optional

_log = logging.getLogger("tackle.db")

# ── Tackle-MCP server URL ───────────────────────────────────────────

TACKLE_MCP_URL = os.environ.get(
    "TACKLE_MCP_URL",
    "http://localhost:3400",
).rstrip("/")


def _http_get(path: str) -> Any:
    """Fire a GET to the tackle-mcp server and return parsed JSON."""
    url = f"{TACKLE_MCP_URL}{path}"
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        _log.warning("HTTP %d from %s: %s", e.code, url, e.read().decode("utf-8", errors="replace")[:200])
        return None
    except Exception as e:
        _log.warning("Failed to fetch %s: %s", url, e)
        return None


# ── Role config cache (TTL-based) ──────────────────────────────────

_RoleConfigCache: Optional[Dict[str, Any]] = None
_RoleConfigCacheTime: float = 0
_ROLE_CONFIG_TTL: int = 60  # seconds


def _invalidate_cache():
    """Force the cache to refresh on the next lookup."""
    global _RoleConfigCache, _RoleConfigCacheTime
    _RoleConfigCache = None
    _RoleConfigCacheTime = 0


# ── Role config lookup ─────────────────────────────────────────────

def get_role_config(role: str) -> Optional[Dict[str, Any]]:
    """Look up the full AI config for a role from the tackle-mcp server.

    Returns a dict with keys::
        model_identifier, provider_type, api_key, endpoint_url,
        harness_name, invocation_semantics (parsed JSON dict),
        fallback_models (list of dicts)

    Or ``None`` if no config is found.
    Results are cached for ``_ROLE_CONFIG_TTL`` seconds.
    """
    global _RoleConfigCache, _RoleConfigCacheTime
    now = time.time()

    # Check cache first
    if _RoleConfigCache is not None and (now - _RoleConfigCacheTime) < _ROLE_CONFIG_TTL:
        return _RoleConfigCache.get(role)

    # Cache miss — fetch the resolved config
    data = _http_get(f"/config/ai/resolve/{role}")
    if data is None:
        # Tackle-mcp may be down — try returning stale cache
        if _RoleConfigCache is not None:
            cached = _RoleConfigCache.get(role)
            if cached is not None:
                _log.warning("get_role_config: tackle-mcp unreachable, returning stale cache for role=%s", role)
                return cached
        return None

    # Reshape to match what agent_chat expects
    cfg = {
        "model_identifier": data.get("model_identifier", ""),
        "provider_type": data.get("provider_type", ""),
        "api_key": data.get("api_key") or "",
        "endpoint_url": data.get("endpoint_url") or "",
        "harness_name": data.get("harness_name", ""),
        "invocation_semantics": data.get("invocation_semantics", {}),
        "fallback_models": data.get("fallback_models", []),
    }

    # Update cache with this single role (backward compat: cache is role -> config)
    if _RoleConfigCache is None:
        _RoleConfigCache = {}
    _RoleConfigCache[role] = cfg
    _RoleConfigCacheTime = now

    return cfg


def get_all_role_configs() -> Dict[str, Any]:
    """Return all cached role configs, or empty dict if nothing cached.

    Note: unlike the old conduit approach, this module caches per-role
    (lazy-loads on first access).  Calling this method will return only
    roles that have been accessed since the last cache reset.
    """
    return _RoleConfigCache or {}


# ── Fallback model lookup ──────────────────────────────────────────

def get_fallback_models(role: str) -> List[Dict[str, Any]]:
    """Return fallback models for a role.

    Delegates to the same resolve endpoint — fallbacks are included
    in the ``get_role_config`` response.  This is a convenience wrapper
    so agent_chat can call it directly.

    Returns a list of dicts, each with::
        priority, model_identifier, provider_type, provider_id, api_key,
        endpoint_url, harness_name, harness_id, invocation_semantics
    """
    cfg = get_role_config(role)
    if cfg is None:
        return []
    return cfg.get("fallback_models", [])
