#!/usr/bin/env python3
"""
CIR-1 Scan — reference index builder.

Outputs a line-numbered inventory of all CIR-relevant references
across the repository (JSON + text). Used for diagnostics and auditing.
"""

import sys
import subprocess
from pathlib import Path

PATTERNS = (
    "intent_source|"
    "\\.pipeline/|"
    "PIPELINE_|"
    "normalize-intent|"
    "ExecutionState|"
    "DCO|"
    "ExecutorRegistry|"
    "skill_ref|"
    "work_request"
)

ROOT = sys.argv[1] if len(sys.argv) > 1 else "."
OUTPUT = sys.argv[2] if len(sys.argv) > 2 else "cir1_ref_index.txt"

cmd = [
    "rg", "-n", "--no-ignore", "--hidden",
    PATTERNS,
    ROOT,
    "-g", "!.git/**",
    "-g", "!*.py",
    "-g", "!ref_index.txt",
    "-g", "!cir1_ref_index.txt",
]

result = subprocess.run(cmd, capture_output=True, text=True)
lines = result.stdout.strip()

if lines:
    Path(OUTPUT).write_text(lines + "\n")
    count = len(lines.split("\n"))
    print(f"[scan] wrote {OUTPUT} ({count} references)")
else:
    Path(OUTPUT).write_text("")
    print("[scan] no references found")

# Also build a classification summary
classifications = {
    "PIPELINE_PHANTOM": 0,
    "DERIVATION_CONTRACT": 0,
    "ASPIRATIONAL_SCHEMA": 0,
    "RUNTIME_ASSUMPTION": 0,
    "UNIMPLEMENTED_REGISTRY": 0,
    "OTHER": 0,
}

for line in lines.split("\n"):
    if not line:
        continue
    if ".pipeline/" in line:
        classifications["PIPELINE_PHANTOM"] += 1
    elif "PIPELINE_" in line:
        classifications["DERIVATION_CONTRACT"] += 1
    elif "DCO" in line or "work_request" in line.lower():
        classifications["ASPIRATIONAL_SCHEMA"] += 1
    elif "ExecutionState" in line:
        classifications["RUNTIME_ASSUMPTION"] += 1
    elif "ExecutorRegistry" in line:
        classifications["UNIMPLEMENTED_REGISTRY"] += 1
    else:
        classifications["OTHER"] += 1

print("\nClassification:")
for cat, count in classifications.items():
    if count > 0:
        print(f"  {cat}: {count}")
print(f"  Total: {sum(classifications.values())}")
