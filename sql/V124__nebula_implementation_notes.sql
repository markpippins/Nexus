-- V124 — Create nebula.implementation_notes table
--
-- The analyst harness currently only checks harvest_candidates.implementation_notes
-- (a single jsonb column, null for 91+ candidates). This table puts implementation
-- notes on ASSETS (linked via canonical_asset) rather than transient candidates,
-- so notes survive the harvest pipeline lifecycle.
--
-- Bitemporal (valid_from/valid_until + recorded_on_dt/recorded_until_dt) matches
-- the nebula.agent_records convention so joins are consistent.
--
-- Dependencies: nebula.canonical_asset (for asset_id FK), nebula.agent_records
-- (for source_record_id FK).
--
-- Idempotent: IF NOT EXISTS guards.

BEGIN;

CREATE TABLE IF NOT EXISTS nebula.implementation_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id         uuid NOT NULL,  -- FK to nebula.canonical_asset
  revision_id      uuid,           -- FK to asset_revision, nullable
  note_type        text NOT NULL,  -- implementation_plan | architecture_note | decision | engineering_log
  content          text NOT NULL,  -- Markdown body
  source_record_id uuid,           -- FK to nebula.agent_records (the originating audit entry)
  created_at       timestamptz NOT NULL DEFAULT now(),
  valid_from       timestamptz NOT NULL DEFAULT '-infinity',
  valid_until      timestamptz NOT NULL DEFAULT 'infinity',
  recorded_on_dt   timestamptz NOT NULL DEFAULT now(),
  recorded_until_dt timestamptz NOT NULL DEFAULT 'infinity'
);

-- Indexes for the key lookup paths:
--  1. By asset (analyst harness: WHERE asset_id = $1)
--  2. By note_type + asset (filtered backfill / report queries)
--  3. By source_record (audit provenance)

CREATE INDEX IF NOT EXISTS idx_implementation_notes_asset_id
  ON nebula.implementation_notes (asset_id);

CREATE INDEX IF NOT EXISTS idx_implementation_notes_note_type_asset
  ON nebula.implementation_notes (note_type, asset_id);

CREATE INDEX IF NOT EXISTS idx_implementation_notes_source_record
  ON nebula.implementation_notes (source_record_id)
  WHERE source_record_id IS NOT NULL;

COMMENT ON TABLE nebula.implementation_notes IS
  'Implementation notes on canonical assets — survives the harvest lifecycle.';
COMMENT ON COLUMN nebula.implementation_notes.asset_id IS
  'FK to nebula.canonical_asset. The stable identity the note is about.';
COMMENT ON COLUMN nebula.implementation_notes.note_type IS
  'implementation_plan | architecture_note | decision | engineering_log';
COMMENT ON COLUMN nebula.implementation_notes.source_record_id IS
  'FK to nebula.agent_records — the originating audit entry.';

COMMIT;