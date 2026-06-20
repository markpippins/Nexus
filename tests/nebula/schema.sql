-- nebula schema — requirements management system
-- Applied by tests/nebula/conftest.py on test database setup

CREATE SCHEMA IF NOT EXISTS nebula;
SET search_path TO nebula;

CREATE TABLE IF NOT EXISTS systems (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#6b7280',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subsystems (
    id          SERIAL PRIMARY KEY,
    system_id   INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    color       TEXT NOT NULL DEFAULT '#9ca3af',
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subsystems_system_id ON subsystems(system_id);

CREATE TABLE IF NOT EXISTS features (
    id             SERIAL PRIMARY KEY,
    subsystem_id   INTEGER NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
    system_id      INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    name           TEXT NOT NULL DEFAULT '',
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'backlog'
                    CHECK(status IN ('backlog','planned','in_progress','completed','cancelled')),
    sort_order     INTEGER NOT NULL DEFAULT 0,
    kanban_column  TEXT NOT NULL DEFAULT 'backlog',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_features_subsystem_id ON features(subsystem_id);
CREATE INDEX IF NOT EXISTS idx_features_system_id ON features(system_id);

CREATE TABLE IF NOT EXISTS requirements (
    id             SERIAL PRIMARY KEY,
    system_id      INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    subsystem_id   INTEGER REFERENCES subsystems(id) ON DELETE SET NULL,
    feature_id     INTEGER REFERENCES features(id) ON DELETE SET NULL,
    title          TEXT NOT NULL DEFAULT '',
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft','review','approved','rejected','implemented','verified')),
    priority       TEXT NOT NULL DEFAULT 'medium'
                    CHECK(priority IN ('low','medium','high','critical')),
    sort_order     INTEGER NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requirements_system_id ON requirements(system_id);
CREATE INDEX IF NOT EXISTS idx_requirements_subsystem_id ON requirements(subsystem_id);
CREATE INDEX IF NOT EXISTS idx_requirements_feature_id ON requirements(feature_id);

CREATE TABLE IF NOT EXISTS system_folders (
    id          SERIAL PRIMARY KEY,
    system_id   INTEGER NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    name        TEXT NOT NULL DEFAULT '',
    parent_id   INTEGER REFERENCES system_folders(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_folders_system_id ON system_folders(system_id);
CREATE INDEX IF NOT EXISTS idx_system_folders_parent_id ON system_folders(parent_id);

CREATE TABLE IF NOT EXISTS work_sessions (
    id            SERIAL PRIMARY KEY,
    title         TEXT NOT NULL DEFAULT '',
    description   TEXT NOT NULL DEFAULT '',
    session_data  JSONB NOT NULL DEFAULT '{}',
    status        TEXT NOT NULL DEFAULT 'active'
                   CHECK(status IN ('active','completed','archived')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Color palette for subsystem auto-assignment
CREATE TABLE IF NOT EXISTS color_palette (
    id          SERIAL PRIMARY KEY,
    color       TEXT NOT NULL UNIQUE,
    is_used     BOOLEAN NOT NULL DEFAULT FALSE,
    assigned_to INTEGER REFERENCES subsystems(id) ON DELETE SET NULL
);

INSERT INTO color_palette (color) VALUES
    ('#ef4444'), ('#f97316'), ('#eab308'), ('#22c55e'),
    ('#06b6d4'), ('#3b82f6'), ('#8b5cf6'), ('#ec4899'),
    ('#84cc16'), ('#14b8a6'), ('#6366f1'), ('#f43f5e')
ON CONFLICT (color) DO NOTHING;
