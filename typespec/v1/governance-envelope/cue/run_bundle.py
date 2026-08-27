#!/usr/bin/env python3
"""W1.07 bundle runner — deterministic cross-artifact validation scenarios.

Evaluates every scenario in ./tests against the CUE validation bundle and
verifies each behaves exactly as declared:

    python3 run_bundle.py                       # full matrix
    python3 run_bundle.py tests/vc_env_contradiction.json
    python3 run_bundle.py --update-pins         # refresh source-pin digests

Per accepted W1.07 criteria this emits:
  * determinstic pass/fail evidence per scenario (AC1/AC2),
  * diagnostics citing the exact artifact and CUE path at fault (AC3),
  * an explicit non-authority policy assertion result (AC4),
  * a normalized projection manifest + its SHA-256 digest (AC5).

Exit 0 when every scenario behaved exactly as expected; 2 otherwise.
"""

from __future__ import annotations

import copy
import datetime
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent                     # .../governance-envelope/cue
PKG = HERE.parent                                          # .../governance-envelope
REPO_ROOT = Path(__file__).resolve().parents[5]            # /home/codex/dev

sys.path.insert(0, str(REPO_ROOT / "nexus" / "python" / "governance-envelope" / "src"))
sys.path.insert(0, str(REPO_ROOT / "nexus" / "python" / "governance-envelope" / "tests"))

from governance_envelope.canonical import canonicalize  # noqa: E402
from governance_envelope import evaluate_fingerprint  # noqa: E402
from fixtures import V1_ENVELOPE  # type: ignore[import-not-found]  # noqa: E402

MODULE_FILES = ["cue.mod/module.cue", "schema.cue", "bundle.cue", "checks.cue"]
PINNED_SOURCES = ["schema.cue", "bundle.cue", "checks.cue"]

ARTIFACT_HASHES = PKG / "conformance" / "artifact-hashes.json"
BUNDLE_PINS = HERE / "conformance" / "bundle-inputs.json"
OUT_DIR = HERE / "out"

# ---------------------------------------------------------------------------
# Ratified Wave-1 surface facts the runner injects (provenance noted inline;
# these mirror ../spring/operations.tsp and the Wind WR series node ids).
# ---------------------------------------------------------------------------

DEFAULT_OPERATION_TABLE = {
    "admit_execution":   {"path": "/api/v1/governance/admission/admit",     "method": "POST"},
    "evaluate_envelope": {"path": "/api/v1/governance/admission/evaluate",  "method": "POST"},
    "get_envelope":      {"path": "/api/v1/governance/envelopes/{envelopeId}", "method": "GET"},
    "list_envelopes":    {"path": "/api/v1/governance/envelopes",           "method": "GET"},
}

DEFAULT_WIND_NODES = {
    "node-admission": {"id": "node-admission", "workflow": "wf-0007", "node_kind": "decision"},
    "node-execution": {"id": "node-execution", "workflow": "wf-0007", "node_kind": "process"},
    "node-promotion": {"id": "node-promotion", "workflow": "wf-0007", "node_kind": "decision"},
}

CHECK_ORDER = [
    "operation_existence",
    "wind_node_reference",
    "protocol_refs",
    "jsonld_identity",
    "generated_artifacts_pinned",
    "contract_and_projection_digest_alignment",
    "endpoint_environment_consistency",
    "envelope_self_consistency",
]


def sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def combined_source_digest() -> str:
    h = hashlib.sha256()
    for name in PINNED_SOURCES:
        h.update(name.encode())
        h.update(b"\n")
        h.update((HERE / name).read_bytes())
    return h.hexdigest()


# ---------------------------------------------------------------------------
# pin maintenance
# ---------------------------------------------------------------------------

def update_pins() -> None:
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    pins = {
        "files": {name: sha256_file(HERE / name) for name in PINNED_SOURCES},
        "combined": combined_source_digest(),
        "generated_at_utc": now,
    }
    BUNDLE_PINS.parent.mkdir(parents=True, exist_ok=True)
    BUNDLE_PINS.write_text(json.dumps(pins, indent=2) + "\n")
    print(f"recorded pin manifest -> {BUNDLE_PINS.relative_to(REPO_ROOT)}")


