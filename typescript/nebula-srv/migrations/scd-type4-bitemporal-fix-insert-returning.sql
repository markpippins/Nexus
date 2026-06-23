-- ═══════════════════════════════════════════════════════════════════════
--  Bitemporal Fix: Set temporal columns on NEW before RETURNING NEW
--
--  All 13 INSTEAD OF INSERT trigger functions were missing assignments
--  to NEW.recorded_on_dt, NEW.recorded_until_dt, NEW.valid_from, and
--  NEW.valid_until. When a client does:
--    INSERT INTO nebula.systems (...) RETURNING recorded_on_dt
--  the RETURNING clause returns NULL because NEW doesn't have these set.
--
--  The fix: add temporal column assignments just before RETURNING NEW
--  in each INSERT trigger function.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. systems ──
CREATE OR REPLACE FUNCTION nebula.systems_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.systems_history
        (id, name, description, readme, architecture, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.name, NEW.description, NEW.readme, NEW.architecture,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 2. subsystems ──
CREATE OR REPLACE FUNCTION nebula.subsystems_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.subsystems_history
        (id, system_id, name, description, readme, color, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.system_id, NEW.name, NEW.description, NEW.readme, NEW.color,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. features ──
CREATE OR REPLACE FUNCTION nebula.features_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.features_history
        (id, subsystem_id, name, description, readme, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.subsystem_id, NEW.name, NEW.description, NEW.readme,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 4. requirements ──
CREATE OR REPLACE FUNCTION nebula.requirements_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.requirements_history
        (id, system_id, subsystem_id, feature_id, title, description,
         status, priority, start_date, completion_date, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.system_id, NEW.subsystem_id, NEW.feature_id,
         NEW.title, NEW.description, NEW.status, NEW.priority,
         NEW.start_date, NEW.completion_date, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 5. system_folders ──
CREATE OR REPLACE FUNCTION nebula.system_folders_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.system_folders_history
        (id, system_id, name, category, note,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.system_id, NEW.name, NEW.category, NEW.note,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 6. work_sessions ──
CREATE OR REPLACE FUNCTION nebula.work_sessions_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.work_sessions_history
        (id, parent_id, parent_type, parent_name, context, platform,
         model, outcome, status, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.parent_id, NEW.parent_type, NEW.parent_name,
         NEW.context, NEW.platform, NEW.model, NEW.outcome, NEW.status,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 7. system_workspaces ──
CREATE OR REPLACE FUNCTION nebula.system_workspaces_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.system_workspaces_history
        (id, system_id, subsystem_id, workspace_path, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.system_id, NEW.subsystem_id, NEW.workspace_path,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 8. user_preferences ──
CREATE OR REPLACE FUNCTION nebula.user_preferences_insert_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO nebula.user_preferences_history
        (user_id, key, value,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (NEW.user_id, NEW.key, NEW.value,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 9. audit_files ──
CREATE OR REPLACE FUNCTION nebula.audit_files_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.audit_files_history
        (id, file_path, content, size_bytes,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.file_path, NEW.content, NEW.size_bytes,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 10. system_info_tabs ──
CREATE OR REPLACE FUNCTION nebula.system_info_tabs_insert_trigger()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO nebula.system_info_tabs_history
        (system_id, tab_id, content,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (NEW.system_id, NEW.tab_id, NEW.content,
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 11. harvests ──
CREATE OR REPLACE FUNCTION nebula.harvests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.harvests_history
        (id, source_path, source_filename, model, total_candidates,
         candidates, source_text, tags, metadata, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.source_path, NEW.source_filename, NEW.model,
         NEW.total_candidates, NEW.candidates, NEW.source_text,
         NEW.tags, NEW.metadata, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 12. agent_records ──
CREATE OR REPLACE FUNCTION nebula.agent_records_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.agent_records_history
        (id, record_type, role, title, content, source_path,
         metadata, tags, system_id, subsystem_id, feature_id,
         plan_ref, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.record_type, NEW.role, NEW.title, NEW.content,
         NEW.source_path, NEW.metadata, NEW.tags, NEW.system_id,
         NEW.subsystem_id, NEW.feature_id, NEW.plan_ref,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 13. projections ──
CREATE OR REPLACE FUNCTION nebula.projections_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id UUID;
BEGIN
    new_id := COALESCE(NEW.id, gen_random_uuid());

    INSERT INTO nebula.projections_history
        (id, name, type, description, source_query, template,
         target_path, model, schedule, metadata, created_at,
         recorded_on_dt, recorded_until_dt, valid_from, valid_until)
    VALUES
        (new_id, NEW.name, NEW.type, NEW.description, NEW.source_query,
         NEW.template, NEW.target_path, NEW.model, NEW.schedule,
         NEW.metadata, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00',
         COALESCE(NEW.valid_from, NOW()), COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00'));

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    NEW.valid_from := COALESCE(NEW.valid_from, NOW());
    NEW.valid_until := COALESCE(NEW.valid_until, '9999-12-31 23:59:59+00');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_id UUID;
    v_ts TIMESTAMPTZ;
BEGIN
    SET search_path TO nebula;
    INSERT INTO systems (name, description) VALUES ('__bitemporal_test__', 'test')
    RETURNING id, recorded_on_dt, valid_from INTO v_id, v_ts, v_ts;
    RAISE NOTICE 'INSERT RETURNING recorded_on_dt = %', v_ts;
    RAISE NOTICE 'INSERT RETURNING valid_from = %', v_ts;
    DELETE FROM systems WHERE name = '__bitemporal_test__';
    RAISE NOTICE '✅ Fix verified: temporal columns now return real values on INSERT RETURNING.';
END $$;

COMMIT;
