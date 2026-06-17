#!/usr/bin/env python3
"""Stage 4 — Structural Validation Gate (CIR-1).

Exits 0 if no violations found, 1 if any unresolved phantom references exist.
Can be wired into CI as a pre-flight gate.
"""

import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
violations = []

for path in sorted(ROOT.rglob("*.json")):
    if ".git" in path.parts:
        continue
    if ".agent/scripts" in str(path):
        continue
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, PermissionError):
        continue

    def check(obj, ctx=""):
        if isinstance(obj, dict):
            if "intent_source" in obj:
                v = obj["intent_source"]
                if isinstance(v, str) and ("nexus/.conduit-data/" in v or "PIPELINE_" in v):
                    violations.append((str(path), ctx, str(v)))
            for k, v in obj.items():
                check(v, f"{ctx}.{k}" if ctx else k)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                check(v, f"{ctx}[{i}]")

    check(data)

if violations:
    print("CIR-1 VIOLATIONS DETECTED:")
    print()
    for path, ctx, val in violations:
        print(f"  {path}")
        print(f"    at: {ctx}")
        print(f"    value: {val}")
        print()
    print(f"Total: {len(violations)} violation(s)")
    print("Fix: Remove or downgrade unresolvable references per CIR-1.")
    sys.exit(1)

print("CIR-1 OK — all references resolvable or explicitly downgraded")
sys.exit(0)
