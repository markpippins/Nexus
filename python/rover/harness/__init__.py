"""harness — Model resolution, fallback, and LLM invocation base class.

The harness provides a reusable abstraction for:
1. Resolving the preferred model for a role from tackle.models
2. Supporting fallback chains (primary → secondary → tertiary)
3. Invoking LLMs via opencode or direct provider API
4. Being reusable by conduit and other pipeline components
"""

from .base import Harness, ModelResolver, ModelConfig
from .architect import ArchitectHarness

__all__ = ["Harness", "ModelResolver", "ModelConfig", "ArchitectHarness"]
