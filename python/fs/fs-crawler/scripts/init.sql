-- Initialize MySQL database with basic schema
-- Based on the existing system's MySQL usage for configuration

CREATE DATABASE IF NOT EXISTS media;
USE media;

-- Library paths configuration (replaces the shallow.py directories concept)
CREATE TABLE library_paths (
    id INT AUTO_INCREMENT PRIMARY KEY,
    path VARCHAR(1000) NOT NULL,
    name VARCHAR(255),
    scan_enabled BOOLEAN DEFAULT TRUE,
    deep_scan BOOLEAN DEFAULT FALSE,
    path_type ENUM('album', 'compilation', 'recent', 'general') DEFAULT 'general',
    
    -- Duplicate deletion rules
    auto_delete_duplicates BOOLEAN DEFAULT FALSE,
    delete_lower_quality BOOLEAN DEFAULT TRUE,
    quality_threshold INT DEFAULT 100, -- Minimum quality difference to trigger deletion
    preferred_formats VARCHAR(255) DEFAULT 'FLAC,MP3', -- Comma-separated preferred formats
    deletion_priority INT DEFAULT 50, -- Higher = more likely to be deleted when duplicate found
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_path (path(255))
);

-- File type registry (modernized from SQLFileType)
CREATE TABLE file_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    extension VARCHAR(20) NOT NULL,
    mime_type VARCHAR(100),
    category ENUM('audio', 'video', 'image', 'document', 'other') DEFAULT 'other',
    description VARCHAR(255),
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_extension (extension)
);

-- Metadata handlers registry (modernized from SQLFileHandler)
CREATE TABLE metadata_handlers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    handler_class VARCHAR(255) NOT NULL,
    priority INT DEFAULT 100,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_name (name)
);

-- Handler to file type mappings
CREATE TABLE handler_file_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    handler_id INT NOT NULL,
    file_type_id INT NOT NULL,
    FOREIGN KEY (handler_id) REFERENCES metadata_handlers(id) ON DELETE CASCADE,
    FOREIGN KEY (file_type_id) REFERENCES file_types(id) ON DELETE CASCADE,
    UNIQUE KEY unique_mapping (handler_id, file_type_id)
);

-- Scan operations tracking (simplified from the complex ops system)
CREATE TABLE scan_operations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    path VARCHAR(1000) NOT NULL,
    operation_type ENUM('scan', 'read', 'deep_scan') NOT NULL,
    status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    error_message TEXT,
    files_processed INT DEFAULT 0,
    INDEX idx_path_type (path(255), operation_type),
    INDEX idx_status (status)
);

-- Insert default file types
INSERT INTO file_types (extension, mime_type, category, description) VALUES
('mp3', 'audio/mpeg', 'audio', 'MP3 Audio'),
('flac', 'audio/flac', 'audio', 'FLAC Audio'),
('wav', 'audio/wav', 'audio', 'WAV Audio'),
('m4a', 'audio/mp4', 'audio', 'M4A Audio'),
('ogg', 'audio/ogg', 'audio', 'OGG Audio'),
('mp4', 'video/mp4', 'video', 'MP4 Video'),
('mkv', 'video/x-matroska', 'video', 'Matroska Video'),
('avi', 'video/x-msvideo', 'video', 'AVI Video'),
('jpg', 'image/jpeg', 'image', 'JPEG Image'),
('jpeg', 'image/jpeg', 'image', 'JPEG Image'),
('png', 'image/png', 'image', 'PNG Image'),
('gif', 'image/gif', 'image', 'GIF Image'),
('pdf', 'application/pdf', 'document', 'PDF Document'),
('txt', 'text/plain', 'document', 'Text File');

-- Duplicate resolution tracking
CREATE TABLE duplicate_resolutions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    duplicate_group_id VARCHAR(64) NOT NULL, -- Hash/fingerprint identifying the group
    kept_file_path VARCHAR(1000) NOT NULL,
    deleted_file_path VARCHAR(1000) NOT NULL,
    resolution_reason TEXT,
    quality_score_diff INT,
    path_type_kept VARCHAR(50),
    path_type_deleted VARCHAR(50),
    resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_by ENUM('auto', 'manual') DEFAULT 'auto',
    INDEX idx_group_id (duplicate_group_id),
    INDEX idx_resolved_at (resolved_at)
);

-- Insert default metadata handlers
INSERT INTO metadata_handlers (name, handler_class, priority) VALUES
('audio_mutagen', 'handlers.audio.MutagenHandler', 100),
('image_exif', 'handlers.image.ExifHandler', 100),
('video_ffprobe', 'handlers.video.FFProbeHandler', 100),
('generic_file', 'handlers.generic.FileHandler', 200);

-- Map handlers to file types
INSERT INTO handler_file_types (handler_id, file_type_id)
SELECT h.id, f.id 
FROM metadata_handlers h, file_types f 
WHERE h.name = 'audio_mutagen' AND f.category = 'audio';

INSERT INTO handler_file_types (handler_id, file_type_id)
SELECT h.id, f.id 
FROM metadata_handlers h, file_types f 
WHERE h.name = 'image_exif' AND f.category = 'image';

INSERT INTO handler_file_types (handler_id, file_type_id)
SELECT h.id, f.id 
FROM metadata_handlers h, file_types f 
WHERE h.name = 'video_ffprobe' AND f.category = 'video';