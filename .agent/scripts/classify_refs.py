#!/usr/bin/env python3
"""Stage 1 — Classification Pass (no edits).

Reads ref_index.txt and classifies each reference by type.
"""

import re
import sys

def classify(line: str) -> str:
    if "intent_source" in line and ".pipeline/" in line:
        return "PIPELINE_PHANTOM"
    if ".pipeline/" in line:
        return "PIPELINE_PHANTOM"
    if "PIPELINE_" in line:
        return "DERIVATION_CONTRACT"
    if "ExecutionState" in line:
        return "RUNTIME_ASSUMPTION"
    if "ExecutorRegistry" in line:
        return "UNIMPLEMENTED_REGISTRY"
    if "DCO" in line or "work_request" in line.lower():
        return "ASPIRATIONAL_SCHEMA"
    if "skill_ref" in line:
        return "SKILL_REFERENCE"
    return "UNKNOWN"

INPUT = sys.argv[1] if len(sys.argv) > 1 else "ref_index.txt"

categories = {}

try:
    with open(INPUT) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            cat = classify(line)
            categories.setdefault(cat, []).append(line)
except FileNotFoundError:
    print(f"[classify] {INPUT} not found — run scan_refs.sh first")
    sys.exit(1)

print("=== CIR-1 Classification Report ===\n")
for cat in sorted(categories.keys()):
    entries = categories[cat]
    print(f"\n[{cat}] ({len(entries)} entries)")
    for e in entries[:10]:
        print(f"  {e}")
    if len(entries) > 10:
        print(f"  ... and {len(entries) - 10} more")

print(f"\n--- Total: {sum(len(v) for v in categories.values())} references classified ---")
