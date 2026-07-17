#!/usr/bin/env python3
"""
harness_enums.py — BACKWARD COMPATIBILITY RE-EXPORT

Architectural concepts for the harness adapter layer.

These enums are now canonically defined in nexus_core.harness.enums.
This module re-exports them for any code that still imports from
``tackle.harness_enums``. New code should import from ``nexus_core.harness.enums``.

See Also:
    python/nexus_core/harness/enums.py — canonical source
"""

from nexus_core.harness.enums import (
    ArgumentType,
    ExecutionMode,
    HarnessCapability,
    RoleMappingStrategy,
    parse_argument_type,
    parse_execution_mode,
    parse_role_mapping_strategy,
)

__all__ = [
    "ExecutionMode",
    "RoleMappingStrategy",
    "ArgumentType",
    "HarnessCapability",
    "parse_execution_mode",
    "parse_role_mapping_strategy",
    "parse_argument_type",
]
