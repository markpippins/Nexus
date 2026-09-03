-- =============================================================================
-- G1 activation: deny_contract_promotion elevated to narrowly-binding authority
-- =============================================================================
-- Per gate-12 grant 05d0fe54 (amendments 1a7b466d/f61d94e6/41d30b44/3a30651a),
-- the W1.10 protocol, and the G1 PASS verdict 986ec482 (2026-09-02T15:00Z),
-- the first decision class is elevated advisory -> narrowly_blocking,
-- effective ONLY at the governed admission boundary
-- (ContractAdmissionRegistry.admitGoverned — sole blocking submit surface).
--
-- This migration only records the durable authority-mode state and the
-- append-only activation event. It grants no other class any authority and
-- introduces no bypass path. Reversion per the verdict: any
-- lineage-completeness or append-only regression -> advisory.
--
-- Idempotent: state row inserted on conflict-do-nothing (no version bump on
-- re-run); governance event keyed by a fixed receipt id.

BEGIN;

-- 1. Durable authority-mode state (peb.state is the current-value store;
--    checksum = sha256 hex of the canonical content below, 64 chars).
INSERT INTO peb.state (id, key, content, metadata, checksum, version, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'binding_authority_mode',
    '{
      "decision_class": "deny_contract_promotion",
      "authority_level": "narrowly_binding",
      "granted_by": {
        "gate": "G1",
        "verdict": "986ec482-b81a-4b1c-9d96-97fe5334f3f0",
        "grant": "05d0fe54",
        "amendments": ["1a7b466d", "f61d94e6", "41d30b44", "3a30651a"]
      },
      "activated_by": "operator directive 2026-09-02 (G1 PASS)",
      "enforcement": "ContractAdmissionRegistry.admitGoverned (sole blocking submit surface)",
      "consult_surface": "peb-kernel binding_authority.get_authority_level / GET /api/peb/binding-decisions/authority/:decisionClass",
      "reversion": "any lineage-completeness or append-only regression -> advisory (decision 986ec482)"
    }'::jsonb,
    '{
      "migration": "V135",
      "activated_by_role": "engineer",
      "operator": "markpippins",
      "wave": "8"
    }'::jsonb,
    -- sha256 hex of the canonical (sorted-key, minified) content JSON
    'b9f1c914e119225871089ec9c589a6c8b38918fee9c546a73c4dfcea8a6578f3',
    1,
    now(),
    now()
)
ON CONFLICT (key) DO NOTHING;

-- 2. Append-only activation event (fixed receipt id → idempotent re-run).
INSERT INTO peb.governance_events
    (receipt_id, event_type, work_request_id, plan_id, agent_role, payload)
VALUES (
    'g1-activation-deny-contract-promotion-v1',
    'authority:elevated',
    NULL,
    'g1-activation',
    'engineer',
    '{
      "decision_class": "deny_contract_promotion",
      "authority_level": "narrowly_binding",
      "verdict": "986ec482-b81a-4b1c-9d96-97fe5334f3f0",
      "grant": "05d0fe54",
      "scope": "admission boundary only (no global toggle)",
      "note": "first persisted denial remains gated on barium backup health (c5-barium f61d94e6)"
    }'::jsonb
)
ON CONFLICT (receipt_id) DO NOTHING;

COMMIT;