def ensure_pins() -> dict:
    if not BUNDLE_PINS.exists():
        print(f"FATAL: {BUNDLE_PINS} missing — run `run_bundle.py --update-pins` first")
        sys.exit(2)
    return json.loads(BUNDLE_PINS.read_text())


# ---------------------------------------------------------------------------
# scenario composition
# ---------------------------------------------------------------------------

def apply_mutation(obj: dict, dotted: str, value) -> None:
    keys = dotted.split(".")
    tgt = obj
    for k in keys[:-1]:
        tgt = tgt.setdefault(k, {})
    tgt[keys[-1]] = value


def build_digest_probes(scenario_env: dict) -> list[dict]:
    hashes = json.loads(ARTIFACT_HASHES.read_text())
    probes = [{
        "slot_name": "openapi_generated_artifact",
        "manifest_file": "nexus/typespec/v1/governance-envelope/conformance/artifact-hashes.json",
        "manifest_key": "openapi.yaml",
        "live_sha256_hex": sha256_file(PKG / "spring" / "generated" / "openapi.yaml"),
        "recorded_sha256_hex": hashes["openapi.yaml"],
    }]
    pins = ensure_pins()
    probes.append({
        "slot_name": "cue_module_sources",
        "manifest_file": "nexus/typespec/v1/governance-envelope/cue/conformance/bundle-inputs.json",
        "manifest_key": "combined",
        "live_sha256_hex": combined_source_digest(),
        "recorded_sha256_hex": pins["combined"],
    })
    for extra in scenario_env.pop("extra_digest_probes", []):
        live_hex = hashlib.sha256(b"".join(
            (HERE / f).read_bytes() for f in extra["live_files"])).hexdigest()
        probes.append({
            "slot_name": extra["slot_name"],
            "manifest_file": "(scenario)",
            "manifest_key": extra["manifest_key"],
            "live_sha256_hex": live_hex,
            "recorded_sha256_hex":
                extra.get("recorded_sha256_hex_override") or live_hex,
        })
    return probes


def build_gen_inputs(scenario: dict) -> tuple[str, dict, list[dict]]:
    """Return (gen file content, canonical envelope, digest probes)."""
    envelope = copy.deepcopy(V1_ENVELOPE)
    for m in scenario.get("mutations", []):
        apply_mutation(envelope, m["path"], m["set"])

    # Canonical form first: timestamps/UUIDs/IRIs meet W1.04 shapes so the
    # mirror schema in schema.cue binds them exactly.
    canon = canonicalize(envelope)
    # Append the fingerprint group (W1.04 shape), as the W1.05 conformance
    # harness does for wire envelopes. Recomputed after mutations so fixtures
    # stay internally coherent — regeneration, not validation: CUE treats the
    # fingerprint string as opaque (cross-language agreement is W1.11 scope).
    canon["fingerprint"] = {
        "evaluation_fingerprint": evaluate_fingerprint(canon),
        "fingerprint_algorithm": "sha256",
        "fingerprint_version": 1,
    }

    law = copy.deepcopy(canon["law"])
    if law.get("posture_ids") is None:
        law["posture_ids"] = []

    sem = canon["semantic"]
    refs = []
    sr = sem.get("subject_ref")
    if isinstance(sr, str):
        refs.append(sr)

    env_raw = copy.deepcopy(scenario["environment"])
    digest_probes = build_digest_probes(env_raw)
    env_cue = {
        "contract_logical_name": env_raw["contract_logical_name"],
        "contract_version_recorded_in_manifest":
            env_raw["contract_version_recorded_in_manifest"],
        "jsonld_context_base_iri": env_raw["jsonld_context_base_iri"],
        "type_spec_sources_root": env_raw["type_spec_sources_root"],
        "wind_projection_registry_file": env_raw["wind_projection_registry_file"],
        "doctrine_corpus_file": env_raw["doctrine_corpus_file"],
        "endpoints_manifest_file": env_raw["endpoints_manifest_file"],
        "digest_probes": digest_probes,
        "endpoints": env_raw["endpoints"],
    }
    registries = {
        "typeSpecOperationPathTable": DEFAULT_OPERATION_TABLE,
        "windWorkflowNodeProjectionRegistry": DEFAULT_WIND_NODES,
        "ratifiedDoctrinePropositionIDRegistry":
            env_raw.get("doctrine_proposition_ids", []),
        "ratifiedPostureIdentityRegistry": env_raw.get("posture_ids", []),
        "governanceVersionCapRegistry": {
            k: {"latest_published_version": v}
            for k, v in env_raw.get("version_cap", {}).items()
        },
    }

    def js(v) -> str:
        return json.dumps(v, separators=(",", ":"), ensure_ascii=False)

    body = ["package validation"]
    body.append(f"envelope: {js(canon)}")
    body.append(f"law_under_evaluation: {js(law)}")
    body.append(f"normalized_identity: {js({'context_iri': sem['@context'], 'subject_refs': refs})}")
    body.append(f"environment: {js(env_cue)}")
    body.append(f"typeSpecOperationPathTable: {js(registries['typeSpecOperationPathTable'])}")
    body.append(f"windWorkflowNodeProjectionRegistry: {js(registries['windWorkflowNodeProjectionRegistry'])}")
    body.append(f"ratifiedDoctrinePropositionIDRegistry: {js(registries['ratifiedDoctrinePropositionIDRegistry'])}")
    body.append(f"ratifiedPostureIdentityRegistry: {js(registries['ratifiedPostureIdentityRegistry'])}")
    body.append(f"governanceVersionCapRegistry: {js(registries['governanceVersionCapRegistry'])}")
    return "\n".join(body) + "\n", canon, digest_probes


