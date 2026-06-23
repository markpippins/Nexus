-- V1: Initial schema for Persistent Engineering Brain (PEB)
-- Tables created in the 'peb' schema with corrected names (no peb_ prefix).

CREATE SCHEMA IF NOT EXISTS peb;
SET search_path TO peb;

CREATE TABLE state (
    id UUID PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL,
    content JSONB NOT NULL,
    metadata JSONB,
    checksum VARCHAR(64) NOT NULL,
    version BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY,
    idempotency_key VARCHAR(128) UNIQUE NOT NULL,
    entity_id VARCHAR(128) NOT NULL,
    admission_result VARCHAR(16) NOT NULL,
    tool_name VARCHAR(64) NOT NULL,
    input JSONB NOT NULL,
    output JSONB,
    before_hash VARCHAR(64),
    after_hash VARCHAR(64),
    state_delta JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    committed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE decisions (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES peb.transactions(id),
    adr_number VARCHAR(32),
    title VARCHAR(256) NOT NULL,
    status VARCHAR(32) NOT NULL,
    summary JSONB,
    affected_keys TEXT[],
    entropy_class VARCHAR(32),
    before_hash VARCHAR(64),
    after_hash VARCHAR(64),
    author_id VARCHAR(128) NOT NULL,
    parent_decision_id UUID REFERENCES peb.decisions(id),
    rollback_of UUID REFERENCES peb.decisions(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE traces (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL,
    work_request_id VARCHAR(128) NOT NULL,
    parent_trace_id UUID REFERENCES peb.traces(id),
    stage VARCHAR(64) NOT NULL,
    inputs JSONB,
    causal_entries JSONB,
    rejected_alternatives JSONB,
    confidence REAL NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'observational' CHECK (status = 'observational'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE violations (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES peb.transactions(id),
    violation_type VARCHAR(32) NOT NULL,
    severity VARCHAR(8) NOT NULL,
    entity_id VARCHAR(128),
    capability_attempted VARCHAR(128),
    context JSONB,
    resolution VARCHAR(16),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE capabilities (
    id UUID PRIMARY KEY,
    entity_id VARCHAR(128) NOT NULL,
    capability VARCHAR(128) NOT NULL,
    granted_by VARCHAR(128),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Recreate indexes with corrected table names
CREATE INDEX idx_decisions_parent ON peb.decisions(parent_decision_id);
CREATE INDEX idx_decisions_created ON peb.decisions(created_at DESC);
CREATE INDEX idx_capabilities_entity ON peb.capabilities(entity_id, active);
CREATE INDEX idx_traces_wr ON peb.traces(work_request_id);
CREATE INDEX idx_traces_parent ON peb.traces(parent_trace_id);
CREATE INDEX idx_violations_severity ON peb.violations(severity, created_at);
CREATE INDEX idx_transactions_idempotency ON peb.transactions(idempotency_key);
