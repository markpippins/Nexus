# Upload Service — Specification

## Functional Requirements

- Accept large file uploads with resumable chunked transfer
- Validate file type, size, and integrity (checksum) before processing
- Generate thumbnail previews for images and PDFs
- Notify downstream services on upload completion via event bus
- Support parallel chunk upload and reassembly

## Non-Functional Requirements

- Maximum upload size: 2GB (chunked)
- Chunk size: configurable (default 5MB)
- Resumable: partial uploads survive connection drops for up to 24 hours

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/uploads/init | Initialize a new upload session |
| POST | /api/uploads/{sessionId}/chunk | Upload a chunk of data |
| GET | /api/uploads/{sessionId}/status | Get upload progress and missing chunks |
| POST | /api/uploads/{sessionId}/complete | Finalize upload and trigger processing |
| GET | /api/uploads/{sessionId} | Get upload session metadata |
| DELETE | /api/uploads/{sessionId} | Cancel and clean up an upload session |

## Data Model

- UploadSession: id (UUID), fileName, mimeType, totalSize, chunkCount, receivedChunks, status (PENDING|IN_PROGRESS|COMPLETED|FAILED), checksum, createdAt, expiresAt
- UploadChunk: id (UUID), sessionId (UUID), chunkIndex (Integer), size (Long), checksum (String), receivedAt
