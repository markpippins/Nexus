"""Re-exports from losm_ir.transition for backward compatibility.

All transition validation logic has been moved to losm-ir
(losm_ir.transition). This module is kept as a compatibility
shim so existing imports from losm_shell.lifecycle.transition
continue to work.
"""
# flake8: noqa: F401
from losm_ir.transition import (  # noqa: F401
    ValidationResult,
    VALID_TRANSITIONS,
    validate_transition,
    TransitionError,
)
