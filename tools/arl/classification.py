"""
CIR-SDM artifact classification pass.
Maps every tracked file into exactly one domain.
Fail if ambiguous, multi-role, or unclassified.

Usage:
    from arl.classification import run
    classified = run(paths, violations)
"""

import json
from pathlib import Path

DOMAIN_LABELS = [
    "SCHEMA",
    "CONFIG",
    "LEDGER",
    "STATE_MACHINE",
    "CODE",
    "METADATA",
    "DATA",
    "BUILD",
]

EXACT_NAME_ROLES = {
    "work_request.schema.json":     "SCHEMA",
    "pipeline-mode.json":           "CONFIG",
    "transition_ledger.json":       "LEDGER",
    "pgv.state_machine.json":       "STATE_MACHINE",
    "pgv.phase":                    "STATE_MACHINE",
    "native_domains.json":          "METADATA",
    "golden_identity.json":         "DATA",
}

PATH_PATTERN_ROLES = [
    ("/schema/",        "SCHEMA"),
    ("/vectors/",       "DATA"),
    ("/testdata/",      "DATA"),
    ("/tests/",         "DATA"),
    ("/samples/",       "DATA"),
    ("/golden/",        "DATA"),
    ("/build/",         "BUILD"),
    ("/target/",        "BUILD"),
    ("node_modules",    "BUILD"),
    ("__pycache__",     "BUILD"),
    (".git",            "BUILD"),
]

EXTENSION_ROLES = {
    ".py":  "CODE",
    ".go":  "CODE",
    ".rs":  "CODE",
    ".sh":  "CODE",
    ".yaml": "METADATA",
    ".yml":  "METADATA",
    ".toml": "METADATA",
    ".md":   "METADATA",
    ".json": None,
    "":      "METADATA",
}

IGNORED_PATTERNS = [
    "package-lock.json",
    "package.json",
    ".angular/",
    ".cache/",
]

def classify_one(path: Path) -> str | None:
    p = path.as_posix().lstrip("./")

    for ign in IGNORED_PATTERNS:
        if ign in p:
            return None

    name_match = EXACT_NAME_ROLES.get(path.name)
    if name_match is not None:
        return name_match

    for pattern, role in PATH_PATTERN_ROLES:
        if pattern in p:
            return role

    ext_role = EXTENSION_ROLES.get(path.suffix)
    if ext_role is not None:
        return ext_role

    if path.suffix == ".json":
        return "METADATA"

    return None


def run(paths: list[Path], violations: list[dict]) -> dict[str, str]:
    classified = {}
    for p in sorted(paths):
        if not p.is_file():
            continue
        role = classify_one(p)
        if role is not None:
            classified[str(p)] = role
    return classified
