-- V9: Add registry.system_type to the registry.categories view
-- The categories view UNIONs all type lookup tables so the frontend can display
-- them uniformly in the Data Dictionary > Categories view.
-- system_type was added in V8 but not included in the view.

DROP VIEW IF EXISTS registry.categories;

CREATE VIEW registry.categories AS
 SELECT framework_type.id,
    framework_type.name,
    framework_type.description,
    framework_type.active_flag,
    framework_type.created_at,
    framework_type.updated_at,
    'framework_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.framework_type
UNION ALL
 SELECT server_type.id,
    server_type.name,
    server_type.description,
    server_type.active_flag,
    server_type.created_at,
    server_type.updated_at,
    'server_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.server_type
UNION ALL
 SELECT library_type.id,
    library_type.name,
    library_type.description,
    library_type.active_flag,
    library_type.created_at,
    library_type.updated_at,
    'library_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.library_type
UNION ALL
 SELECT environment_type.id,
    environment_type.name,
    environment_type.description,
    environment_type.active_flag,
    environment_type.created_at,
    environment_type.updated_at,
    'environment_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.environment_type
UNION ALL
 SELECT service_type.id,
    service_type.name,
    service_type.description,
    service_type.active_flag,
    service_type.created_at,
    service_type.updated_at,
    'service_type'::text AS type,
    service_type.default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.service_type
UNION ALL
 SELECT service_config_type.id,
    service_config_type.name,
    NULL::character varying AS description,
    service_config_type.active_flag,
    service_config_type.created_at,
    service_config_type.updated_at,
    'service_config_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.service_config_type
UNION ALL
 SELECT operating_systems.id,
    operating_systems.name,
    operating_systems.description,
    operating_systems.active_flag,
    operating_systems.created_at,
    operating_systems.updated_at,
    'operating_systems'::text AS type,
    NULL::bigint AS default_component_id,
    operating_systems.architecture,
    operating_systems.family,
    operating_systems.lts_flag,
    operating_systems.version
   FROM registry.operating_systems
UNION ALL
 SELECT system_type.id,
    system_type.name,
    system_type.description,
    system_type.active_flag,
    system_type.created_at::timestamp without time zone,
    system_type.updated_at::timestamp without time zone,
    'system_type'::text AS type,
    NULL::bigint AS default_component_id,
    NULL::character varying AS architecture,
    NULL::character varying AS family,
    NULL::boolean AS lts_flag,
    NULL::character varying AS version
   FROM registry.system_type;
