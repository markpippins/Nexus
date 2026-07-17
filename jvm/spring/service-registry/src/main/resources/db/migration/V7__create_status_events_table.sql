-- Status transition history for real-time monitoring.
-- Records every health state change so we can answer "when did X go unhealthy?"
CREATE TABLE IF NOT EXISTS registry.status_events (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    service_name    VARCHAR(255) NOT NULL,
    old_state       VARCHAR(50),
    new_state       VARCHAR(50) NOT NULL,
    reason          VARCHAR(255),
    response_time_ms BIGINT,
    error_message   TEXT,
    changed_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX idx_status_events_service (service_name),
    INDEX idx_status_events_changed (changed_at),
    INDEX idx_status_events_service_changed (service_name, changed_at)
);
