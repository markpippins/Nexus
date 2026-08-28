"""Golden vectors from W1.04 spec §5 (ratified 2026-08-27).

These are the shared cross-language fixtures: Python and JVM readers must
agree on canonical identity and digest for every vector.
"""

# V1 — governed execution admission, disposition `allow`, 2 assertion
# results, 1 evidence id.
V1_ENVELOPE = {
    "envelope_version": 1,
    "envelope_id": "3b7e8f2a-1c4d-4e5f-9a0b-c6d7e8f9a0b1",
    "created_at": "2026-08-26T06:41:44.868Z",
    "contract": {
        "contract_id": "b3a0c1d2-e4f5-4a6b-8c7d-9e0f1a2b3c4d",
        "contract_version": 3,
        "contract_digest": "sha256:" + "ab" * 32,
        "projection_id": "p-001",
        "projection_version": 2,
        "projection_digest": "sha256:" + "cd" * 32,
        "operation": "admit_execution",
        "transition": "REQUESTED->EXECUTING",
    },
    "semantic": {
        "@context": "HTTPS://NEXUS.LOCAL/CONTEXT/GOVERNANCE/V1",
        "subject_id": "subj-2026-08-26-0001",
        "subject_type": "work_request",
        "subject_ref": "https://nexus.local/wrp/work-requests/0007",
    },
    "workflow": {
        "workflow_id": "wf-0007",
        "workflow_version": 1,
        "node_id": "node-admission",
        "work_request_id": "wr-0007",
        "work_request_version": 2,
    },
    "law": {
        "proposition_ids": ["11111111-2222-4333-8444-555555555555",
                            "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"],
        "frame_values": [
            {"frame": "execution_backend", "value": "interactive"},
            {"frame": "environment", "value": "production"},
        ],
        "doctrine_ids": ["dddddddd-1111-4222-8333-444444444444"],
        "posture_ids": ["pppppppp-2222-4333-8444-555555555555"],
        "effective_at": "2026-08-26T00:00:00.000000Z",
    },
    "execution": {
        "lease_id": "llllllll-3333-4444-8555-666666666666",
        "grant_id": "gggggggg-4444-4555-8666-777777777777",
        "attempt_id": "aaaaaaaa-5555-4666-8777-888888888888",
    },
    "inputs": {
        "input_snapshot_id": "11111111-2222-4333-8444-555555555555",
        "input_captured_at": "2026-08-26T14:41:20.123456Z",
        "input_fingerprint": "sha256:" + "ef" * 32,
    },
    "evaluation": {
        "assertion_results": [
            {"proposition_id": "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
             "result": True},
            {"proposition_id": "11111111-2222-4333-8444-555555555555",
             "result": True},
        ],
        "disposition": "allow",
        "unknowns": [],
        "refusal_code": None,
        "evaluated_at": "2026-08-26T14:41:25.000000Z",
    },
    "evidence": {
        "evidence_ids": ["eeeeeeee-6666-4777-8888-999999999999"],
        "evidence_fingerprint": "sha256:" + "01" * 32,
    },
}

# V2: refusal / unknown context.
V2_ENVELOPE = {
    **V1_ENVELOPE,
    "envelope_id": "f2c3d4e5-6a7b-4c8d-9e0f-a1b2c3d4e5f6",
    "evaluation": {
        "assertion_results": [],
        "disposition": "refuse",
        "unknowns": ["context:unknown-vocabulary"],
        "refusal_code": "unknown_context",
        "evaluated_at": "2026-08-26T14:41:26.000000Z",
    },
}

# V3: execution admission with evidence, 2 evidence ids.
V3_ENVELOPE = {
    **V1_ENVELOPE,
    "envelope_id": "a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
    "evidence": {
        "evidence_ids": [
            "eeeeeeee-2222-4667-8888-999999999999",
            "ffffffff-3333-4667-8888-999999999999",
        ],
        "evidence_fingerprint": "sha256:" + "23" * 32,
    },
}

POSITIVE_VECTORS = {
    "V1_governed_execution_allow": (V1_ENVELOPE, "sha256:9eaba4fab7739d0f93692d12e4819ad57f42dfb2b781a79676bf9efb07a58d55"),
    "V2_refusal_unknown_context": (V2_ENVELOPE, "sha256:b938a3c45fabd5a2dff614838766adcd24abb9856a76b65c59312b713960af0c"),
    "V3_execution_admission_with_evidence": (V3_ENVELOPE, "sha256:e78b4eac6594056676c06cd8f40589edd052f2fe2e0eab8a4e933e8c3b1f7339"),
}