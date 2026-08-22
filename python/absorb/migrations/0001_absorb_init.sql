-- absorb — universal ingest system (ratified spec v0.2, comment 32e50870)
-- Migration 0001: initial schema.
--
-- Replication (R9): Strontium unreachable as of 2026-08-22 (user investigating).
-- Apply locally now; replicate when the host returns. Idempotent: CREATE IF NOT
-- EXISTS throughout; safe to re-run on replicas.

CREATE SCHEMA IF NOT EXISTS absorb;

-- ── Profiles ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS absorb.profiles (
    id              TEXT PRIMARY KEY,             -- e.g. 'chat-export-markdown'
    version         INT  NOT NULL DEFAULT 1,
    schema_version  TEXT NOT NULL DEFAULT '1.0',
    yaml_content    TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    description     TEXT,
    depends_on      JSONB NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only version history (rollback = reactivating prior content)
CREATE TABLE IF NOT EXISTS absorb.profile_versions (
    profile_id   TEXT NOT NULL,
    version      INT  NOT NULL,
    yaml_content TEXT NOT NULL,
    changelog    TEXT,
    activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_by TEXT,
    PRIMARY KEY (profile_id, version)
);

-- Watermarks keyed to (profile_id, version) per spec C3
CREATE TABLE IF NOT EXISTS absorb.watermarks (
    profile_id         TEXT NOT NULL,
    profile_version    INT  NOT NULL,
    source_fingerprint TEXT NOT NULL,             -- sha256(path + mtime + size)
    last_processed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, profile_version, source_fingerprint)
);

-- ── Documents / turns / segments ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS absorb.documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      TEXT NOT NULL,
    profile_version INT  NOT NULL DEFAULT 1,
    source_path     TEXT NOT NULL,
    content_hash    TEXT NOT NULL,                -- sha256 of normalized text
    conversation_id TEXT,
    title           TEXT NOT NULL,                -- clean; date prefixes stripped
    metadata        JSONB NOT NULL DEFAULT '{}',  -- reserved keys: absorb_profile_id,
                                                  -- absorb_profile_version, source_date,
                                                  -- conversation_id
    source_date     DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (profile_id, content_hash)
);

CREATE TABLE IF NOT EXISTS absorb.turns (
    document_id UUID REFERENCES absorb.documents(id) ON DELETE CASCADE,
    turn_index  INT  NOT NULL,
    role        TEXT NOT NULL,
    content_md  TEXT NOT NULL,
    ts          TEXT,
    PRIMARY KEY (document_id, turn_index)
);

CREATE TABLE IF NOT EXISTS absorb.segments (
    document_id     UUID REFERENCES absorb.documents(id) ON DELETE CASCADE,
    seg_index       INT  NOT NULL,
    start_turn      INT  NOT NULL,
    end_turn        INT  NOT NULL,
    arc_type        TEXT,
    boundary_reason TEXT,
    heading         TEXT,
    is_filler       BOOLEAN[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (document_id, seg_index)
);

-- ── Runs / steps (error taxonomy per spec C1) ────────────────────────
CREATE TABLE IF NOT EXISTS absorb.runs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id   TEXT NOT NULL,
    profile_ver  INT  NOT NULL DEFAULT 1,
    document_id  UUID REFERENCES absorb.documents(id),
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','running','done','failed')),
    dry_run      BOOLEAN NOT NULL DEFAULT false,
    summary      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_runs_profile ON absorb.runs (profile_id, status);

CREATE TABLE IF NOT EXISTS absorb.run_steps (
    run_id        UUID REFERENCES absorb.runs(id) ON DELETE CASCADE,
    step_index    INT  NOT NULL,
    step_type     TEXT NOT NULL,
    config        JSONB,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','claimed','done','failed','skipped')),
    error_code    TEXT,                           -- E_TRANSIENT_* | E_PERMANENT_* | E_CONFIG_*
    retryable     BOOLEAN,                        -- invariant: true <=> transient
    skip_reason   TEXT,
    error_message TEXT,
    attempts      INT NOT NULL DEFAULT 0,
    completed_at  TIMESTAMPTZ,
    PRIMARY KEY (run_id, step_index)
);

-- ── Artifacts (cross-profile dependency currency) ────────────────────
CREATE TABLE IF NOT EXISTS absorb.artifacts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    producer_profile TEXT NOT NULL,
    profile_version  INT  NOT NULL DEFAULT 1,
    document_id      UUID REFERENCES absorb.documents(id),
    artifact_type    TEXT NOT NULL,               -- docklang|forum-thread|mongo-doc|...
    ref              JSONB NOT NULL,
    warning_codes    TEXT[] NOT NULL DEFAULT '{}', -- W_GLOB_COLLISION etc. (distinct from skips)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_artifacts_doc ON absorb.artifacts (document_id, artifact_type);
