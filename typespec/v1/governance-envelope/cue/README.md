# W1.07 — CUE Cross-Artifact Validation Bundle

Build-time validation for the governance admission envelope bundle. Validates
cross-artifact consistency **before** a workflow or service projection is
published (W1.07, assigned to devops; engineer review).

Consumes the ratified Wave-1 outputs: W1.01 (field contract), W1.03
(compatibility boundary), W1.04 (canonical serialization + fingerprint), the
W1.05 TypeSpec contract (`../spring/`), and W1.06 JSON-LD identity mappings.

## Layout

| File | Role |
|---|---|
| `cue.mod/module.cue` | CUE module root (`nexus.local/governance-envelope-validation`) |
| `schema.cue` | Fail-closed mirror of the envelope wire shapes (structure only) |
| `bundle.cue` | Required inputs, digest-probe type, registry types |
| `checks.cue` | The cross-artifact rules (all real, evaluable CUE) |
| `run_bundle.py` | Deterministic scenario runner + projection-manifest emitter |
| `tests/*.json` | Positive control + one fixture per violation class |
| `publish_gate.py` | W2.05 fail-closed publication/admission gate (reuses the bundle) |
| `gates/*.json` | Publication candidates: must pass with ZERO violations |
| `controls/*.json` | Negative controls for the gate (must be blocked) |
| `conformance/bundle-inputs.json` | Pin manifest: SHA-256 of the module sources |
| `out/*.manifest.json` | Per-run normalized projection manifests (gitignored) |
| `out/gates/*.publication-manifest.json` | W2.05 gate manifests (gitignored) |

## What it checks

Every rule resolves to a boolean / diagnostic list inside `check.*`;
`check.non_authority_boundary` asserts the AC4 scope statement in CUE itself.

| Check | Violation code |
|---|---|
| operation existence | `OPENAPI-OPERATION-NOT-FOUND` |
| Wind node reference resolvable + belongs to declared workflow | `WIND-NODE-REF-DANGLING` |
| proposition/posture refs vs ratified doctrine index; assertion rows declared; no duplicate rows | `DOCTRINE-REF-UNKNOWN-PROPOSITION` / `DOCTRINE-REF-UNKNOWN-POSTURE` |
| JSON-LD context under canonical base; subject refs absolute | `CONTEXT-IRI-VIOLATION` |
| generated artifact digests vs recorded pins (`../conformance/artifact-hashes.json`, module pins here) | `DIGEST-MISMATCH` |
| contract/version alignment vs published version cap; digests align | `CONTRACT-VERSION-MISMATCH` |
| endpoint registered for logical name; URL suffix matches; mode vocabulary; mode vs `environment` frame values | `ENV-CONTRADICTION` |
| refusal shape; allow⇒all assertions true | `INVALID-DISPOSITION-INVARIANT` |

## Scope — non-authority (AC4)

CUE validates **static cross-artifact consistency at build/publication time
only**. It is explicitly non-authoritative for:

- live lease state
- doctrine authorship
- SOL evaluation
- Conduit mutation

The registries consulted here hold **identities and published-surface facts
only** — never law content (no second doctrine store). Envelope field-shape
validation stays with the TypeSpec contract; identifier fields are
deliberately shape-loose here (`#identifier`) because the runtime
canonicalizer passes opaque ids through and rejecting them would exceed the
ratified contracts.

## Usage

```bash
cd nexus/typespec/v1/governance-envelope/cue

python3 run_bundle.py --update-pins   # after INTENTIONAL edits to schema/bundle/checks
python3 run_bundle.py                 # full scenario matrix; exit 0 = behaved as declared
python3 run_bundle.py tests/vc_env_contradiction.json   # single scenario
```

Scenario files declare mutations applied to the W1.04 golden envelope V1, a
target environment (registries, endpoints, version caps, probes), the
expectation, and the exact expected violation code + stage.

After intentional module-source changes the pin goes stale by design — that
stale-pin signal IS the generated-artifact guard working; re-record with
`--update-pins`.

## W2.05 — publication/admission gate

`publish_gate.py` runs the same CUE bundle as a fail-closed gate: a bundle
candidate must produce ZERO violations and hold the AC4 non-authority
policy assertion before it may be published or admitted. Exit 0 =
admitted for publication; exit 2 = blocked.

```bash
python3 publish_gate.py gates/admission-surface-v3.json   # single candidate
python3 publish_gate.py                                  # all gates/*.json
python3 publish_gate.py controls/admission-surface-v3-tampered.json  # negative control → exit 2
```

Each run persists a timestamp-free, deterministic publication manifest
(identical bytes across repeat runs) covering the W2.05-required surface:
contract artifact/version/digest, operation + Wind node refs, JSON-LD
context/version, proposition/doctrine/posture refs, and environment
consistency. CUE remains structural validation — never SOL evaluation or
PEB authority (AC4 asserted every run, and `policy_non_authority` is
re-verified independently of the inputs).

## Runner notes

- Inputs are injected as a generated `gen_inputs.cue` (NOT `_gen_inputs.cue`:
  underscore-prefixed files are ignored by CUE package loading).
- The evaluation fingerprint group is regenerated per mutated scenario so
  fixtures stay internally coherent; cross-language fingerprint conformance
  remains W1.11/W1.09 scope.
- Emitted projection manifests are timestamp-free: identical runs produce
  identical bytes and identical `PROJECTION_MANIFEST_DIGEST` values.