# ---------------------------------------------------------------------------
# CUE evaluation
# ---------------------------------------------------------------------------

def run_cue(cwd: Path, args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(["cue", *args], cwd=cwd, capture_output=True, text=True)


VERDICT_RULES = {
    # stage -> list of (code, [boolean keys], [violation-list keys])
    "operation_existence": [
        ("OPENAPI-OPERATION-NOT-FOUND", ["operation_known"], []),
    ],
    "wind_node_reference": [
        ("WIND-NODE-REF-DANGLING",
         ["node_in_registry", "node_belongs_to_declared_workflow"], []),
    ],
    "protocol_refs": [
        ("DOCTRINE-REF-UNKNOWN-PROPOSITION",
         ["assertion_rows_all_declared", "no_duplicate_assertion_rows"],
         ["dangling_proposition_refs", "rows_missing_declaration", "duplicate_row_ids"]),
        ("DOCTRINE-REF-UNKNOWN-POSTURE", [], ["dangling_posture_refs"]),
    ],
    "jsonld_identity": [
        ("CONTEXT-IRI-VIOLATION", ["context_under_canonical_base"],
         ["subject_ref_violations"]),
    ],
    "generated_artifacts_pinned": [
        ("DIGEST-MISMATCH", ["pinned_slots_match_live_bytes"], ["mismatched_slots"]),
    ],
    "contract_and_projection_digest_alignment": [
        ("CONTRACT-VERSION-MISMATCH",
         ["version_cap_registered", "version_not_beyond_published_cap"], []),
        ("DIGEST-MISMATCH", ["all_recorded_digests_align"], []),
    ],
    "endpoint_environment_consistency": [
        ("ENV-CONTRADICTION",
         ["endpoint_declared_for_contract", "url_path_matches_contract_name",
          "mode_consistent_with_env_frames"],
         ["environment_frame_conflicts"]),
    ],
    "envelope_self_consistency": [
        ("INVALID-DISPOSITION-INVARIANT",
         ["refusal_shape_consistent", "allow_implies_all_assertions_true"], []),
    ],
}


def stage_verdicts(stage: str, data: dict | None, err: str | None) -> list[dict]:
    if data is None:
        tail = (err or "").strip().splitlines()
        detail = tail[-1][:240] if tail else "no output"
        return [{"code": "CUE-EVALUATION-ERROR", "fired": True, "detail": detail}]
    out = []
    for code, bool_keys, list_keys in VERDICT_RULES.get(stage, []):
        violated, parts = False, []
        for k in bool_keys:
            v = data.get(k)
            parts.append(f"{k}={v!r}")
            if v is not True:
                violated = True
        for k in list_keys:
            v = data.get(k, [])
            if v:
                violated = True
                parts.append(f"{k}={v!r}"[:220])
        out.append({"code": code, "fired": violated, "detail": "; ".join(parts)})
    return out


def evaluate_module(gen_inputs: str) -> tuple[dict, dict, str]:
    """Materialize temp module instance; return (root_data_or_empty, per_stage_raw, stderr)."""
    tmp = Path(tempfile.mkdtemp(prefix="w107-run-"))
    try:
        for rel in MODULE_FILES:
            dst = tmp / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(HERE / rel, dst)
        # NOTE: files starting with "_" are ignored by CUE package loading.
        (tmp / "gen_inputs.cue").write_text(gen_inputs)

        vet = run_cue(tmp, ["vet", "-c", "./..."])
        root: dict = {}
        if vet.returncode == 0:
            exp = run_cue(tmp, ["export", "--out", "json"])
            if exp.returncode == 0:
                try:
                    root = json.loads(exp.stdout)
                except json.JSONDecodeError:
                    pass

        raw_stages: dict[str, tuple[dict | None, str]] = {}
        for stage in CHECK_ORDER:
            if root.get("check", {}).get(stage) is not None:
                raw_stages[stage] = (root["check"][stage], "")
                continue
            exp = run_cue(tmp, ["export", "--out", "json", "-e", f"check.{stage}"])
            if exp.returncode == 0:
                try:
                    raw_stages[stage] = (json.loads(exp.stdout), "")
                    continue
                except json.JSONDecodeError:
                    pass
            raw_stages[stage] = (None, exp.stderr or vet.stderr)
        return root, raw_stages, vet.stderr
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
# reporting / AC5 manifest
# ---------------------------------------------------------------------------

def write_manifest(stem: str, canon_envelope: dict, digest_probes: list[dict],
                   endpoints: dict, logical_name: str,
                   fired: dict[str, list[dict]],
                   status_ok: bool, policy_ok: bool) -> Path:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    contract = canon_envelope["contract"]
    # Deliberately timestamp-free: AC1 determinism extends to the emitted
    # projection manifest, so identical runs must produce identical bytes.
    # Run provenance lives in the agent record / change log instead.
    manifest = {
        "manifest_version": 1,
        "generator": {
            "name": "nexus.local/governance-envelope-validation",
            "runner": "run_bundle.py",
            "spec_item": "W1.07",
        },
        "scenario": stem,
        "subject": {
            "envelope_id": canon_envelope["envelope_id"],
            "disposition": canon_envelope["evaluation"]["disposition"],
            "operation": contract["operation"],
            "workflow_id": canon_envelope["workflow"]["workflow_id"],
            "node_id": canon_envelope["workflow"]["node_id"],
        },
        "identity": {
            "contract_id": contract["contract_id"],
            "contract_version": contract["contract_version"],
            "contract_digest": contract["contract_digest"],
            "projection_id": contract.get("projection_id"),
            "projection_version": contract.get("projection_version"),
            "projection_digest": contract.get("projection_digest"),
            "semantic_context": canon_envelope["semantic"]["@context"],
        },
        "law_snapshot": {
            "proposition_ids": canon_envelope["law"]["proposition_ids"],
            "doctrine_ids": canon_envelope["law"]["doctrine_ids"],
            "posture_ids": canon_envelope["law"].get("posture_ids") or [],
            "effective_at": canon_envelope["law"].get("effective_at"),
        },
        "evaluation_fingerprint":
            canon_envelope["fingerprint"]["evaluation_fingerprint"],
        "environment": {
            "logical_name": logical_name,
            "endpoints": endpoints,
        },
        "artifacts": [
            {"slot": p["slot_name"], "manifest_key": p["manifest_key"],
             "recorded_sha256": p["recorded_sha256_hex"],
             "live_sha256": p["live_sha256_hex"],
             "match": p["recorded_sha256_hex"] == p["live_sha256_hex"]}
            for p in digest_probes
        ],
        "validations": {
            s: [{"code": v["code"], "fired": v["fired"]} for v in vs]
            for s, vs in fired.items()
        },
        "non_authority_policy_ok": policy_ok,
        "status": "admitted_for_projection" if status_ok else "blocked",
        "consumers": [
            "W1.05 governance admission TypeSpec surface",
            "W1.09 cross-runtime replay fixtures",
            "deployment/publication gate",
        ],
    }
    out = OUT_DIR / f"{stem}.manifest.json"
    payload = json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
    out.write_text(payload)
    digest = hashlib.sha256(payload.encode()).hexdigest()
    print(f"PROJECTION_MANIFEST_DIGEST: sha256:{digest}")
    print(f"projection manifest -> {out.relative_to(REPO_ROOT)}")
    return out


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------

def run_scenario(path: Path) -> bool:
    scen = json.loads(path.read_text())
    stem = path.stem
    expectation = scen["expectation"]

    gen_inputs, canon_env, digest_probes = build_gen_inputs(scen)
    root, raw_stages, vet_err = evaluate_module(gen_inputs)

    fired: dict[str, list[dict]] = {}
    for stage, (data, err) in raw_stages.items():
        fired[stage] = stage_verdicts(stage, data, err)

    fired_codes_overall = {v["code"] for vs in fired.values() for v in vs if v["fired"]}
    stage_codes = lambda s: {v["code"] for v in fired.get(s, []) if v["fired"]}

    if expectation == "pass":
        ok = not fired_codes_overall and root.get("check") is not None
        allowed: set[str] = set()
    else:
        target = scen["expected_stage"]
        allowed = {scen["expected_code"], *scen.get("secondary_codes", [])}
        ok = scen["expected_code"] in stage_codes(target)
        spurious = fired_codes_overall - allowed
        if spurious:
            ok = False
            print(f"    unexpected additional codes: {sorted(spurious)}")

    scen_env = copy.deepcopy(scen["environment"])

    # ---- AC4 policy assertion (module + schema only; independent of inputs) -
    pol_probe = tempfile.TemporaryDirectory()
    with pol_probe:
        pol_root = Path(pol_probe.name)
        for rel in MODULE_FILES[:2]:
            p = pol_root / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(HERE / rel, p)
        res = run_cue(pol_root, ["export", "--out", "json", "-e", "policy_non_authority"])
        expected_policy = {
            "live_lease_state": False, "doctrine_authorship": False,
            "sol_evaluation": False, "conduit_mutation": False,
            "note": "CUE validates cross-artifact consistency at build/publication time only.",
        }
        policy_ok = res.returncode == 0 and json.loads(res.stdout or "{}") == expected_policy

    if not policy_ok:
        ok = False
        print("    AC4 NON-AUTHORITY POLICY MISMATCH")

    # "ok" means the scenario BEHAVED as declared: pass-scenarios produced
    # zero violations; fail-scenarios fired their exact expected code(s).
    if not ok:
        label = "WRONG <-- UNEXPECTED"
    elif expectation == "fail":
        label = "CAUGHT"
    else:
        label = "PASS"
    print(f"{label}: {stem} (expectation={expectation})")
    for stage, vs in fired.items():
        for v in vs:
            if v["fired"]:
                print(f"    [{stage}] {v['code']}: {v['detail']}")
    if expectation == "pass" and vet_err:
        print(f"    note: vet stderr: {vet_err.strip()[:200]}")

    write_manifest(stem, canon_env, digest_probes,
                   scen_env.get("endpoints", {}),
                   scen_env.get("contract_logical_name", ""),
                   fired, ok, policy_ok)
    return ok


def main() -> int:
    if "--update-pins" in sys.argv:
        update_pins()

    test_dir = HERE / "tests"
    targets = [Path(a) for a in sys.argv[1:] if not a.startswith("--")]
    if not targets:
        targets = sorted(test_dir.glob("*.json"))
    results = [run_scenario(t) for t in targets]
    return 0 if all(results) else 2


if __name__ == "__main__":
    sys.exit(main())
