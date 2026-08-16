#!/usr/bin/env python3
"""
ProjectionIR adapter — projection-manifest → ProjectionIR entries.

The first adapter implementing graph/schema/projection-ir.md §4: converts the
reconciled projection manifest (schemas/projections/projection-manifest.jsonld)
into validated ProjectionIREntry objects. Proves the envelope pattern on real
data: each manifest projection becomes a read-only, ephemeral IR entry with
operator identity, domain, confidence, constraints, and trace lineage.

Usage:
    python tools/authority/projection_ir.py              # adapt real manifest, print stream
    python tools/authority/projection_ir.py --json       # JSON output
    python tools/authority/projection_ir.py --validate   # exit 1 on any invalid entry

Exit codes:
    0 — all entries valid (or no --validate flag)
    1 — invalid entries found
"""

import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
MANIFEST_PATH = REPO_ROOT / "schemas" / "projections" / "projection-manifest.jsonld"
SCHEMA_PATH = REPO_ROOT / "graph" / "schema" / "projection-ir.schema.json"

SOURCE_OPERATOR = "projection-manifest"

# CIRS-IR rules governing manifest projections: projections are epistemic only.
DEFAULT_CONSTRAINTS = ["CIRS-IR-01", "CIRS-IR-07"]


def load_manifest(path=MANIFEST_PATH):
    with open(path) as fh:
        return json.load(fh)


def load_schema(path=SCHEMA_PATH):
    with open(path) as fh:
        return json.load(fh)


def adapt_entry(projection):
    """Convert one manifest projection to a ProjectionIREntry (spec §3)."""
    return {
        "source_operator": SOURCE_OPERATOR,
        "domain": projection.get("targetFormat", "unknown"),
        "proposition": {
            "outputPath": projection.get("outputPath"),
            "generator": projection.get("generator"),
            "lifecycle": projection.get("lifecycle"),
            "active": projection.get("active", True),
        },
        "confidence": 1.0 if projection.get("active", True) else 0.5,
        "constraints": list(DEFAULT_CONSTRAINTS),
        "trace": [projection.get("sourceSchema", "")],
    }


def adapt_all(manifest):
    """Convert the full manifest to a ProjectionIR stream (ordered entries)."""
    return [adapt_entry(p) for p in manifest.get("projections", [])]


def validate(entry, schema=None):
    """Validate an entry against the ProjectionIR JSON Schema.

    Uses jsonschema when available; otherwise falls back to a dependency-free
    structural check mirroring the schema's required fields and constraints.
    Returns (ok, reason).
    """
    if schema is None:
        schema = load_schema()

    try:
        import jsonschema  # type: ignore
        try:
            jsonschema.validate(instance=entry, schema=schema)
            return True, "ok"
        except jsonschema.ValidationError as exc:
            return False, f"schema violation: {exc.message}"
    except ImportError:
        pass

    required = schema.get("required", [])
    missing = [k for k in required if k not in entry]
    if missing:
        return False, f"missing required fields: {missing}"

    if not isinstance(entry.get("source_operator"), str) or not entry["source_operator"]:
        return False, "source_operator must be a non-empty string"
    if not isinstance(entry.get("domain"), str) or not entry["domain"]:
        return False, "domain must be a non-empty string"

    conf = entry.get("confidence")
    if not isinstance(conf, (int, float)) or isinstance(conf, bool) or not (0.0 <= conf <= 1.0):
        return False, f"confidence must be 0.0-1.0, got {conf!r}"

    constraints = entry.get("constraints")
    if not isinstance(constraints, list) or not all(isinstance(c, str) for c in constraints):
        return False, "constraints must be an array of strings"

    trace = entry.get("trace")
    if not isinstance(trace, list) or len(trace) < 1 or not all(isinstance(t, str) for t in trace):
        return False, "trace must reference at least one observation"

    return True, "ok"


def main():
    manifest = load_manifest()
    stream = adapt_all(manifest)

    schema = load_schema()
    failures = []
    for entry in stream:
        ok, reason = validate(entry, schema)
        if not ok:
            failures.append((entry.get("domain"), reason))

    if "--json" in sys.argv:
        print(json.dumps({"stream": stream, "count": len(stream),
                          "valid": len(stream) - len(failures), "failures": failures}, indent=2))
    elif "--validate" in sys.argv:
        if failures:
            for domain, reason in failures:
                print(f"[PROJECTION-IR] INVALID {domain}: {reason}")
            print(f"[PROJECTION-IR] {len(failures)} invalid entry(ies)")
            return 1
        print(f"[PROJECTION-IR] OK — {len(stream)} valid entries (schema: projection-ir.schema.json)")
        return 0
    else:
        for entry in stream:
            print(f"  [{entry['source_operator']}/{entry['domain']}] "
                  f"conf={entry['confidence']} trace={entry['trace'][0]}")
        print(f"[PROJECTION-IR] {len(stream)} entries adapted")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
