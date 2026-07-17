#!/usr/bin/env python3
"""
harness_launcher.py — BACKWARD COMPATIBILITY RE-EXPORT

Generic CLI command builder driven by harness schema.

This module now re-exports HarnessLauncher and build utilities from
nexus_core.harness.launcher. New code should import from there directly.

See Also:
    python/nexus_core/harness/launcher.py — canonical source
"""

from nexus_core.harness.launcher import (
    DEFAULT_BINARIES,
    HarnessLauncher,
    build_launcher_for_role,
)

__all__ = [
    "DEFAULT_BINARIES",
    "HarnessLauncher",
    "build_launcher_for_role",
]
