-- ─────────────────────────────────────────────────────────────────────
-- v9 — ADD DEFAULT NOW() to tackle.roles.created_at / updated_at
-- Engineer intent: recorded in note to Architect (this session, 2026-07-25)
--
-- Background: while seeding tackle.prompts (v8) we needed to insert the
-- 'builder-fallback' role row for the FK on tackle.prompts.role. The
-- first attempt failed with "null value in column created_at of
-- relation roles violates not-null constraint" because tackle.roles
-- declares created_at/updated_at as TIMESTAMPTZ NOT NULL with **no
-- DEFAULT**, while every other bitemporal table in the tackle schema
-- (tackle.memory, tackle.role_memory) has DEFAULT NOW(). This is an
-- inconsistency in the baseline schema. It makes casual role inserts
-- and any future INSERT triggered by tooling painful.
--
-- This migration adds the missing DEFAULT NOW() to both columns. It is
-- back-compatible: existing rows keep their timestamps (DEFAULT only
-- applies to inserts that don't supply the column).
--
-- Idempotent: re-running is a no-op (column already has the default).
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE tackle.roles
    ALTER COLUMN created_at SET DEFAULT NOW();

ALTER TABLE tackle.roles
    ALTER COLUMN updated_at SET DEFAULT NOW();

-- ── Migration ledger stamp ──────────────────────────────────────────

INSERT INTO tackle.schema_version (version, description, applied_at)
VALUES (
    9,
    'Add DEFAULT NOW() to tackle.roles.created_at and tackle.roles.updated_at. ' ||
    'Baseline schema inconsistency with tackle.memory / tackle.role_memory ' ||
    '(which already default to NOW()). Back-compatible: existing rows keep ' ||
    'their timestamps; new INSERTs that omit the columns now work. Spotted ' ||
    'when seeding tackle.prompts (v8) for the builder-fallback role.',
    NOW()
)
ON CONFLICT (version) DO UPDATE
    SET description = EXCLUDED.description,
        applied_at  = EXCLUDED.applied_at;
