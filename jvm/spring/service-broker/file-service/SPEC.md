# File Service — Specification

## Functional Requirements

- Store and retrieve binary files with metadata
- Support file versioning (overwrite creates a new version)
- Provide file deletion with soft-delete support
- Generate pre-signed URLs for direct download access

## Non-Functional Requirements

- Maximum file size: 100MB per file
- Storage: configurable local or S3-compatible backend
- Encryption: files encrypted at rest using AES-256

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/files/upload | Upload a file |
| GET | /api/files/{fileId} | Download a file by ID |
| GET | /api/files/{fileId}/metadata | Get file metadata |
| DELETE | /api/files/{fileId} | Soft-delete a file |
| GET | /api/files | List files with pagination and filters |

## Data Model

- FileRecord: id, fileName, mimeType, size, version, storagePath, checksum, createdAt, updatedAt, deletedAt
- FileVersion: id, fileId, versionNumber, storagePath, size, checksum, uploadedAt
