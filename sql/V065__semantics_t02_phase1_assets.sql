-- ═══════════════════════════════════════════════════════════════════════
--  V065 — semantics: T02 Phase 1 — canonical asset identity spine
--
--  Implements the identity-spine half of the T02 "canonical asset &
--  revision contract v1.0" (approved in Assembly to-do thread
--  84c271e0-4303-480c-a6e8-43d18377a518: architect draft f4f41d4b,
--  resolution 891a4df2, admin concur 55b12c1b). Phase 1 per Q5 of the
--  contract; Phase 2 (asset_identity_claim + asset_relation) lands later.
--
--  Three new tables, all conforming to the V057 design-faithful model:
--    • canonical_asset  — enduring identity record (asset:<platform>:<ns>:<key>)
--    • asset_revision    — immutable revision record (append-only)
--    • source_observation — provenance: what was observed and from where
--
--  Conventions (unchanged from V057):
--    • uuid PK DEFAULT gen_random_uuid() (caller may override via p_id)
--    • expired_at timestamptz soft-delete (NULL ⇒ active)
--    • partial unique indexes WHERE expired_at IS NULL for natural keys
--    • inline FK REFERENCES (plain, not partial)
--    • add_ / soft_delete_ / update_ proc trio per table; update is
--      append-only replace (expire active row, insert new row with a
--      fresh uuid id; raise if no active row for p_id)
--    • no created_at on pure provenance/edge rows (matches
--      snapshot_observation); top-level entity rows carry created_at
--
--  Hooks reused (already seeded by V059), NOT recreated here:
--    • semantics.concept('Asset')
--    • semantics.identity_strategy(canonical_asset_id) for the Asset concept
--
--  No backlink FKs to harvest_candidates / requirements /
--  implementation_plans / conduit work_requests / questions are added in
--  this migration — those are invariant #5 of the contract and land in a
--  follow-up so Phase 2 work is not bound into the Phase 1 spine.
--
--  Idempotent: CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING /
--  guarded DROP FUNCTION, re-creates procs with OR REPLACE.
--
--  Usage:
--    docker exec -i pgvector_db psql -U pguser -d nexus \
--      -v ON_ERROR_STOP=1 -f sql/V065__semantics_t02_phase1_assets.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  0. SAFETY — refuse to run if the Phase 1 tables already hold rows
--     (prevents accidental re-apply over live data; the schema-empty
--     guard from V057 does not apply since V057 ran clean and the
--     schema now holds seeded lookup rows).
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_count integer;
BEGIN
    IF to_regclass('semantics.canonical_asset') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM semantics.canonical_asset' INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'V065 aborted: semantics.canonical_asset has % row(s); this migration is structural-only (no data migration planned)', v_count;
        END IF;
    END IF;
    IF to_regclass('semantics.asset_revision') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM semantics.asset_revision' INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'V065 aborted: semantics.asset_revision has % row(s)', v_count;
        END IF;
    END IF;
    IF to_regclass('semantics.source_observation') IS NOT NULL THEN
        EXECUTE 'SELECT count(*) FROM semantics.source_observation' INTO v_count;
        IF v_count > 0 THEN
            RAISE EXCEPTION 'V065 aborted: semantics.source_observation has % row(s)', v_count;
        END IF;
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  1. DROP pre-existing procs (so CREATE OR REPLACE re-arms cleanly)
--     Use DROP FUNCTION IF NOT EXISTS so this migration is re-runnable.
-- ═══════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS semantics.add_canonical_asset(uuid,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz);
DROP FUNCTION IF EXISTS semantics.soft_delete_canonical_asset(uuid);
DROP FUNCTION IF EXISTS semantics.update_canonical_asset(uuid,text,text,jsonb,text,text,timestamptz,timestamptz,timestamptz);

DROP FUNCTION IF EXISTS semantics.add_asset_revision(uuid,text,uuid,text,text,uuid,timestamptz,timestamptz,text,timestamptz);
DROP FUNCTION IF EXISTS semantics.soft_delete_asset_revision(uuid);
DROP FUNCTION IF EXISTS semantics.update_asset_revision(uuid,text,uuid,text,text,uuid,timestamptz,timestamptz,text,timestamptz);

