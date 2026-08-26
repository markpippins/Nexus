-- V128 — Complete the shrapnel EAV object store (decision-card persistence)
-- ============================================================================
-- Background
--   shrapnel is the nexus "fragmentation / derived artifacts" schema. It was
--   created with the QBE-era tables (qbe_*, field, value, value_string,
--   value_long, value_type, data_source) but the full Relational Object
--   Store / EAV model defined by typescript/shrapnel/migrations/0001_init.sql
--   (field_type registry, object_instance, value_<type> extensions and the
--   object_attribute_value junction) was never applied to this database.
--
--   This migration completes the dormant EAV surface so decision-card
--   submissions (Assembly "Agreed selection:" replies) can be stored as
--   derived artifacts: one object_instance per submission, typed fields via
--   the extension tables, values joined through object_attribute_value.
--
--   It is the nexus projection of the canonical shrapnel-srv migrations
--   (0001_init.sql + 0002_value_extension_type_guard.sql), made idempotent
--   and compatible with the pre-existing legacy tables in this database:
--     * shrapnel.field / shrapnel.value / shrapnel.value_string /
--       shrapnel.value_long already exist in the QBE-era shape (no
--       defaults, no unique constraint on field.property_name) — this
--       migration back-fits identity defaults + the unique constraint so
--       both the shrapnel-srv encode path and new writers can upsert.
--
-- Safe to re-run (all guards are IF NOT EXISTS / DO blocks).

BEGIN;

-- ── field_type: type code registry ──────────────────────────────────────
-- (exists in legacy shape code/name only; extend + seed the 1..7 catalog
-- used by value.value_type_code)

ALTER TABLE shrapnel.field_type ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE shrapnel.field_type ADD COLUMN IF NOT EXISTS pg_type text;

-- Legacy table has no unique key on code; add one so ON CONFLICT works.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pk_field_type_code' AND connamespace = 'shrapnel'::regnamespace
  ) THEN
    ALTER TABLE shrapnel.field_type ADD CONSTRAINT pk_field_type_code PRIMARY KEY (code);
  END IF;
END $$;

INSERT INTO shrapnel.field_type (code, name, description, pg_type) VALUES
  (1, 'Long',      '64-bit integer',                                 'bigint'),
  (2, 'String',    'variable-length text (varchar/text)',            'text'),
  (3, 'Double',    'IEEE double precision',                         'double precision'),
  (4, 'Boolean',   'true / false',                                  'boolean'),
  (5, 'Timestamp', 'timestamptz',                                   'timestamptz'),
  (6, 'JSONB',     'arbitrary JSON document',                       'jsonb'),
  (7, 'UUID',      'uuid',                                          'uuid')
ON CONFLICT (code) DO NOTHING;

-- ─── field: property_name upsert key (needed by ON CONFLICT) ────────

-- Legacy table has no identity default; wire the existing sequence.
ALTER TABLE shrapnel.field
  ALTER COLUMN id SET DEFAULT nextval('shrapnel.field_seq'::regclass);

-- Unique property_name so ON CONFLICT (property_name) works for writers.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_field_property_name' AND connamespace = 'shrapnel'::regnamespace
  ) THEN
    -- zero-row legacy table: safe to add a strict unique constraint
    ALTER TABLE shrapnel.field
      ADD CONSTRAINT uq_field_property_name UNIQUE (property_name);
  END IF;
END $$;

-- ─── object_instance: one row per decision submission ────────────────

CREATE TABLE IF NOT EXISTS shrapnel.object_instance (
  id         bigserial   PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_object_instance_created_at
  ON shrapnel.object_instance (created_at);

-- ─── value: base row for every concrete value ─────────────────────────
-- Legacy table lacks an id default; wire the existing sequence.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attrdef a
    JOIN pg_class c ON c.oid = a.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'shrapnel' AND c.relname = 'value'
      AND pg_get_expr(a.adbin, a.adrelid) LIKE '%value_seq%'
  ) THEN
    ALTER TABLE shrapnel.value
      ALTER COLUMN id SET DEFAULT nextval('shrapnel.value_seq'::regclass);
  END IF;
END $$;

-- Legacy value_string / value_long: id defaults so both services can
-- insert without implicit casts.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'shrapnel' AND table_name = 'value_string' AND column_name = 'id'
      AND column_default LIKE '%nextval%'
  ) THEN
    ALTER TABLE shrapnel.value_string
      ALTER COLUMN id SET DEFAULT nextval('shrapnel.value_string_seq'::regclass);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'shrapnel' AND table_name = 'value_long' AND column_name = 'id'
      AND column_default LIKE '%nextval%'
  ) THEN
    ALTER TABLE shrapnel.value_long
      ALTER COLUMN id SET DEFAULT nextval('shrapnel.value_long_seq'::regclass);
  END IF;
