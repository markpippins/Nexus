#!/usr/bin/env python3
"""Stage 0a — AST-safe JSON field extraction.

Scans all .json files for fields matching CIR-1 suspect patterns.
Outputs structured (path, key, value) tuples.
"""

import json
import sys
from pathlib import Path

SUSPECT_KEYS = {"intent_source", "pipeline", "mode", "execution",
                "intent_source", "skill_ref", "mode_router"}

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
suspects = []

for path in sorted(ROOT.rglob("*.json")):
    if ".git" in path.parts:
        continue
    if ".agent/scripts" in str(path):
        continue
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, PermissionError):
        continue

    def walk(obj, context=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                ctx = f"{context}.{k}" if context else k
                if k in SUSPECT_KEYS:
                    suspects.append((str(path), k, json.dumps(v)))
                walk(v, ctx)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                walk(v, f"{context}[{i}]")

    walk(data)

for s in suspects:
    print(f"{s[0]}|{s[1]}|{s[2]}")
