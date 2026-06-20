-- Terrain Schema DDL — terrain PostgreSQL tables
-- Schema 'terrain' in the 'nexus' database
-- Generated from JPA entities in jvm/spring/terrain

SET search_path TO terrain;

-- Service Types (lookup)
CREATE TABLE IF NOT EXISTS service_types (
    id   BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE
);

-- Servers / Hosts
CREATE TABLE IF NOT EXISTS servers (
    id            BIGSERIAL PRIMARY KEY,
    hostname      VARCHAR(255) NOT NULL UNIQUE,
    ip_address    VARCHAR(45),
    os            VARCHAR(100),
    status        VARCHAR(50),
    startup            VARCHAR(500),
    startup_script     VARCHAR(500),
    build_command      VARCHAR(500),
    health             VARCHAR(500),
    sysuser      VARCHAR(255),
    syspass      VARCHAR(255),
    notes              VARCHAR(1000),
    is_internal        BOOLEAN NOT NULL DEFAULT TRUE,
    active_flag        BOOLEAN NOT NULL DEFAULT TRUE
);

-- MCP Servers
CREATE TABLE IF NOT EXISTS mcp_servers (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    port             INTEGER,
    workspace_path   VARCHAR(500),
    service_type_id  BIGINT REFERENCES service_types(id),
    health_check_url VARCHAR(500),
    status           VARCHAR(50),
    transport_type   VARCHAR(50),
    version          VARCHAR(50),
    description      VARCHAR(1000),
    repository_url   VARCHAR(500),
    startup            VARCHAR(500),
    startup_script     VARCHAR(500),
    build_command      VARCHAR(500),
    health             VARCHAR(500),
    sysuser      VARCHAR(255),
    syspass      VARCHAR(255),
    notes              VARCHAR(1000),
    is_internal        BOOLEAN NOT NULL DEFAULT TRUE,
    active_flag        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Runnable Services / Microservices
CREATE TABLE IF NOT EXISTS runnable_services (
    id               BIGSERIAL PRIMARY KEY,
    name             VARCHAR(255) NOT NULL,
    port             INTEGER,
    workspace_path   VARCHAR(500),
    service_type_id  BIGINT REFERENCES service_types(id),
    health_check_url VARCHAR(500),
    status           VARCHAR(50),
    version          VARCHAR(50),
    description      VARCHAR(1000),
    repository_url   VARCHAR(500),
    startup            VARCHAR(500),
    startup_script     VARCHAR(500),
    build_command      VARCHAR(500),
    health             VARCHAR(500),
    sysuser      VARCHAR(255),
    syspass      VARCHAR(255),
    notes              VARCHAR(1000),
    is_internal        BOOLEAN NOT NULL DEFAULT TRUE,
    active_flag        BOOLEAN NOT NULL DEFAULT TRUE
);

-- Polymorphic Service Dependencies
CREATE TABLE IF NOT EXISTS service_dependencies (
    id          BIGSERIAL PRIMARY KEY,
    source_type VARCHAR(50) NOT NULL,
    source_id   BIGINT NOT NULL,
    target_type VARCHAR(50) NOT NULL,
    target_id   BIGINT NOT NULL,
    criticality VARCHAR(50),
    description VARCHAR(1000)
);
CREATE INDEX IF NOT EXISTS idx_sd_source ON service_dependencies(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_sd_target ON service_dependencies(target_type, target_id);

-- CLI Tools
CREATE TABLE IF NOT EXISTS cli_tools (
    id             BIGSERIAL PRIMARY KEY,
    name           VARCHAR(255) NOT NULL,
    tool_path      VARCHAR(500),
    description    VARCHAR(1000),
    invocation     VARCHAR(500),
    language       VARCHAR(50),
    category       VARCHAR(100),
    startup            VARCHAR(500),
    startup_script     VARCHAR(500),
    build_command      VARCHAR(500),
    health             VARCHAR(500),
    sysuser      VARCHAR(255),
    syspass      VARCHAR(255),
    notes              VARCHAR(1000),
    is_internal    BOOLEAN NOT NULL DEFAULT TRUE,
    active_flag    BOOLEAN NOT NULL DEFAULT TRUE
);
