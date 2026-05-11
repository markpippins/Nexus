-- Create operating_systems table if it doesn't exist
CREATE TABLE IF NOT EXISTS operating_systems (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50),
    lts_flag BOOLEAN DEFAULT FALSE,
    active_flag BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default operating systems with versions and LTS flags
INSERT INTO operating_systems (name, version, lts_flag, active_flag) VALUES 
    ('Windows Server', '2022', TRUE, TRUE),
    ('Windows Server', '2019', TRUE, TRUE),
    ('Windows Server', '2016', FALSE, TRUE),
    ('Ubuntu', '24.04', TRUE, TRUE),
    ('Ubuntu', '22.04', TRUE, TRUE),
    ('Ubuntu', '20.04', TRUE, TRUE),
    ('CentOS', 'Stream 9', FALSE, TRUE),
    ('CentOS', '8', FALSE, TRUE),
    ('CentOS', '7', FALSE, TRUE),
    ('Red Hat Enterprise Linux', '9', TRUE, TRUE),
    ('Red Hat Enterprise Linux', '8', TRUE, TRUE),
    ('Debian', '12', TRUE, TRUE),
    ('Debian', '11', TRUE, TRUE),
    ('macOS', 'Sonoma', FALSE, TRUE),
    ('macOS', 'Ventura', FALSE, TRUE),
    ('Alpine Linux', '3.19', FALSE, TRUE),
    ('Amazon Linux', '2023', TRUE, TRUE),
    ('Amazon Linux', '2', TRUE, TRUE),
    ('Rocky Linux', '9', TRUE, TRUE),
    ('Rocky Linux', '8', TRUE, TRUE)
ON DUPLICATE KEY UPDATE name = name;

-- Insert default environment types if they don't exist
INSERT INTO environment_types (name, active_flag) VALUES 
    ('Development', TRUE),
    ('Testing', TRUE),
    ('Staging', TRUE),
    ('Production', TRUE),
    ('DR (Disaster Recovery)', TRUE),
    ('UAT (User Acceptance Testing)', TRUE),
    ('QA (Quality Assurance)', TRUE)
ON DUPLICATE KEY UPDATE name = name;
