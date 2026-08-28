#!/usr/bin/env python3
"""W2.05 publication/preflight gate for governance contract bundles.

Runs the W1.07 CUE cross-artifact validation bundle as a FAIL-CLOSED gate
that must pass BEFORE a workflow/service projection is published or admitted.
Reuses the W1.07 runner machinery (build_gen_inputs, evaluate_module,
stage_verdicts) so the gate and the scenario matrix can never drift apart.

    python3 publish_gate.py gates/admission-surface-v3.json
    python3 publish_gate.py gates/admission-surface-v3.json --out-dir out/gates

Per accepted W2.05 criteria the gate:
  * treats the target bundle as a publication candidate (expectation: pass),
  * persists a normalized publication manifest + diagnostics covering
      - contract artifact / version / digest,
      - operation and Wind node refs,
      - JSON-LD context / version,
      - proposition / doctrine / posture refs,
      - environment consistency (endpoints, version cap, modes),
  * exits 0 only when ZERO violations fired and the AC4 non-authority policy
    assertion holds; exits 2 otherwise (blocked).

CUE remains structural validation: it never evaluates SOL, mints PEB
authority, or mutates Conduit state (AC4 asserted every run).
"""

from __future__ import annotations

import copy
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = Path(__file__).resolve().parents[5]

sys.path.insert(0, str(HERE))

from run_bundle import (  # noqa: E402
    CHECK_ORDER,
    build_gen_inputs,
    ensure_pins,
    evaluate_module,
    stage_verdicts,
)

GATES_DIR = HERE / "gates"
OUT_DIR = HERE / "out" / "gates"

# Coverage sections the W2.05 manifest MUST carry (see body of W2.05 todo).
REQUIRED_COVERAGE = [
    "contract",          # artifact / version / digest
    "operation_wind",    # operation + Wind node refs
    "jsonld",            # JSON-LD context / version
    "refs",              # proposition / doctrine / posture refs
    "environment",       # endpoints / version cap / mode consistency
]


def _verify_ac4_policy() -> tuple[bool, str]:
    """Re-assert the W1.07 non-authority boundary independently of inputs."""
    import shutil
    import subprocess
    import tempfile

    expected = {
        "live_lease_state": False,
        "doctrine_authorship": False,
        "sol_evaluation": False,
        "conduit_mutation": False,
        "note": "CUE validates cross-artifact consistency at build/publication time only.",
    }
    with tempfile.TemporaryDirectory(prefix="w205-policy-") as tmp:
        root = Path(tmp)
        for rel in ["cue.mod/module.cue", "schema.cue"]:
            dst = root / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(HERE / rel, dst)
        res = subprocess.run(
            ["cue", "export", "--out", "json", "-e", "policy_non_authority"],
            cwd=root, capture_output=True, text=True,
        )
        if res.returncode != 0:
            return False, res.stderr.strip()[:240]
        try:
            got = json.loads(res.stdout or "{}")
        except json.JSONDecodeError:
            return False, "policy export returned non-JSON"
        if got != expected:
            return False, f"policy mismatch: {got}"
    return True, "AC4 non-authority boundary holds"


