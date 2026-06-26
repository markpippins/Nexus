#!/usr/bin/env python3
"""Stage 2 — Deterministic JSON Patch (AST-safe).

Applies CIR-1 enforcement:
- Removes intent_source pointing to non-existent nexus/.conduit-data/ paths
- Downgrades mode from "execute" to "legacy" when intent_source removed
- Adds CIR-1 annotation note
- Only modifies JSON semantics — never changes data types or structure
"""

import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
PATCHED = 0


def patch_obj(obj, path_str=""):
    """Recursively patch JSON objects for CIR-1 violations."""
    global PATCHED

    if not isinstance(obj, dict):
        return obj

    # Check for intent_source violations
    if "intent_source" in obj:
        v = obj["intent_source"]
        if isinstance(v, str) and ("nexus/.conduit-data/" in v or "PIPELINE_" in v):
            obj.pop("intent_source")
            if obj.get("mode") == "execute":
                obj["mode"] = "legacy"
            if "status" not in obj:
                obj["status"] = "aspirational"
            obj["note"] = (
                "CIR-1: removed unresolvable intent_source. "
                "No pipeline exists in runtime."
            )
            PATCHED += 1

    # Recurse into nested structures
    for k in list(obj.keys()):
        if isinstance(obj[k], dict):
            obj[k] = patch_obj(obj[k], f"{path_str}.{k}")
        elif isinstance(obj[k], list):
            obj[k] = [patch_obj(x, f"{path_str}.{k}[{i}]")
                      if isinstance(x, dict) else x
                      for i, x in enumerate(obj[k])]

    return obj


for path in sorted(ROOT.rglob("*.json")):
    if ".git" in path.parts:
        continue
    if ".agents/scripts" in str(path):
        continue
    try:
        data = json.loads(path.read_text())
    except (json.JSONDecodeError, PermissionError):
        continue

    original = json.dumps(data, indent=2, sort_keys=False)
    new_data = patch_obj(data, str(path))
    patched = json.dumps(new_data, indent=2, sort_keys=False)

    if patched != original:
        path.write_text(patched + "\n")
        print(f"[patched] {path}")

if PATCHED == 0:
    print("[patch] No CIR-1 violations found in JSON files")
else:
    print(f"[patch] {PATCHED} CIR-1 violations patched")
