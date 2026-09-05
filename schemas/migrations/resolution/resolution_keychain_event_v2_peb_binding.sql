-- Keychains event contract v2: PEB binding decision outcomes.
--
-- The PEB binding contract preserves negative outcomes as immutable archive
-- events. This additive migration expands the source outbox vocabulary so
-- Keychains can receive every disposition defined by the deny_contract_promotion
-- contract without fabricating a state-vector checkpoint.
--
-- Safe to run against an existing v1 table and on both nexus and sol.

BEGIN;

ALTER TABLE resolution.keychain_event_outbox
    DROP CONSTRAINT IF EXISTS keychain_event_outbox_outcome_ck;

ALTER TABLE resolution.keychain_event_outbox
    ADD CONSTRAINT keychain_event_outbox_outcome_ck
    CHECK (outcome IN (
        'committed', 'refused', 'rejected', 'unknown', 'stale', 'drift',
        'quarantined', 'superseded', 'rolled_back', 'failed'
    ));

COMMENT ON CONSTRAINT keychain_event_outbox_outcome_ck
    ON resolution.keychain_event_outbox IS
    'PEB deny_contract_promotion dispositions are all durable source events; only committed outcomes create state-vector checkpoints.';

COMMIT;
