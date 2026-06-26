# File System Server — Specification

## Functional Requirements

- Serve static files from a configurable root directory
- Support directory listing and file metadata retrieval
- Provide file upload capabilities for authorized clients
- Enforce path traversal prevention to restrict access to root directory
- Serve files with correct MIME types based on file extensions

## Non-Functional Requirements

- Throughput: 1,000+ requests per second for static file serving
- P99 latency: under 10ms for cached file reads
- Maximum single file size: 500MB
- Directory listing disabled by default for security

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /files/* | Serve a file by path |
| GET | /files/*/meta | Get file metadata (size, type, modified) |
| POST | /files/* | Upload a file to the specified path |
| DELETE | /files/* | Delete a file at the specified path |
| GET | /files/*/list | List directory contents (if enabled) |

## Data Model

- FileMetadata: path (String), name (String), size (Long), mimeType (String), isDirectory (Boolean), createdAt (Instant), modifiedAt (Instant)
- UploadResult: path (String), size (Long), checksum (String), status (String), createdAt (Instant)
