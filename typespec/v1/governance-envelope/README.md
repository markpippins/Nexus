# Governance Admission Envelope — TypeSpec Contract (W1.05)

Canonical wire boundary for the governance admission envelope. Describes the
request / evaluation / result / receipt shapes with explicit compatibility
annotations. It does **not** embed doctrine law or evaluator implementation —
law is referenced by identity, and evaluation authority remains with SOL/PEB.

Ratified prerequisites: W1.01 (field contract), W1.03 (compatibility
boundary), W1.04 (canonical serialization + evaluation fingerprint).

## Files

- `spring/main.tsp` — service entry (`Governance.Admission`)
- `spring/models.tsp` — envelope, request, evaluation, result, receipt shapes
- `spring/operations.tsp` — `POST /api/v1/governance/admission/evaluate` and `/admit`
- `spring/tspconfig.yaml` — emits OpenAPI 3.1 to `spring/generated/openapi.yaml`
- `conformance/verify_contract.py` — conformance verification (AC5)
- `conformance/artifact-hashes.json` — recorded SHA-256 of the generated artifact

## Generate

```bash
cd nexus/typespec/v1
npx tsp compile governance-envelope/spring
```

## Verify conformance

```bash
python3 governance-envelope/conformance/verify_contract.py
python3 governance-envelope/conformance/verify_contract.py --record  # after intentional contract changes
```

The conformance harness proves:

1. The generated OpenAPI artifact hash matches the recorded manifest (AC5).
2. The W1.04 golden envelopes (V1/V2/V3), with the W1.11 fingerprint group
   appended, validate against the `GovernanceEnvelope` schema — the two
   contracts agree.
3. Requiredness matches W1.01: `execution`/`evidence`/`authority` optional,
   everything else required; optional fields accept `null` (W1.04 canonical
   form) or absence.
4. Exact disposition/refusal shapes: `allow | reject | refuse | unknown` and
   the 12 refusal codes (AC1).

## Contract decisions (ratified)

- `envelope_version` (inside the envelope) and `contract_version` (this
  surface) are independent and explicit (AC2).
- `contract_id`/`contract_digest`/projection digests are identity references —
  a payload constraint can never replace PEB/SOL authority (AC4).
- `assertion_results[]` is ordered; law/evidence identity arrays are unordered
  (W1.04 ratified rulings).
- `refusal_code`, `execution`, `evidence`, `authority`, and other nullable
  fields accept `null` to stay compatible with the W1.04 canonical form.
- `AdmissionReceipt` is read-only in this contract: PEB appends authority
  fields after admission.

## Service wiring

Per W1.05 this item publishes the stable boundary only — no services are wired
yet. Wiring the envelope into the PEB transaction endpoint and reconciling the
existing `peb-kernel` DTOs is tracked in follow-up To Do (see W1.12).