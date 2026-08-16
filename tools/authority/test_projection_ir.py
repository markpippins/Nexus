"""Conformance tests for tools/authority/projection_ir.py (Wave 3, W3-5).

Run with:
    python3 -m pytest tools/authority/test_projection_ir.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import projection_ir as pir  # noqa: E402


def test_manifest_adapts_cleanly():
    manifest = pir.load_manifest()
    stream = pir.adapt_all(manifest)
    assert len(stream) == len(manifest["projections"]) >= 8
    schema = pir.load_schema()
    for entry in stream:
        ok, reason = pir.validate(entry, schema)
        assert ok, f"{entry['domain']}: {reason}"


def test_entry_shape_matches_spec():
    entry = pir.adapt_entry({
        "sourceSchema": "schemas/wrp/work-request.schema.json",
        "targetFormat": "json-ld",
        "generator": "manual",
        "outputPath": "schemas/core/work-request.jsonld",
        "lifecycle": "on-schema-change",
        "active": True,
    })
    assert set(entry.keys()) == {"source_operator", "domain", "proposition",
                                 "confidence", "constraints", "trace"}
    assert entry["source_operator"] == "projection-manifest"
    assert entry["domain"] == "json-ld"
    assert entry["confidence"] == 1.0
    assert entry["constraints"]  # CIRS-IR rules present
    assert entry["trace"] == ["schemas/wrp/work-request.schema.json"]


def test_confidence_inactive_is_speculative():
    entry = pir.adapt_entry({
        "sourceSchema": "schemas/core/service.jsonld",
        "targetFormat": "angular-service",
        "outputPath": "x.ts",
        "active": False,
    })
    assert entry["confidence"] == 0.5


def test_proposition_carries_manifest_metadata():
    entry = pir.adapt_entry({
        "sourceSchema": "schemas/core/knowledge-graph.jsonld",
        "targetFormat": "postgres-ddl",
        "generator": "manual",
        "outputPath": "schemas/projections/knowledge-graph.sql",
        "lifecycle": "on-schema-change",
        "active": True,
    })
    assert entry["proposition"]["outputPath"] == "schemas/projections/knowledge-graph.sql"
    assert entry["proposition"]["generator"] == "manual"
    assert entry["trace"] == ["schemas/core/knowledge-graph.jsonld"]


def test_validation_rejects_bad_entry():
    bad = {"source_operator": "", "domain": "x", "confidence": 2.0,
           "constraints": [], "trace": []}
    ok, reason = pir.validate(bad)
    assert not ok
    assert reason


def test_validation_accepts_valid_entry():
    entry = pir.adapt_entry({
        "sourceSchema": "schemas/wrp/work-request.schema.json",
        "targetFormat": "json-ld",
        "outputPath": "schemas/core/work-request.jsonld",
        "active": True,
    })
    ok, reason = pir.validate(entry)
    assert ok, reason
