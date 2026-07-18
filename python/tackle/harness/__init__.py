"""harness — Model resolution, fallback, and LLM invocation base class.

The harness provides a reusable abstraction for:
1. Invoking LLMs via tackle.inference (direct provider API calls)
2. Model resolution from tackle.db for logging/envelope metadata
3. Fallback chain support (primary → secondary → tertiary)
"""

from .base import Harness, ModelConfig, resolve_role_model
from .architect import ArchitectHarness

__all__ = ["Harness", "ModelConfig", "resolve_role_model", "ArchitectHarness"]
