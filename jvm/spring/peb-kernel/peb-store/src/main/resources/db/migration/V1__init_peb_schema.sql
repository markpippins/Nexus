-- V1: Initial schema for Persistent Engineering Brain (PEB)

CREATE TABLE peb_state (
    id UUID PRIMARY KEY,
    key VARCHAR(64) UNIQUE NOT NULL,
    content JSONB NOT NULL,
    metadata JSONB,
    checksum VARCHAR(64) NOT NULL,
    version BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE peb_transactions (
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

CREATE TABLE peb_decisions (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES peb_transactions(id),
    adr_number VARCHAR(32),
    title VARCHAR(256) NOT NULL,
    status VARCHAR(32) NOT NULL,
    summary JSONB,
    affected_keys TEXT[],
    entropy_class VARCHAR(32),
    before_hash VARCHAR(64),
    after_hash VARCHAR(64),
    author_id VARCHAR(128) NOT NULL,
    parent_decision_id UUID REFERENCES peb_decisions(id),
    rollback_of UUID REFERENCES peb_decisions(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE peb_traces (
    id UUID PRIMARY KEY,
    transaction_id UUID NOT NULL,
    work_request_id VARCHAR(128) NOT NULL,
    parent_trace_id UUID REFERENCES peb_traces(id),
    stage VARCHAR(64) NOT NULL,
    inputs JSONB,
    causal_entries JSONB,
    rejected_alternatives JSONB,
    confidence REAL NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'observational' CHECK (status = 'observational'),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE peb_violations (
    id UUID PRIMARY KEY,
    transaction_id UUID REFERENCES peb_transactions(id),
    violation_type VARCHAR(32) NOT NULL,
    severity VARCHAR(8) NOT NULL,
    entity_id VARCHAR(128),
    capability_attempted VARCHAR(128),
    context JSONB,
    resolution VARCHAR(16),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL
);

CREATE TABLE peb_capabilities (
    id UUID PRIMARY KEY,
    entity_id VARCHAR(128) NOT NULL,
    capability VARCHAR(128) NOT NULL,
    granted_by VARCHAR(128),
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);
