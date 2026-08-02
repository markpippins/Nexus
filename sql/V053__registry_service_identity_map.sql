-- ── V053: Registry ↔ Terrain Service Identity Map ─────────────────────────
--
-- Establishes a stable-identity mapping between the two service catalogs:
--
--   registry.services (declared plane — "what should exist")
--   terrain.runnable_services (runtime plane — "what is observed")
--
-- Why this table exists
--   The Reconciliation Report (Admin Notes thread 6bb79ba0) and the Ownership
--   Matrix (Admin Notes thread 957f75a7) both concluded that name-based
--   identity is unsafe: 14 same-name/port-drift pairs and 5 near-miss name
--   pairs (`cascade`↔`cascade-srv`, `conduit-srv`↔`conduit-mcp`, ...) mean
--   display names cannot be used as join keys or authorization handles.
--
--   This table is the explicit registry↔terrain mapping relation: stable
--   IDs only. Nothing may join or authorize through names anymore once this
--   mapping is populated.
--
-- Pattern
--   "Medium" bitemporal pattern (temporal columns on the live table, partial
--   unique indexes on the current-valid row) — same convention as the
--   substance segment tables (nebula.segment_set_members, ...). A mapping is
--   never hard-deleted: supersede it by closing valid_until and inserting a
--   new current row.
--
-- Cardinality (current-valid rows)
--   One current mapping per registry service  (partial unique index)
--   One current mapping per terrain runnable   (partial unique index)
--   No duplicate (registry, terrain) pairs     (partial unique index)
--
-- Match provenance
--   match_method records how the link was established so auto-mapped rows can
--   be audited and manually overridden later:
--     exact_name  — case-insensitive name equality (deterministic backfill)
--     fuzzy_name  — near-match name heuristics (needs human confirmation)
--     port_match  — port alignment between planes (needs human confirmation)
--     admission   — set at runtime admission / registration time
--     manual      — operator/agent-confirmed mapping
-- ────────────────────────────────────────────────────────────────────────────

-- ── 1. Prerequisite: terrain.runnable_services primary key ────────────────
-- terrain.runnable_services currently has NO constraints (no PK, no unique
-- indexes). The identity map's FK to it therefore cannot exist. Adding a PK
-- is safe: verified no duplicate or NULL ids in the live table (2026-08-01).
-- Note: PostgreSQL does not support IF NOT EXISTS on ADD CONSTRAINT, so the
-- existence check is done via pg_constraint in a DO block (idempotent).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'terrain.runnable_services'::regclass
          AND conname = 'runnable_services_pkey'
    ) THEN
        ALTER TABLE terrain.runnable_services ADD PRIMARY KEY (id);
    END IF;
END $$;

-- ── 2. Mapping table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registry.service_identity_map (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    registry_service_id  bigint NOT NULL REFERENCES registry.services(id),
    terrain_service_id   bigint NOT NULL REFERENCES terrain.runnable_services(id),
    match_method         text NOT NULL DEFAULT 'manual'
                         CHECK (match_method IN
                                ('exact_name', 'fuzzy_name', 'port_match',
                                 'admission', 'manual')),
    match_confidence     numeric(3, 2) NOT NULL DEFAULT 1.00
                         CHECK (match_confidence >= 0 AND match_confidence <= 1),
    notes                text,
    valid_from           timestamptz NOT NULL DEFAULT now(),
    valid_until          timestamptz NOT NULL DEFAULT '9999-12-31 00:00:00+00',
    created_at           timestamptz NOT NULL DEFAULT now(),
    -- No hard deletes: a superseded row keeps its history and is hidden from
    -- the current-valid view by valid_until.
    CONSTRAINT service_identity_map_validity
        CHECK (valid_until > valid_from)
);

COMMENT ON TABLE registry.service_identity_map IS
    'Stable-ID mapping between registry.services (declared) and '
    'terrain.runnable_services (runtime). Never authorize by name; use this map.';

-- ── 3. Partial unique indexes (current-valid row only) ─────────────────────
-- One current mapping per registry service.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_identity_map_registry_current
    ON registry.service_identity_map (registry_service_id)
    WHERE (valid_until = '9999-12-31 00:00:00+00'::timestamp with time zone);

-- One current mapping per terrain runnable.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_identity_map_terrain_current
    ON registry.service_identity_map (terrain_service_id)
    WHERE (valid_until = '9999-12-31 00:00:00+00'::timestamp with time zone);

-- No duplicate current (registry, terrain) pairs.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_identity_map_pair_current
    ON registry.service_identity_map (registry_service_id, terrain_service_id)
    WHERE (valid_until = '9999-12-31 00:00:00+00'::timestamp with time zone);

-- ── 4. Convenience view (IDs + human-readable columns) ─────────────────────
CREATE OR REPLACE VIEW registry.v_service_identity_map AS
SELECT
    m.id,
    m.registry_service_id,
    r.name            AS registry_service_name,
    r.status          AS registry_status,
    r.default_port    AS registry_port,
    m.terrain_service_id,
    t.name            AS terrain_service_name,
    t.status          AS terrain_status,
    t.port            AS terrain_port,
    m.match_method,
    m.match_confidence,
    m.notes,
    m.valid_from,
    m.valid_until
FROM registry.service_identity_map m
JOIN registry.services r           ON r.id = m.registry_service_id
JOIN terrain.runnable_services t   ON t.id = m.terrain_service_id;

COMMENT ON VIEW registry.v_service_identity_map IS
    'Current + historical registry↔terrain mappings with human-readable names. '
    'Consumers should filter valid_until = 9999-12-31 for the live mapping set.';

-- ── 5. Deterministic backfill: exact case-insensitive name matches ─────────
-- Maps the 29 services whose names agree exactly between planes, at
-- confidence 1.0. Idempotent (ON CONFLICT DO NOTHING covers every unique
-- index, including the partial current-row ones). DISTINCT ON (r.id) guards
-- against a future terrain duplicate name fanning out the join — the
-- first-mapped terrain row wins deterministically (lowest id).
INSERT INTO registry.service_identity_map
    (registry_service_id, terrain_service_id, match_method, match_confidence, notes)
SELECT DISTINCT ON (r.id)
    r.id,
    t.id,
    'exact_name',
    1.00,
    'Auto-mapped from exact case-insensitive name match '
    '(Reconciliation Report, 2026-08-01).'
FROM registry.services r
JOIN terrain.runnable_services t
    ON lower(r.name) = lower(t.name)
ORDER BY r.id, t.id
ON CONFLICT DO NOTHING;

-- Remaining (registry-only / terrain-only / port-drift / duplicate rows) are
-- intentionally NOT auto-mapped — they need human or admission-time decision
-- (see Reconciliation Report sections 3–6).
