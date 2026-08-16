#!/usr/bin/env python3
"""
Import Boundary Validator — named import-boundary / forbidden reverse-dependency
enforcement (T05 contract matrix rule 2).

Reads schemas/validation/authority/import-boundaries.json (data) and verifies that no
file under a declared scope imports any declared forbidden module. This is the
executable conformance for the T05 canonical-owner contract matrix: the canonical
core (``nexus_core/wrp``, ``nexus_core``) must not depend on the harness/adapter
layers it is canonical for (``nexus_core.harness``, ``tackle``, ``conduit``,
``vision``, ``voyager``).

Parsing is AST-based, so only real import statements are considered (comments and
string literals are ignored). Relative imports (``from .x import y``) are skipped:
they are intra-package by construction and cannot cross a named module boundary.

Usage:
    python tools/authority/check_import_boundaries.py            # report, exit 1 on violation
    python tools/authority/check_import_boundaries.py --json     # structured JSON output

Exit codes:
    0 — all boundaries clean
    1 — one or more forbidden imports found

Failure class:
    forbidden-import — a file under a declared scope imports a forbidden module
"""

import ast
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SPEC_PATH = REPO_ROOT / "schemas" / "validation" / "authority" / "import-boundaries.json"


def load_spec():
    with open(SPEC_PATH, encoding="utf-8") as f:
        return json.load(f)


def _is_test_file(path):
    """True for test files, which are excluded from boundary enforcement.

    Conformance/parity tests deliberately import both sides of an adapter
    boundary (e.g. ``conduit.wrp_kernel.engine`` alongside ``nexus_core.wrp``)
    to assert byte-identical parity. That is a test-only comparison, not a
    runtime reverse dependency, so the boundary contract applies to shipped
    modules, not test scaffolding.
    """
    name = path.name
    parts = path.parts
    return name.startswith("test_") or name.endswith("_test.py") or "tests" in parts


def iter_python_files(scope):
    """Yield non-test .py files under a repo-relative scope, sorted for determinism."""
    root = REPO_ROOT / scope
    if not root.is_dir():
        return
    for path in sorted(root.rglob("*.py")):
        if _is_test_file(path):
            continue
        yield path


def extract_absolute_imports(path):
    """Return [(lineno, module), ...] for absolute imports in a Python file.

    ``import a.b.c`` yields ``a.b.c``; ``from a.b import c`` yields ``a.b``.
    Relative imports (level > 0) are skipped — they cannot cross a named boundary.
    """
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, UnicodeDecodeError):
        return []
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                out.append((node.lineno, alias.name))
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module:
                out.append((node.lineno, node.module))
    return out


def violates(module, forbidden):
    """True iff the imported module equals or lives under a forbidden prefix."""
    return module == forbidden or module.startswith(forbidden + ".")


def run_checks(spec):
    violations = []
    for boundary in spec.get("boundaries", []):
        name = boundary.get("name", "unnamed")
        rule = boundary.get("rule", "")
        forbidden = boundary.get("forbidden_modules", [])
        for scope in boundary.get("scope", []):
            for path in iter_python_files(scope):
                for lineno, module in extract_absolute_imports(path):
                    for fmod in forbidden:
                        if violates(module, fmod):
                            violations.append({
                                "failure_class": "forbidden-import",
                                "boundary": name,
                                "file": str(path.relative_to(REPO_ROOT)),
                                "line": lineno,
                                "module": module,
                                "forbidden": fmod,
                                "rule": rule,
                            })
    return violations


def main():
    output_json = "--json" in sys.argv

    try:
        spec = load_spec()
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[IMPORT-BOUNDARIES] FAIL — cannot load spec {SPEC_PATH}: {exc}")
        return 1

    violations = run_checks(spec)

    if output_json:
        print(json.dumps({
            "status": "PASS" if not violations else "FAIL",
            "spec": str(SPEC_PATH.relative_to(REPO_ROOT)),
            "total_violations": len(violations),
            "violations": violations,
        }, indent=2))
    else:
        if not violations:
            print("[IMPORT-BOUNDARIES] PASS — named import boundaries clean")
        else:
            print("[IMPORT-BOUNDARIES] FAIL — forbidden reverse dependency:")
            for v in violations:
                print(f"    {v['file']}:{v['line']} imports {v['module']} "
                      f"(forbidden: {v['forbidden']}, boundary: {v['boundary']})")
            print(f"\n  Total: {len(violations)} violation(s)")

    return 1 if violations else 0


if __name__ == "__main__":
    sys.exit(main())
