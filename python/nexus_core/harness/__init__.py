"""Harness interface enums and the generic CLI command builder."""

from .enums import (
    ExecutionMode,
    RoleMappingStrategy,
    ArgumentType,
    HarnessCapability,
    parse_execution_mode,
    parse_role_mapping_strategy,
    parse_argument_type,
)

from .launcher import (
    HarnessLauncher,
    DEFAULT_BINARIES,
    build_launcher_for_role,
)

__all__ = [
    "ExecutionMode",
    "RoleMappingStrategy",
    "ArgumentType",
    "HarnessCapability",
    "parse_execution_mode",
    "parse_role_mapping_strategy",
    "parse_argument_type",
    "HarnessLauncher",
    "DEFAULT_BINARIES",
    "build_launcher_for_role",
]