DROP FUNCTION IF EXISTS semantics.add_source_observation(uuid,uuid,text,text,text,text,timestamptz,uuid,text,timestamptz);
DROP FUNCTION IF EXISTS semantics.soft_delete_source_observation(uuid);
DROP FUNCTION IF EXISTS semantics.update_source_observation(uuid,uuid,text,text,text,text,timestamptz,uuid,text,timestamptz);

-- ═══════════════════════════════════════════════════════════════════════
--  2. TABLES
-- ═══════════════════════════════════════════════════════════════════════

-- ── canonical_asset ──────────────────────────────────────────────────
-- Enduring identity record. canonical_asset_id is the business key
-- (compound asset:<platform>:<ns>:<key>); uuid id is the technical PK.
-- Per Q2 of the contract, the compound form survives DB migration and
-- is the durable join key for revisions/claims/relations.
CREATE TABLE IF NOT EXISTS semantics.canonical_asset (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    canonical_asset_id  text NOT NULL,                 -- asset:<platform>:<ns>:<key>
    asset_kind          text NOT NULL,                  -- transcript|doc|spec|plan|work_request|candidate|...
    canonical_key       jsonb,                          -- structured namespace + source key
    source_hash         text,                           -- hash of the source record (platform-side)
    content_hash        text,                           -- sha256 of the canonical content
    validity_start      timestamptz,                    -- system-time validity interval start
    validity_end        timestamptz,                    -- nullable: open interval
    created_at          timestamptz NOT NULL DEFAULT now(),
    expired_at          timestamptz
);

-- Stable business key unique among active rows (Q2 invariants)
CREATE UNIQUE INDEX IF NOT EXISTS idx_canonical_asset_active_canonical_asset_id
    ON semantics.canonical_asset (canonical_asset_id) WHERE expired_at IS NULL;

