"""
wr-conf-016: versioned interface + dependency-free boundary (T05 closure).

Locks the T05 contract-matrix guarantees for the canonical WRP core:
one canonical owner, dependency-free (stdlib-only where possible) canonical
interfaces, additive-only within a version, and no forbidden reverse
dependency on the harness/adapter layers.

  AC1 — public interface pin: ``nexus_core.wrp.__all__`` is exactly the
        version-1 interface set (additive-only within a version; removals
        fail closed).
  AC2 — version lock: the CCNF_VERSION manifest agrees with the embedded
        constant (``manifest_matches_constant()``) and ``locked_ccnf_version()``
        returns the locked version (1) rather than failing closed.
  AC3 — dependency-free core: every runtime module under ``nexus_core/wrp``
        imports only stdlib or ``nexus_core.*`` (no third-party, no
        conduit/tackle/vision/voyager adapter layers).
  AC4 — forbidden reverse dependency: no runtime wrp module imports
        ``nexus_core.harness`` or ``tackle`` (T05 rule 2).

Usage:
    cd /home/codex/dev/nexus
    python3 -m pytest python/nexus_core/wrp/tests/test_conformance_interface_version.py -v
"""

import ast
import os
import sys
import unittest

_SELF_DIR = os.path.dirname(os.path.abspath(__file__))
_NEXUS_PYTHON = os.path.abspath(os.path.join(_SELF_DIR, "..", "..", ".."))
if _NEXUS_PYTHON not in sys.path:
    sys.path.insert(0, _NEXUS_PYTHON)

import nexus_core.wrp as wrp                                     # noqa: E402
from nexus_core.wrp.compile import (                             # noqa: E402
    CCNF_VERSION,
    locked_ccnf_version,
    manifest_matches_constant,
)

_WRP_DIR = os.path.abspath(os.path.join(_SELF_DIR, ".."))

# Version-1 public interface (the __init__.py re-exports). Additive-only within
# a version: new names may be appended, but none may be removed or renamed.
PINNED_INTERFACE_V1 = frozenset({
    "WRP_ADJACENCY_MATRIX",
    "RECEIPT_TO_WRP_STATE",
    "is_valid_transition",
    "KernelDelta",
    "KernelDeltaBatch",
    "KernelError",
    "KernelResult",
    "KernelSnapshot",
    "make_address",
    "parse_address",
})

# T05 contract matrix rule 2 — forbidden reverse dependencies for the core.
_FORBIDDEN_PREFIXES = ("nexus_core.harness", "tackle")


def _runtime_modules():
    """Yield paths of shipped wrp modules (excludes tests)."""
    out = []
    for name in sorted(os.listdir(_WRP_DIR)):
        if name.endswith(".py") and not name.startswith("test_"):
            out.append(os.path.join(_WRP_DIR, name))
    return out


def _absolute_imports(path):
    """Return [(lineno, module), ...] for absolute imports in a file."""
    with open(path, encoding="utf-8") as f:
        tree = ast.parse(f.read())
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                out.append((node.lineno, alias.name))
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:
                out.append((node.lineno, node.module))
    return out


class TestInterfaceVersion(unittest.TestCase):
    """wr-conf-016 — versioned interface + dependency-free boundary."""

    def test_ac1_public_interface_pinned(self):
        actual = set(wrp.__all__)
        self.assertEqual(actual, PINNED_INTERFACE_V1,
                         "public interface drifted from the version-1 pin "
                         f"(extra={sorted(actual - PINNED_INTERFACE_V1)}, "
                         f"missing={sorted(PINNED_INTERFACE_V1 - actual)})")
        # Every declared export must actually resolve from the package.
        for name in PINNED_INTERFACE_V1:
            self.assertTrue(hasattr(wrp, name), f"{name} missing from package")

    def test_ac2_ccnf_version_locked(self):
        self.assertEqual(CCNF_VERSION, 1, "embedded CCNF_VERSION drifted")
        self.assertTrue(manifest_matches_constant(),
                        "CCNF_VERSION manifest != embedded constant")
        self.assertEqual(locked_ccnf_version(), 1,
                         "locked_ccnf_version() did not return the locked version")

    def test_ac3_dependency_free_core(self):
        stdlib = set(sys.stdlib_module_names)
        offenders = []
        for path in _runtime_modules():
            for lineno, module in _absolute_imports(path):
                top = module.split(".")[0]
                if top != "nexus_core" and top not in stdlib:
                    offenders.append((path, lineno, module))
        self.assertEqual(offenders, [],
                         f"non-stdlib/non-core imports in nexus_core/wrp: {offenders}")

    def test_ac4_no_forbidden_reverse_dependency(self):
        offenders = []
        for path in _runtime_modules():
            for lineno, module in _absolute_imports(path):
                for forbidden in _FORBIDDEN_PREFIXES:
                    if module == forbidden or module.startswith(forbidden + "."):
                        offenders.append((path, lineno, module))
        self.assertEqual(offenders, [],
                         f"forbidden reverse dependency in nexus_core/wrp: {offenders}")


if __name__ == "__main__":
    unittest.main()
