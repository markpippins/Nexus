-- ============================================================================
-- Voyager schema — Projection store for the filesystem acquisition layer
-- Target: PostgreSQL 16+, nexus database
--
-- This schema stores the "current state" projection of voyager's event stream.
-- NATS is the primary event log; these tables are derived projections consumed
-- by downstream systems (Identity Engine, LOSM, WRP) and by UI/agents.
--
-- Design choices:
--   * JSONB for flexible payload fields that differ across event subtypes
--   * citext for path-like columns to avoid case-collision noise
--   * Temporal validity (valid_from/valid_to) on entity & identity tables
--     so identity evolution is queryable without replaying the event log
--   * pgvector for metadata_span embeddings (LOSM consumption)
--   * epoch_id on every row — ties back to the scan cycle in NATS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE SCHEMA IF NOT EXISTS voyager;
SET search_path TO voyager, public;

-- ----------------------------------------------------------------------------
-- Generic "touch updated_at" trigger
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 1. FileObservation — Layer 1 immutable filesystem snapshot
-- ----------------------------------------------------------------------------

CREATE TABLE file_observation (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observation_id  uuid NOT NULL UNIQUE,
  epoch_id        uuid NOT NULL,
  path            text NOT NULL,
  size            bigint NOT NULL,
  mtime           timestamptz NOT NULL,
  inode           bigint NOT NULL,
  device_id       bigint NOT NULL,
  content_hash    text,                    -- SHA-256 hex digest
  fast_hash       text,                    -- first 4KB hash
  stat_raw        jsonb,                   -- raw os.stat subset
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Fast dedupe lookups during scan
CREATE INDEX idx_file_obs_path ON file_observation (path);
CREATE INDEX idx_file_obs_device_inode ON file_observation (device_id, inode);

CREATE INDEX idx_file_obs_epoch ON file_observation (epoch_id);
CREATE INDEX idx_file_obs_hash ON file_observation (content_hash) WHERE content_hash IS NOT NULL;

COMMENT ON TABLE file_observation IS
  'Immutable filesystem snapshot. One row per scan observation.';

-- ----------------------------------------------------------------------------
-- 2. DirectoryObservation
-- ----------------------------------------------------------------------------

CREATE TABLE directory_observation (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  observation_id  uuid NOT NULL UNIQUE,
  epoch_id        uuid NOT NULL,
  path            text NOT NULL,
  inode           bigint NOT NULL,
  device_id       bigint NOT NULL,
  stat_raw        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dir_obs_path ON directory_observation (path);
CREATE INDEX idx_dir_obs_epoch ON directory_observation (epoch_id);

COMMENT ON TABLE directory_observation IS
  'Directory snapshot. Used by the Topology Engine for structural adjacency.';

-- ----------------------------------------------------------------------------
-- 3. TopologySignal — structural relationship geometry
-- ----------------------------------------------------------------------------

CREATE TABLE topology_signal (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  signal_id       uuid NOT NULL UNIQUE,
  epoch_id        uuid NOT NULL,
  structure_type  text NOT NULL,           -- containment | adjacency | symmetry | repetition | evolution | vanishing
  structure_scope text NOT NULL,           -- file | directory | subtree
  geometry        jsonb NOT NULL,          -- path, added_members, removed_members, changed_members, etc.
  pattern         jsonb,                   -- { detected_pattern, confidence }
  constraints     jsonb NOT NULL DEFAULT '{"purely_structural": true}',
  observation_ids uuid[] NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_topology_signal_epoch ON topology_signal (epoch_id);
CREATE INDEX idx_topology_signal_type ON topology_signal (structure_type);

COMMENT ON TABLE topology_signal IS
  'Structural-only geometry. NO semantic labels allowed. Consumed by Identity Engine.';

-- ----------------------------------------------------------------------------
-- 4. ObservationEdgeHint — weak structural continuity signals
-- ----------------------------------------------------------------------------

CREATE TABLE observation_edge_hint (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hint_id         uuid NOT NULL UNIQUE,
  epoch_id        uuid NOT NULL,
  observation_ids uuid[2] NOT NULL,        -- [from_obs_id, to_obs_id]
  evidence        jsonb NOT NULL,          -- { type: "inode_match"|"path_continuity"|"rename_chain", confidence }
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_edge_hint_epoch ON observation_edge_hint (epoch_id);

COMMENT ON TABLE observation_edge_hint IS
  'Weak structural signals from fs-crawler. Does NOT imply identity authority.
   Consumed by Identity Engine for continuity clustering.';

-- ----------------------------------------------------------------------------
-- 5. IdentityCandidate — probabilistic continuity hypothesis
-- ----------------------------------------------------------------------------

CREATE TABLE identity_candidate (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id    uuid NOT NULL UNIQUE,
  observation_ids uuid[] NOT NULL,
  evidence        jsonb NOT NULL,          -- { structural, topology }
  confidence      float NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_identity_cand_conf ON identity_candidate (confidence DESC);

CREATE TRIGGER trg_identity_candidate_updated_at
  BEFORE UPDATE ON identity_candidate
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE identity_candidate IS
  'Identity Engine output — hypothesis of continuity across observations.';

-- ----------------------------------------------------------------------------
-- 6. Entity — resolved stable identity container
-- ----------------------------------------------------------------------------

CREATE TABLE entity (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entity_id               uuid NOT NULL UNIQUE,
  canonical_observations   uuid[] NOT NULL,
  lineage                 jsonb NOT NULL,  -- { root_observation, transformation_chain }
  stability_score         float NOT NULL DEFAULT 0 CHECK (stability_score >= 0 AND stability_score <= 1),
  state                   jsonb,           -- { last_seen, canonical_path, inode_history }
  valid_from              timestamptz NOT NULL DEFAULT now(),
  valid_to                timestamptz,
  is_active               boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),    -- No two entities claim the same time window for the same canonical path.
    -- Path uniqueness is enforced at the application layer by the Identity Engine;
    -- see idx_entity_canonical_path below for indexed lookups.
    );

CREATE INDEX idx_entity_active ON entity (is_active) WHERE is_active;
CREATE INDEX idx_entity_stability ON entity (stability_score DESC);
CREATE INDEX idx_entity_canonical_path ON entity ((state->>'canonical_path'))
  WHERE (state->>'canonical_path') IS NOT NULL;

CREATE TRIGGER trg_entity_updated_at
  BEFORE UPDATE ON entity
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE entity IS
  'Stable identity container. Authoritative source of "what" persisted across
   structural transformations. NOT semantic — identity is physical+structural continuity.';

-- ----------------------------------------------------------------------------
-- 7. EntityDrift — physical change tracking
-- ----------------------------------------------------------------------------

CREATE TYPE drift_magnitude AS ENUM ('TRACE', 'MINOR', 'MAJOR', 'MASSIVE');

CREATE TABLE entity_drift (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  drift_id        uuid NOT NULL UNIQUE,
  entity_id       uuid NOT NULL REFERENCES entity(entity_id),
  observation_id  uuid NOT NULL,
  delta           jsonb NOT NULL,          -- { size: {old, new}, mtime: {old, new}, ... }
  magnitude       drift_magnitude NOT NULL,
  confidence      float NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_entity_drift_entity ON entity_drift (entity_id);
CREATE INDEX idx_entity_drift_magnitude ON entity_drift (magnitude);

COMMENT ON TABLE entity_drift IS
  'Identity Engine output — physical change classification. Magnitude is
   non-semantic (TRACE→MASSIVE). LOSM consumes this for impact assessment.';

-- ----------------------------------------------------------------------------
-- 8. MetadataSpan — extracted content spans for LOSM
-- ----------------------------------------------------------------------------

CREATE TYPE span_type AS ENUM ('STRUCTURAL', 'DISCOURSE', 'EVENT_CANDIDATE', 'NOISE');

CREATE TABLE metadata_span (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  span_id         uuid NOT NULL UNIQUE,
  epoch_id        uuid NOT NULL,
  observation_id  uuid NOT NULL,
  text            text NOT NULL,
  start_pos       int NOT NULL,            -- byte offset in source file
  end_pos         int NOT NULL,
  span_type       span_type NOT NULL,
  confidence      float NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  markdown_role   text,                    -- h1-h6, list, blockquote, etc.
  discourse_role  text,                    -- turn, question, answer, meta
  event_candidate boolean NOT NULL DEFAULT false,
  features        jsonb NOT NULL DEFAULT '{}',
  provenance      jsonb NOT NULL DEFAULT '{}',
  embedding       vector(1536),            -- pgvector embedding for semantic search
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_metadata_span_obs ON metadata_span (observation_id);
CREATE INDEX idx_metadata_span_type ON metadata_span (span_type);
CREATE INDEX idx_metadata_span_embedding ON metadata_span
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
  WHERE embedding IS NOT NULL;

COMMENT ON TABLE metadata_span IS
  'Content spans extracted from file observations. Consumed exclusively by LOSM
   for semantic interpretation, requirement extraction, and embedding search.';

-- ----------------------------------------------------------------------------
-- 9. RequirementCandidate — LOSM output
-- ----------------------------------------------------------------------------

CREATE TABLE requirement_candidate (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id          uuid NOT NULL UNIQUE,
  text            text NOT NULL,
  provenance      uuid[] NOT NULL,         -- entity_ids that produced this requirement
  confidence      float NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  span_ids        uuid[],                  -- source metadata_span ids
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_req_candidate_conf ON requirement_candidate (confidence DESC);

CREATE TRIGGER trg_req_candidate_updated_at
  BEFORE UPDATE ON requirement_candidate
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMENT ON TABLE requirement_candidate IS
  'LOSM output — extracted requirements with provenance chain back to entities
   and spans. Consumed by WRP for work request generation.';

-- ----------------------------------------------------------------------------
-- 10. Scan epoch — track acquisition cycles
-- ----------------------------------------------------------------------------

CREATE TABLE scan_epoch (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  epoch_id        uuid NOT NULL UNIQUE,
  root_path       text NOT NULL,
  started_at      timestamptz NOT NULL,
  completed_at    timestamptz,
  files_scanned   int NOT NULL DEFAULT 0,
  new_files       int NOT NULL DEFAULT 0,
  cached_files    int NOT NULL DEFAULT 0,
  errors_count    int NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'running',  -- running | completed | failed
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_scan_epoch_status ON scan_epoch (status);
CREATE INDEX idx_scan_epoch_started ON scan_epoch (started_at DESC);

COMMENT ON TABLE scan_epoch IS
  'Tracks each scanner acquisition cycle. One row per epoch_id.';
