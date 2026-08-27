#!/usr/bin/env python3
"""W1.05 conformance verification.

Proves the TypeSpec governance admission envelope contract (W1.05) agrees
with the ratified W1.04 canonical serialization + evaluation fingerprint:

1. The generated OpenAPI artifact hash matches the recorded manifest.
   (`--record` recomputes and rewrites the manifest.)
2. The W1.04 golden envelopes, once the W1.11 fingerprint group is appended,
   validate against the generated `GovernanceEnvelope` schema.
3. Requiredness matches the W1.01 field contract (execution/evidence/authority
   optional; everything else required).
4. Exact disposition/refusal/unknown shapes are exposed (AC1).

Usage:
    python3 verify_contract.py            # verify
    python3 verify_contract.py --record   # recompute + store artifact hashes
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import warnings
from pathlib import Path

import jsonschema
import yaml

REPO_ROOT = Path(__file__).resolve().parents[5]  # /home/codex/dev
PKG_DIR = Path(__file__).resolve().parents[1]    # governance-envelope/
OPENAPI = PKG_DIR / "spring" / "generated" / "openapi.yaml"
MANIFEST = PKG_DIR / "conformance" / "artifact-hashes.json"


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_openapi() -> dict:
    return yaml.safe_load(OPENAPI.read_text())


def build_wire_envelopes() -> list[dict]:
    """Build contract-conformant wire envelopes from the W1.04 golden vectors,
    appending the W1.11 fingerprint group."""
    sys.path.insert(0, str(REPO_ROOT / "nexus" / "python" / "governance-envelope" / "src"))
    sys.path.insert(0, str(REPO_ROOT / "nexus" / "python" / "governance-envelope" / "tests"))

    from governance_envelope import evaluate_fingerprint
    from fixtures import V1_ENVELOPE, V2_ENVELOPE, V3_ENVELOPE

    wire = []
    for name, env in (("V1", V1_ENVELOPE), ("V2", V2_ENVELOPE), ("V3", V3_ENVELOPE)):
        e = json.loads(json.dumps(env))  # deep copy
        e["fingerprint"] = {
            "evaluation_fingerprint": evaluate_fingerprint(env),
            "fingerprint_algorithm": "sha256",
            "fingerprint_version": 1,
        }
        wire.append((name, e))
    return wire


def verify_artifacts(record: bool) -> None:
    if not OPENAPI.exists():
        sys.exit(f"FATAL: generated OpenAPI not found at {OPENAPI} — run `npx tsp compile governance-envelope/spring` first")
    digest = sha256(OPENAPI)
    manifest = {"openapi.yaml": digest, "generated_at_utc": None}
    if record:
        import datetime
        manifest["artifact"] = "nexus/typespec/v1/governance-envelope/spring/generated/openapi.yaml"
        manifest["generated_at_utc"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n")
        print(f"recorded {digest} -> {MANIFEST.relative_to(REPO_ROOT)}")
        return
    if not MANIFEST.exists():
        sys.exit(f"FATAL: manifest {MANIFEST} missing — run with --record first")
    recorded = json.loads(MANIFEST.read_text())
    if recorded.get("openapi.yaml") != digest:
        sys.exit(
            f"FAIL: artifact hash mismatch\n  recorded: {recorded.get('openapi.yaml')}\n  actual:   {digest}\n"
            f"  (regenerate with --record after an intentional contract change)"
        )
    print(f"artifact hash OK: {digest[:16]}…")


def verify_schema_conformance() -> None:
    doc = load_openapi()
    schemas = doc["components"]["schemas"]

    # --- AC1: exact disposition / refusal / unknown shapes -----------------
    disposition = schemas["EnvelopeDisposition"]["enum"]
    assert disposition == ["allow", "reject", "refuse", "unknown"], disposition
    refusal = schemas["RefusalCode"]["enum"]
    for expected in ("stale_doctrine", "contract_digest_mismatch", "unknown_context",
                     "expired_lease", "attempt_mismatch", "evaluator_uncertainty"):
        assert expected in refusal, f"missing refusal code {expected}"
    print(f"AC1 disposition enum: {disposition}")
    print(f"AC1 refusal codes: {len(refusal)} codes")

    # AC2: envelope_version and contract_version are independent fields
    env_schema = schemas["GovernanceEnvelope"]
    contract_schema = schemas["GovernanceContract"]
    assert "envelope_version" in env_schema["required"]
    assert "contract_version" in contract_schema["required"]
    print("AC2 envelope_version + contract_version independent (both explicit)")

    # AC4: contract identity + projection digest present, no law/evaluator payload
    for field in ("contract_id", "contract_version", "contract_digest",
                  "projection_id", "projection_version", "projection_digest"):
        assert field in contract_schema["properties"], field
    assert "proposition_ids" in schemas["LawSnapshot"]["properties"]
    # the contract must NOT embed doctrine law or evaluator implementation
    assert "doctrine" not in contract_schema["properties"]
    assert "law" not in contract_schema["properties"]
    print("AC4 contract identity + projection digest represented; no law/evaluator payload")

    # requiredness vs W1.01: execution/evidence/authority optional, rest required
    required = set(env_schema["required"])
    assert required == {"envelope_version", "envelope_id", "created_at", "contract",
                        "semantic", "workflow", "law", "inputs", "evaluation", "fingerprint"}, required
    print("AC requiredness matches W1.01 (execution/evidence/authority optional)")

    # W1.04 golden envelopes + W1.11 fingerprint group validate against the schema.
    # RefResolver.from_schema(doc) makes `#/components/schemas/...` refs resolve
    # against the OpenAPI document root.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", DeprecationWarning)
        resolver = jsonschema.RefResolver.from_schema(doc)
    envelope_validator = jsonschema.Draft202012Validator(env_schema, resolver=resolver)
    request_schema = schemas["AdmissionRequest"]
    request_validator = jsonschema.Draft202012Validator(request_schema, resolver=resolver)

    for name, wire in build_wire_envelopes():
        errors = sorted(envelope_validator.iter_errors(wire), key=lambda e: e.path)
        assert not errors, f"{name}: envelope schema errors: {[e.message for e in errors]}"
        req = {"envelope": wire}
        errors = sorted(request_validator.iter_errors(req), key=lambda e: e.path)
        assert not errors, f"{name}: request schema errors: {[e.message for e in errors]}"
        print(f"golden vector {name}: envelope + AdmissionRequest validate against contract")

    print("schema conformance OK")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--record", action="store_true", help="recompute and store artifact hashes")
    args = ap.parse_args()
    verify_artifacts(record=args.record)
    if not args.record:
        verify_schema_conformance()


if __name__ == "__main__":
    main()