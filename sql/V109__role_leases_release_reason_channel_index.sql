-- V109: D-007 + D-008 — tackle.role_leases release_reason + per-(role,channel) ACTIVE index
--
-- D-008 (revoked-vs-never-leased): a released lease now records WHY it ended
-- via `release_reason` (revoked | exhausted | expired). This backs the
-- GET /api/role-leases/:role/status derived-state endpoint and the
-- `type:lease-revoked` record emitted on revocation.
--
-- D-007 (channel-aware lease filtering): the ACTIVE uniqueness constraint
-- relaxes from per-role to per-(role,channel), so `interactive` and `opencode`
-- channels may each hold an ACTIVE lease for the same role. The old
-- `idx_role_leases_active_per_role` (per-role) index is dropped.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / DROP INDEX IF EXISTS /
-- CREATE INDEX IF NOT EXISTS. The CHECK constraint is added through a DO
-- guard because `ADD CONSTRAINT IF NOT EXISTS` is unsupported.
--
-- Pre-flight: this relaxation is only safe when no duplicate ACTIVE
-- (role, channel) rows exist. The old per-role unique index already
-- guarantees that invariant, so the swap cannot fail on existing data.

BEGIN;

ALTER TABLE tackle.role_leases
    ADD COLUMN IF NOT EXISTS release_reason text;

DO $mig$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'role_leases_release_reason_check'
          AND conrelid = 'tackle.role_leases'::regclass
    ) THEN
        ALTER TABLE tackle.role_leases
            ADD CONSTRAINT role_leases_release_reason_check
            CHECK (release_reason = ANY (ARRAY['revoked'::text, 'exhausted'::text, 'expired'::text]));
    END IF;
END $mig$;

DROP INDEX IF EXISTS tackle.idx_role_leases_active_per_role;

CREATE UNIQUE INDEX IF NOT EXISTS idx_role_leases_active_per_role_channel
    ON tackle.role_leases (role, channel)
    WHERE (status = 'ACTIVE');

COMMIT;