END $$;

-- ─── legacy key repair: QBE-era tables carry no primary keys ───────────
-- object_attribute_value references field(id) and value(id), and the
-- value_<type> extensions reference value(id) — all need real keys.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_shrapnel_field' AND connamespace = 'shrapnel'::regnamespace) THEN
    ALTER TABLE shrapnel.field ADD CONSTRAINT pk_shrapnel_field PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_shrapnel_value' AND connamespace = 'shrapnel'::regnamespace) THEN
    ALTER TABLE shrapnel.value ADD CONSTRAINT pk_shrapnel_value PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_shrapnel_value_string' AND connamespace = 'shrapnel'::regnamespace) THEN
    ALTER TABLE shrapnel.value_string ADD CONSTRAINT pk_shrapnel_value_string PRIMARY KEY (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pk_shrapnel_value_long' AND connamespace = 'shrapnel'::regnamespace) THEN
    ALTER TABLE shrapnel.value_long ADD CONSTRAINT pk_shrapnel_value_long PRIMARY KEY (id);
  END IF;
END $$;

-- ─── value_<type> extension tables (1:1 with value.id) ────────────────
-- value_string / value_long already exist in the QBE-era shape; the rest
-- are created here for the full 1..7 registry.

CREATE TABLE IF NOT EXISTS shrapnel.value_double (
  id     bigint           PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
  value  double precision NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_boolean (
  id     bigint   PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
  value  boolean  NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_timestamp (
  id     bigint      PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
  value  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_jsonb (
  id     bigint PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
  value  jsonb  NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_uuid (
  id     bigint PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
  value  uuid   NOT NULL
);

-- ─── object_attribute_value: junction object_id + field_id -> value_id ─

CREATE TABLE IF NOT EXISTS shrapnel.object_attribute_value (
  id         bigserial PRIMARY KEY,
  object_id  bigint    NOT NULL REFERENCES shrapnel.object_instance(id) ON DELETE CASCADE,
  field_id   bigint    NOT NULL REFERENCES shrapnel.field(id)          ON DELETE CASCADE,
  value_id   bigint    NOT NULL REFERENCES shrapnel.value(id)          ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_oav_object_field UNIQUE (object_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_oav_object_id ON shrapnel.object_attribute_value (object_id);
CREATE INDEX IF NOT EXISTS idx_oav_field_id  ON shrapnel.object_attribute_value (field_id);
CREATE INDEX IF NOT EXISTS idx_oav_value_id  ON shrapnel.object_attribute_value (value_id);

-- ─── 0002: value <-> value_<type> type-match guard ─────────────────────

CREATE OR REPLACE FUNCTION shrapnel.assert_extension_type_matches()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    expected_code smallint := TG_ARGV[0]::smallint;
    actual_code   smallint;
BEGIN
    SELECT value_type_code INTO actual_code
    FROM shrapnel.value
    WHERE id = NEW.id;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            'shrapnel.%: insert into extension for value_id=% but no parent row exists in shrapnel.value',
            TG_TABLE_NAME, NEW.id;
    END IF;

    IF actual_code <> expected_code THEN
        RAISE EXCEPTION
            'shrapnel.%: type-match violation for value_id=%: extension requires value_type_code=% but parent has %',
            TG_TABLE_NAME, NEW.id, expected_code, actual_code;
    END IF;

    RETURN NEW;
END;
$$;

DO $$
DECLARE
    pair RECORD;
BEGIN
    FOR pair IN
        SELECT ext AS ext_table, code AS expected_code
        FROM (VALUES
            ('value_long',      1),
            ('value_string',    2),
            ('value_double',    3),
            ('value_boolean',   4),
            ('value_timestamp', 5),
            ('value_jsonb',     6),
            ('value_uuid',      7)
        ) AS v(ext, code)
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON shrapnel.%I;',
            'trg_' || pair.ext_table || '_type_guard', pair.ext_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I
                BEFORE INSERT OR UPDATE ON shrapnel.%I
                FOR EACH ROW
                EXECUTE FUNCTION shrapnel.assert_extension_type_matches(%L);',
            'trg_' || pair.ext_table || '_type_guard', pair.ext_table,
            pair.expected_code::text
        );
    END LOOP;
END $$;

COMMIT;