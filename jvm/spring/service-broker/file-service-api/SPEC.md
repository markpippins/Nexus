# File Service API — Specification

## Functional Requirements

- Define the shared API contract between File Service and its consumers
- Provide DTOs and request/response models for file operations
- Offer a client library for programmatic access to File Service
- Document all file-related endpoints with OpenAPI/Swagger annotations

## Non-Functional Requirements

- Backward-compatible versioning of all DTOs
- Auto-generated OpenAPI 3.0 specification from annotations
- Zero runtime overhead (interface-only, no business logic)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/files/upload | Upload file (multipart) |
| GET | /api/files/{fileId} | Download file |
| GET | /api/files | List files (paginated) |
| DELETE | /api/files/{fileId} | Delete file |

## Data Model

- FileUploadRequest: fileName (String), mimeType (String), content (MultipartFile)
- FileMetadataResponse: id (UUID), fileName (String), mimeType (String), size (Long), version (Integer), createdAt (Instant)
- FileListResponse: items (FileMetadataResponse[]), total (Long), page (Integer)
- ErrorResponse: code (String), message (String), timestamp (Instant)
