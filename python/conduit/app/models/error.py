"""
Standardized error response model for the WRP Kernel API.

All API errors (auth, validation, not-found, server errors) return
a consistent JSON envelope:

    {
      "error": {
        "code": "NOT_FOUND",
        "message": "Identity not found: 0053",
        "details": { ... }        // optional, route-specific context
      }
    }

Usage in routes:
    raise HTTPException(status_code=404, detail=ErrorDetail(
        code="NOT_FOUND", message="Identity not found: 0053"
    ).model_dump())

Or via the helper:
    raise not_found("Identity not found: 0053")
"""

from typing import Any, Optional

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Machine-readable error detail inside the standard envelope."""

    code: str = Field(..., description="Machine-readable error code (e.g. NOT_FOUND)")
    message: str = Field(..., description="Human-readable error description")
    details: Optional[dict[str, Any]] = Field(
        default=None, description="Optional route-specific context"
    )


class ErrorResponse(BaseModel):
    """Standard error response envelope — wraps ErrorDetail."""

    error: ErrorDetail


# ── Common error codes ───────────────────────────────────────────────
# These are the canonical error codes the API may return.

ERR_NOT_FOUND = "NOT_FOUND"
ERR_VALIDATION = "VALIDATION_ERROR"
ERR_UNAUTHORIZED = "UNAUTHORIZED"
ERR_INTERNAL = "INTERNAL_ERROR"
ERR_SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE"


# ── Helper factories ─────────────────────────────────────────────────


def error_response(
    status_code: int,
    code: str,
    message: str,
    details: Optional[dict[str, Any]] = None,
) -> tuple[dict, int]:
    """Build a (body_dict, status_code) pair for return from route handlers.

    Convenience for routes that return error responses inline instead
    of raising HTTPException.
    """
    return (
        ErrorResponse(error=ErrorDetail(code=code, message=message, details=details)).model_dump(),
        status_code,
    )
