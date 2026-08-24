"""Error taxonomy (spec C1): transient / permanent / configuration."""

from __future__ import annotations


class AbsorbError(Exception):
    """error_code uses the E_<CLASS>_<SPECIFIC> convention.

    retryable == True iff class == transient (invariant, test-enforced).
    """

    def __init__(self, error_code: str, message: str = ""):
        super().__init__(f"{error_code}: {message}" if message else error_code)
        self.error_code = error_code
        self.message = message or error_code

    @property
    def error_class(self) -> str:
        if self.error_code.startswith("E_TRANSIENT_"):
            return "transient"
        if self.error_code.startswith("E_PERMANENT_"):
            return "permanent"
        if self.error_code.startswith("E_CONFIG_"):
            return "configuration"
        return "unknown"

    @property
    def retryable(self) -> bool:
        return self.error_class == "transient"


def warn_code(code: str) -> bool:
    """Warning codes (W_*) are recorded but never fail a step."""
    return code.startswith("W_")