def run_gate(gate_path: Path, out_dir: Path) -> int:
    gate = json.loads(gate_path.read_text())
    gate_name = gate.get("gate_name") or gate_path.stem
    description = gate.get("description", "")

    if gate.get("expectation") not in (None, "pass"):
        raise ValueError(
            f"{gate_name}: gate specs must expect 'pass' (a gate is a "
            f"publication candidate, not a violation fixture)"
        )

    # build_gen_inputs consumes scenario-shaped dicts; a gate spec IS one,
    # with empty mutations + a target environment.
    gen_inputs, canon_env, digest_probes = build_gen_inputs(gate)
    root, raw_stages, vet_err = evaluate_module(gen_inputs)

    fired: dict[str, list[dict]] = {}
    for stage, (data, err) in raw_stages.items():
        fired[stage] = stage_verdicts(stage, data, err)

    fired_codes = {
        v["code"] for vs in fired.values() for v in vs if v["fired"]
    }
    violations = {
        stage: [
            {"code": v["code"], "detail": v["detail"]}
            for v in vs if v["fired"]
        ]
        for stage, vs in fired.items()
    }
    violations = {k: v for k, v in violations.items() if v}

    policy_ok, policy_detail = _verify_ac4_policy()
    blocked = bool(fired_codes) or not policy_ok
    if vet_err and not root.get("check"):
        blocked = True
        violations.setdefault("cue_evaluation", [
            {"code": "CUE-EVALUATION-ERROR", "detail": vet_err.strip()[:240]},
        ])

    contract = canon_env["contract"]
    workflow = canon_env["workflow"]
    semantic = canon_env["semantic"]
    law = canon_env["law"]
    env = gate["environment"]

    manifest = {
        "manifest_version": 1,
        "generator": {
            "name": "nexus.local/governance-envelope-validation",
            "runner": "publish_gate.py",
            "spec_item": "W2.05",
            "base": "W1.07",
        },
        "gate": {
            "name": gate_name,
            "description": description,
            "input_file": str(gate_path.resolve().relative_to(REPO_ROOT)),
        },
        # W2.05 coverage: contract artifact / version / digest
        "contract": {
            "artifact": contract["contract_id"],
            "version": contract["contract_version"],
            "digest": contract["contract_digest"],
            "projection_id": contract.get("projection_id"),
            "projection_version": contract.get("projection_version"),
            "projection_digest": contract.get("projection_digest"),
        },
        # W2.05 coverage: operation and Wind node refs
        "operation_wind": {
            "operation": contract["operation"],
            "workflow_id": workflow["workflow_id"],
            "workflow_version": workflow["workflow_version"],
            "node_id": workflow["node_id"],
        },
        # W2.05 coverage: JSON-LD context / version
        "jsonld": {
            "context": semantic["@context"],
            "subject_id": semantic["subject_id"],
            "subject_type": semantic["subject_type"],
            "envelope_version": canon_env["envelope_version"],
            "evaluation_fingerprint": canon_env["fingerprint"]["evaluation_fingerprint"],
        },
        # W2.05 coverage: proposition / doctrine / posture refs
        "refs": {
            "proposition_ids": law["proposition_ids"],
            "doctrine_ids": law["doctrine_ids"],
            "posture_ids": law.get("posture_ids") or [],
            "effective_at": law.get("effective_at"),
        },
        # W2.05 coverage: environment consistency
        "environment": {
            "logical_name": env["contract_logical_name"],
            "version_recorded_in_manifest": env["contract_version_recorded_in_manifest"],
            "version_cap": env.get("version_cap", {}),
            "endpoints": env.get("endpoints", {}),
            "jsonld_context_base_iri": env["jsonld_context_base_iri"],
            "type_spec_sources_root": env["type_spec_sources_root"],
            "wind_projection_registry_file": env["wind_projection_registry_file"],
            "doctrine_corpus_file": env["doctrine_corpus_file"],
            "endpoints_manifest_file": env["endpoints_manifest_file"],
        },
        "artifacts": [
            {
                "slot": p["slot_name"],
                "manifest_key": p["manifest_key"],
                "recorded_sha256": p["recorded_sha256_hex"],
                "live_sha256": p["live_sha256_hex"],
                "match": p["recorded_sha256_hex"] == p["live_sha256_hex"],
            }
            for p in digest_probes
        ],
        "validations": {
            "stages_run": CHECK_ORDER,
            "violations": violations,
            "fired_codes": sorted(fired_codes),
            "non_authority_policy_ok": policy_ok,
            "non_authority_policy_detail": policy_detail,
        },
        "coverage_sections": REQUIRED_COVERAGE,
        "status": "blocked" if blocked else "admitted_for_publication",
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{gate_name}.publication-manifest.json"
    payload = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    out.write_text(payload)
    digest = hashlib.sha256(payload.encode()).hexdigest()
    print(f"PUBLICATION_MANIFEST_DIGEST: sha256:{digest}")
    print(f"publication manifest -> {out.relative_to(REPO_ROOT)}")
    print(f"status: {manifest['status']}")
    if fired_codes:
        print(f"fired codes: {sorted(fired_codes)}")
    if not policy_ok:
        print(f"AC4 policy: {policy_detail}")

    return 0 if not blocked else 2


def main() -> int:
    ensure_pins()
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    out_dir = OUT_DIR
    if "--out-dir" in sys.argv:
        out_dir = Path(sys.argv[sys.argv.index("--out-dir") + 1])

    if not args:
        targets = sorted(GATES_DIR.glob("*.json"))
        if not targets:
            print(f"FATAL: no gate specs in {GATES_DIR}")
            return 2
    else:
        targets = [Path(a) for a in args]

    results = [run_gate(t, out_dir) for t in targets]
    return 0 if all(r == 0 for r in results) else 2


if __name__ == "__main__":
    sys.exit(main())
