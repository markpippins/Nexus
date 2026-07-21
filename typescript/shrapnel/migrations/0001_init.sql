-- ============================================================================
-- Shrapnel Relational Object Store / EAV System
-- Schema DDL (PostgreSQL 15+)
-- ============================================================================
-- Creates the full EAV metadata + value tables used by the shrapnel system.
-- Design follows the encoding contract:
--   field_type  -> type registry (1:Long, 2:String, 3:Double, 4:Boolean,
--                              5:Timestamp, 6:JSONB, 7:UUID)
--   field       -> attribute name + property_name upsert key
--   object_instance -> concrete entity instance row
--   value       -> base entry referencing value_type_code
--   value_<type>-> physical typed extension tables (1:1 with value.id)
--   object_attribute_value -> junction (object_id + field_id) -> value_id
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS shrapnel AUTHORIZATION pguser;

-- ----------------------------------------------------------------------------
-- field_type: type code registry
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shrapnel.field_type (
    code           smallint    PRIMARY KEY,
    name           text       NOT NULL UNIQUE,
    description    text,
    pg_type        text       NOT NULL  -- e.g. 'integer', 'text', 'double precision'
);

COMMENT ON TABLE  shrapnel.field_type IS 'Type mapping registry for shrapnel EAV values.';
COMMENT ON COLUMN shrapnel.field_type.code IS '1=Long, 2=String, 3=Double, 4=Boolean, 5=Timestamp, 6=JSONB, 7=UUID';

-- ----------------------------------------------------------------------------
-- field: attribute metadata
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shrapnel.field (
    id               bigserial    PRIMARY KEY,
    is_calculated    boolean      NOT NULL DEFAULT false,
    field_index      integer      NOT NULL,
    label            text,
    name             text,
    property_name    text         NOT NULL,
    field_type_code  smallint     NOT NULL REFERENCES shrapnel.field_type(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_field_property_name UNIQUE (property_name)
);

CREATE INDEX IF NOT EXISTS idx_field_type_code      ON shrapnel.field (field_type_code);
CREATE INDEX IF NOT EXISTS idx_field_name          ON shrapnel.field (name);
CREATE INDEX IF NOT EXISTS idx_field_label         ON shrapnel.field (label);

COMMENT ON TABLE  shrapnel.field          IS 'Attribute metadata: maps a logical attribute name to a field_type_code.';
COMMENT ON COLUMN shrapnel.field.property_name IS 'Unique upsert key used by ON CONFLICT (property_name).';

-- ----------------------------------------------------------------------------
-- object_instance: atomic entity record
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shrapnel.object_instance (
    id           bigserial    PRIMARY KEY,
    created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_object_instance_created_at ON shrapnel.object_instance (created_at);

COMMENT ON TABLE shrapnel.object_instance IS 'Concrete object/entity instance. Holds no payload by design (EAV).';

-- ----------------------------------------------------------------------------
-- value: base entry for every concrete attribute value
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shrapnel.value (
    id                bigserial    PRIMARY KEY,
    value_type_code   smallint     NOT NULL REFERENCES shrapnel.field_type(code) ON UPDATE CASCADE ON DELETE RESTRICT,
    created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_value_type_code ON shrapnel.value (value_type_code);

COMMENT ON TABLE shrapnel.value IS 'Base entry for every concrete attribute value; joined 1:1 to one value_<type> extension.';

-- ----------------------------------------------------------------------------
-- value_<type> extension tables (1:1 with value.id)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shrapnel.value_long (
    id     bigint   PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
    value  bigint   NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_string (
    id     bigint   PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
    value  text    NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_double (
    id     bigint              PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
    value  double precision    NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_boolean (
    id     bigint   PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
    value  boolean  NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_timestamp (
    id           bigint        PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
    value         timestamptz  NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_jsonb (
    id     bigint  PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
    value  jsonb  NOT NULL
);

CREATE TABLE IF NOT EXISTS shrapnel.value_uuid (
    id     bigint  PRIMARY KEY REFERENCES shrapnel.value(id) ON DELETE CASCADE,
    value  uuid    NOT NULL
);

COMMENT ON TABLE shrapnel.value_long      IS 'Long typed value extension (field_type_code = 1).';
COMMENT ON TABLE shrapnel.value_string    IS 'String typed value extension (field_type_code = 2).';
COMMENT ON TABLE shrapnel.value_double     IS 'Double typed value extension (field_type_code = 3).';
COMMENT ON TABLE shrapnel.value_boolean    IS 'Boolean typed value extension (field_type_code = 4).';
COMMENT ON TABLE shrapnel.value_timestamp  IS 'Timestamp typed value extension (field_type_code = 5).';
COMMENT ON TABLE shrapnel.value_jsonb      IS 'JSONB typed value extension (field_type_code = 6).';
COMMENT ON TABLE shrapnel.value_uuid       IS 'UUID typed value extension (field_type_code = 7).';

-- ----------------------------------------------------------------------------
-- object_attribute_value: junction table binding object_id + field_id -> value_id
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shrapnel.object_attribute_value (
    id           bigserial    PRIMARY KEY,
    object_id    bigint       NOT NULL REFERENCES shrapnel.object_instance(id) ON DELETE CASCADE,
    field_id     bigint       NOT NULL REFERENCES shrapnel.field(id)          ON DELETE CASCADE,
    value_id     bigint       NOT NULL REFERENCES shrapnel.value(id)          ON DELETE CASCADE,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT uq_oav_object_field UNIQUE (object_id, field_id)
);

CREATE INDEX IF NOT EXISTS idx_oav_object_id   ON shrapnel.object_attribute_value (object_id);
CREATE INDEX IF NOT EXISTS idx_oav_field_id    ON shrapnel.object_attribute_value (field_id);
CREATE INDEX IF NOT EXISTS idx_oav_value_id     ON shrapnel.object_attribute_value (value_id);

COMMENT ON TABLE shrapnel.object_attribute_value IS 'Junction: this objects has this value (id) for this field.';
COMMENT ON CONSTRAINT uq_oav_object_field ON shrapnel.object_attribute_value IS 'An object can have at most one value per field.';

-- ----------------------------------------------------------------------------
-- Optional: update updated_at automatically on `field`
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION shrapnel.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_field_set_updated_at ON shrapnel.field;
CREATE TRIGGER trg_field_set_updated_at
    BEFORE UPDATE ON shrapnel.field
    FOR EACH ROW
    EXECUTE FUNCTION shrapnel.set_updated_at();

-- ----------------------------------------------------------------------------
-- Seed the field_type registry (idempotent)
-- ----------------------------------------------------------------------------
INSERT INTO shrapnel.field_type (code, name, description, pg_type) VALUES
    (1, 'Long',      '64-bit integer',                   'bigint'),
    (2, 'String',    'UTF-8 text',                       'text'),
    (3, 'Double',    'IEEE 754 double precision float',  'double precision'),
    (4, 'Boolean',   'true/false',                       'boolean'),
    (5, 'Timestamp',  'point in time with tz',            'timestamptz'),
    (6, 'JSONB',     'structured JSON document',          'jsonb'),
    (7, 'UUID',      'UUID',                             'uuid')
ON CONFLICT (code) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    pg_type     = EXCLUDED.pg_type;

-- ============================================================================
-- Done.
-- ============================================================================
