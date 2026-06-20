-- Nebula RMS PostgreSQL Schema
-- Plan 0086: Full DDL for nexus-ui/nexus-rms conversion

-- ── Systems ──────────────────────────────────────────────────────
CREATE TABLE systems (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    readme       TEXT,
    architecture TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Subsystems ───────────────────────────────────────────────────
CREATE TABLE subsystems (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id   UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    readme      TEXT,
    color       TEXT NOT NULL DEFAULT '#3B82F6',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_subsystems_system ON subsystems(system_id);

-- ── Features ─────────────────────────────────────────────────────
CREATE TABLE features (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subsystem_id  UUID NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    readme        TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_features_subsystem ON features(subsystem_id);

-- ── Requirements ─────────────────────────────────────────────────
CREATE TABLE requirements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id       UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    subsystem_id    UUID NOT NULL REFERENCES subsystems(id) ON DELETE CASCADE,
    feature_id      UUID REFERENCES features(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    status          TEXT NOT NULL DEFAULT 'Backlog'
                    CHECK(status = ANY (ARRAY['Backlog'::text, 'ToDo'::text, 'InProgress'::text, 'Active'::text, 'Blocked'::text, 'Done'::text, 'Cancelled'::text, 'Accepted'::text])),
    priority        TEXT NOT NULL DEFAULT 'Medium'
                    CHECK(priority IN ('Low', 'Medium', 'High')),
    start_date      TEXT,
    completion_date TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_requirements_system ON requirements(system_id);
CREATE INDEX idx_requirements_subsystem ON requirements(subsystem_id);
CREATE INDEX idx_requirements_feature ON requirements(feature_id);
CREATE INDEX idx_requirements_status ON requirements(status);

-- ── System Folders ───────────────────────────────────────────────
CREATE TABLE system_folders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id   UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    category    TEXT NOT NULL CHECK(category = ANY (ARRAY['UI'::text, 'Service'::text, 'Library'::text, 'Documentation'::text, 'Config'::text, 'data'::text, 'api'::text])),
    note        TEXT NOT NULL DEFAULT ''
);
CREATE INDEX idx_folders_system ON system_folders(system_id);

-- ── Work Sessions ────────────────────────────────────────────────
CREATE TABLE work_sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id   TEXT NOT NULL,
    parent_type TEXT NOT NULL CHECK(parent_type = ANY (ARRAY['system'::text, 'subsystem'::text, 'feature'::text, 'requirement'::text])),
    parent_name TEXT NOT NULL DEFAULT '',
    context     TEXT NOT NULL DEFAULT '',
    platform    TEXT NOT NULL DEFAULT '',
    model       TEXT NOT NULL DEFAULT '',
    outcome     TEXT,
    status      TEXT NOT NULL DEFAULT 'Pending'
                CHECK(status IN ('Pending', 'Completed')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── System Workspaces ──────────────────────────────────────────
CREATE TABLE system_workspaces (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    system_id        UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    subsystem_id     UUID REFERENCES subsystems(id) ON DELETE CASCADE,
    workspace_path  TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workspaces_system ON system_workspaces(system_id);
CREATE INDEX idx_workspaces_subsystem ON system_workspaces(subsystem_id);

-- ── Auto-update updated_at trigger ───────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_requirements_updated_at
    BEFORE UPDATE ON requirements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_work_sessions_updated_at
    BEFORE UPDATE ON work_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── User Preferences ─────────────────────────────────────────────
CREATE TABLE user_preferences (
    user_id     TEXT NOT NULL DEFAULT 'default',
    key         TEXT NOT NULL,
    value       JSONB NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, key)
);

-- ── Audit Files ────────────────────────────────────────────────
CREATE TABLE audit_files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_path   TEXT UNIQUE NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    size_bytes  INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_files_path ON audit_files(file_path);

CREATE TRIGGER trg_audit_files_updated_at
    BEFORE UPDATE ON audit_files
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── System Info Tabs ─────────────────────────────────────────────
CREATE TABLE system_info_tabs (
    system_id   UUID NOT NULL REFERENCES systems(id) ON DELETE CASCADE,
    tab_id      TEXT NOT NULL,
    content     TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (system_id, tab_id)
);

CREATE TRIGGER trg_user_preferences_updated_at
    BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_system_info_tabs_updated_at
    BEFORE UPDATE ON system_info_tabs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
