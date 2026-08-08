"""
Shared helpers for Nebula API response unwrapping.

Centralizes the contract for the paginated /systems response shape
so harvest-pipeline scripts don't duplicate the unwrap logic.
"""


def unwrap_systems_response(raw):
    """Unwrap the paginated GET /api/systems response from nebula-srv.

    nebula-srv returns:
        {"items": [...], "total": N, "page": 1, "pageSize": 25}
    Previously it returned a raw array.  This handles both shapes.

    Args:
        raw: The JSON-decoded response from nebula_get("/systems?...")

    Returns:
        list[dict] on success, or None if the shape is unrecognised.
        Callers should handle None as a fatal error.
    """
    if isinstance(raw, dict) and "items" in raw:
        # Filter out non-dict entries — guards against API regressions
        # that return strings or other scalars in the items array.
        items = raw["items"]
        if isinstance(items, list):
            return [item for item in items if isinstance(item, dict)]
        return []
    if isinstance(raw, list):
        return [item for item in raw if isinstance(item, dict)]
    return None