-- ── asset_revision ────────────────────────────────────────────────────
-- Immutable revision record. Append-only: a new observation with
-- identical content_hash reuses the same revision (idempotent,
-- invariant #2); a different content_hash is a NEW revision of the
-- same asset (NOT a new asset). parent_revision_id chains baselines.
CREATE TABLE IF NOT EXISTS semantics.asset_revision (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id           text NOT NULL,               -- asset:<id>:rev:<n>
    asset_id              uuid NOT NULL REFERENCES semantics.canonical_asset(id),
    content_hash          text,                         -- sha256 of this revision's content
    source_hash           text,                         -- hash of the source record this revision records
    parent_revision_id    uuid REFERENCES semantics.asset_revision(id),  -- self-ref baseline chain
    recording_start       timestamptz,                  -- immutable recording interval start
    recording_end         timestamptz,                  -- nullable: ongoing
    created_by            text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    expired_at            timestamptz,
    CHECK (asset_id IS NOT NULL)                        -- explicit: every revision belongs to an asset
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_revision_active_revision_id
    ON semantics.asset_revision (revision_id) WHERE expired_at IS NULL;

-- ── source_observation ────────────────────────────────────────────────
-- Provenance row: what was observed and from where. Mirrors the
-- snapshot_observation convention (no created_at — provenance rows).
CREATE TABLE IF NOT EXISTS semantics.source_observation (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    revision_id           uuid NOT NULL REFERENCES semantics.asset_revision(id),
    platform              text NOT NULL,                -- claude|chatgpt|github|filesystem|...
    platform_identifier   text,                         -- stable conversation/thread/issue/doc id
    namespace             text,
    raw_location          text,                         -- URI/path of the raw artifact
    observed_at           timestamptz,                  -- when the observation was made
    ingestion_run_id      uuid,                         -- batch_harvest_to_db run id
    raw_hash              text,                         -- hash of the raw observed bytes
    expired_at            timestamptz
);

-- ═══════════════════════════════════════════════════════════════════════
--  3. STORED PROCEDURES — add_ / soft_delete_ / update_ trio
-- ═══════════════════════════════════════════════════════════════════════

-- ── canonical_asset ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION semantics.add_canonical_asset(
    p_id uuid DEFAULT NULL,
    p_canonical_asset_id text DEFAULT NULL,
    p_asset_kind text DEFAULT NULL,
    p_canonical_key jsonb DEFAULT NULL,
    p_source_hash text DEFAULT NULL,
    p_content_hash text DEFAULT NULL,
    p_validity_start timestamptz DEFAULT NULL,
    p_validity_end timestamptz DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.canonical_asset AS $$
DECLARE v_row semantics.canonical_asset%ROWTYPE;
BEGIN
    INSERT INTO semantics.canonical_asset
        (id, canonical_asset_id, asset_kind, canonical_key, source_hash,
         content_hash, validity_start, validity_end, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_canonical_asset_id, p_asset_kind,
         p_canonical_key, p_source_hash, p_content_hash,
         p_validity_start, p_validity_end, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_canonical_asset(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.canonical_asset SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_canonical_asset(
    p_id uuid,
    p_canonical_asset_id text DEFAULT NULL,
    p_asset_kind text DEFAULT NULL,
    p_canonical_key jsonb DEFAULT NULL,
    p_source_hash text DEFAULT NULL,
    p_content_hash text DEFAULT NULL,
    p_validity_start timestamptz DEFAULT NULL,
    p_validity_end timestamptz DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.canonical_asset AS $$
DECLARE v_row semantics.canonical_asset%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.canonical_asset SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_canonical_asset: no active row with id %', p_id; END IF;
    INSERT INTO semantics.canonical_asset
        (id, canonical_asset_id, asset_kind, canonical_key, source_hash,
         content_hash, validity_start, validity_end, expired_at)
    VALUES
        (gen_random_uuid(), p_canonical_asset_id, p_asset_kind,
         p_canonical_key, p_source_hash, p_content_hash,
         p_validity_start, p_validity_end, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ── asset_revision ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION semantics.add_asset_revision(
    p_id uuid DEFAULT NULL,
    p_revision_id text DEFAULT NULL,
    p_asset_id uuid DEFAULT NULL,
    p_content_hash text DEFAULT NULL,
    p_source_hash text DEFAULT NULL,
    p_parent_revision_id uuid DEFAULT NULL,
    p_recording_start timestamptz DEFAULT NULL,
    p_recording_end timestamptz DEFAULT NULL,
    p_created_by text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.asset_revision AS $$
DECLARE v_row semantics.asset_revision%ROWTYPE;
BEGIN
    INSERT INTO semantics.asset_revision
        (id, revision_id, asset_id, content_hash, source_hash,
         parent_revision_id, recording_start, recording_end,
         created_by, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_revision_id, p_asset_id,
         p_content_hash, p_source_hash, p_parent_revision_id,
         p_recording_start, p_recording_end, p_created_by, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_asset_revision(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.asset_revision SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_asset_revision(
    p_id uuid,
    p_revision_id text DEFAULT NULL,
    p_asset_id uuid DEFAULT NULL,
    p_content_hash text DEFAULT NULL,
    p_source_hash text DEFAULT NULL,
    p_parent_revision_id uuid DEFAULT NULL,
    p_recording_start timestamptz DEFAULT NULL,
    p_recording_end timestamptz DEFAULT NULL,
    p_created_by text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.asset_revision AS $$
DECLARE v_row semantics.asset_revision%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.asset_revision SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_asset_revision: no active row with id %', p_id; END IF;
    INSERT INTO semantics.asset_revision
        (id, revision_id, asset_id, content_hash, source_hash,
         parent_revision_id, recording_start, recording_end,
         created_by, expired_at)
    VALUES
        (gen_random_uuid(), p_revision_id, p_asset_id,
         p_content_hash, p_source_hash, p_parent_revision_id,
         p_recording_start, p_recording_end, p_created_by, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ── source_observation ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION semantics.add_source_observation(
    p_id uuid DEFAULT NULL,
    p_revision_id uuid DEFAULT NULL,
    p_platform text DEFAULT NULL,
    p_platform_identifier text DEFAULT NULL,
    p_namespace text DEFAULT NULL,
    p_raw_location text DEFAULT NULL,
    p_observed_at timestamptz DEFAULT NULL,
    p_ingestion_run_id uuid DEFAULT NULL,
    p_raw_hash text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.source_observation AS $$
DECLARE v_row semantics.source_observation%ROWTYPE;
BEGIN
    INSERT INTO semantics.source_observation
        (id, revision_id, platform, platform_identifier, namespace,
         raw_location, observed_at, ingestion_run_id, raw_hash, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_revision_id, p_platform,
         p_platform_identifier, p_namespace, p_raw_location,
         p_observed_at, p_ingestion_run_id, p_raw_hash, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.soft_delete_source_observation(p_id uuid)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.source_observation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_source_observation(
    p_id uuid,
    p_revision_id uuid DEFAULT NULL,
    p_platform text DEFAULT NULL,
    p_platform_identifier text DEFAULT NULL,
    p_namespace text DEFAULT NULL,
    p_raw_location text DEFAULT NULL,
    p_observed_at timestamptz DEFAULT NULL,
    p_ingestion_run_id uuid DEFAULT NULL,
    p_raw_hash text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.source_observation AS $$
DECLARE v_row semantics.source_observation%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.source_observation SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_source_observation: no active row with id %', p_id; END IF;
    INSERT INTO semantics.source_observation
        (id, revision_id, platform, platform_identifier, namespace,
         raw_location, observed_at, ingestion_run_id, raw_hash, expired_at)
    VALUES
        (gen_random_uuid(), p_revision_id, p_platform,
         p_platform_identifier, p_namespace, p_raw_location,
         p_observed_at, p_ingestion_run_id, p_raw_hash, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  4. VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_new_tables   integer;
    v_total_tables integer;
    v_new_fks      integer;
    v_new_procs    integer;
    v_new_active_idx integer;
    v_canonical_asset_exists regclass;
    v_asset_revision_exists  regclass;
    v_source_observation_exists regclass;
BEGIN
    SELECT count(*) INTO v_new_tables
      FROM information_schema.tables
     WHERE table_schema='semantics'
       AND table_name IN ('canonical_asset','asset_revision','source_observation');
    SELECT count(*) INTO v_total_tables FROM information_schema.tables WHERE table_schema='semantics';
    SELECT count(*) INTO v_new_fks
      FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace
     WHERE con.contype='f' AND nsp.nspname='semantics'
       AND con.conname IN ('asset_revision_asset_id_fkey','asset_revision_parent_revision_id_fkey','source_observation_revision_id_fkey');
    SELECT count(*) INTO v_new_procs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='semantics'
       AND (p.proname IN ('add_canonical_asset','soft_delete_canonical_asset','update_canonical_asset',
                          'add_asset_revision','soft_delete_asset_revision','update_asset_revision',
                          'add_source_observation','soft_delete_source_observation','update_source_observation'));
    SELECT count(*) INTO v_new_active_idx
      FROM pg_indexes
     WHERE schemaname='semantics'
       AND indexname IN ('idx_canonical_asset_active_canonical_asset_id',
                         'idx_asset_revision_active_revision_id');

    SELECT to_regclass('semantics.canonical_asset')  INTO v_canonical_asset_exists;
    SELECT to_regclass('semantics.asset_revision')  INTO v_asset_revision_exists;
    SELECT to_regclass('semantics.source_observation') INTO v_source_observation_exists;

    RAISE NOTICE 'new_tables=%, total_tables=%, new_fks=%, new_procs=%, new_active_unique_indexes=%',
                 v_new_tables, v_total_tables, v_new_fks, v_new_procs, v_new_active_idx;
    RAISE NOTICE 'canonical_asset=%, asset_revision=%, source_observation=%',
                 v_canonical_asset_exists, v_asset_revision_exists, v_source_observation_exists;

    IF v_new_tables <> 3 THEN RAISE EXCEPTION 'V065 verify: expected 3 new tables, got %', v_new_tables; END IF;
    IF v_new_fks <> 3 THEN RAISE EXCEPTION 'V065 verify: expected 3 new FKs, got %', v_new_fks; END IF;
    IF v_new_procs <> 9 THEN RAISE EXCEPTION 'V065 verify: expected 9 new procs, got %', v_new_procs; END IF;
    IF v_new_active_idx <> 2 THEN RAISE EXCEPTION 'V065 verify: expected 2 active-only unique indexes, got %', v_new_active_idx; END IF;

    RAISE NOTICE '✅ V065 applied — T02 Phase 1 identity spine live (canonical_asset + asset_revision + source_observation).';
END $$;

COMMIT;
