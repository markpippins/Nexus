#!/usr/bin/env python3
"""operator.api_proxy — Proxy requests to Nexus services.

Routes API calls to conduit (3100), nebula (3101), or terrain
based on the service name in the URL path.
"""

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

_log = logging.getLogger("operator.api_proxy")

# Service URLs
CONDUIT_URL = os.environ.get("CONDUIT_URL", "http://localhost:3100")
NEBULA_URL = os.environ.get("NEBULA_URL", "http://localhost:3101")
TERRAIN_URL = os.environ.get("TERRAIN_URL", "http://localhost:8084")

SERVICE_MAP = {
    "conduit": CONDUIT_URL,
    "nebula": NEBULA_URL,
    "terrain": TERRAIN_URL,
}


def proxy_request(
    service: str,
    path: str,
    method: str = "GET",
    body: Optional[Dict[str, Any]] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    """Proxy an HTTP request to a Nexus service.

    Args:
        service: Service name (conduit, nebula, terrain)
        path: API path (e.g., /api/plans, /api/agent-records)
        method: HTTP method
        body: Optional request body
        timeout: Request timeout in seconds

    Returns:
        Dict with keys: status, data, error
    """
    base_url = SERVICE_MAP.get(service)
    if not base_url:
        return {"status": 400, "data": None, "error": f"Unknown service: {service}"}

    url = f"{base_url}{path}"

    try:
        data = None
        headers = {"Content-Type": "application/json"}

        if body:
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(
            url,
            data=data,
            headers=headers,
            method=method,
        )

        with urllib.request.urlopen(req, timeout=timeout) as resp:
            response_data = resp.read().decode("utf-8")
            try:
                parsed = json.loads(response_data)
            except json.JSONDecodeError:
                parsed = {"raw": response_data}

            return {"status": resp.status, "data": parsed, "error": None}

    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")[:500]
        return {"status": e.code, "data": None, "error": error_body}
    except urllib.error.URLError as e:
        return {"status": 502, "data": None, "error": f"Connection failed: {e.reason}"}
    except Exception as e:
        return {"status": 500, "data": None, "error": str(e)}
