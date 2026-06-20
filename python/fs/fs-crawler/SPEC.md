# FS Crawler — Specification

## Functional Requirements

- Scan media file directories and extract rich metadata (audio, video, images, documents)
- Support resumable scanning with Redis-backed state persistence
- Detect duplicate files using audio fingerprinting and content hashing
- Score file quality based on format, bitrate, and resolution
- Apply configurable rules to resolve duplicates (keep best, delete worst)
- Provide a REST API for library management, scanning, search, and rule configuration

## Non-Functional Requirements

- Resumable: scans survive network/power interruptions via checkpoint every 50 files
- Concurrent scanning: configurable max parallel scan operations
- Metadata extraction: supports Mutagen, Pillow, ExifRead, and python-magic
- Storage: MongoDB for metadata, MySQL for configuration, Redis for state

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/v1/stats | File statistics and counts |
| GET | /api/v1/libraries | List configured library paths |
| POST | /api/v1/libraries | Add a library path |
| POST | /api/v1/scan/start | Start a scan operation |
| GET | /api/v1/scan/status | Get scan progress status |
| POST | /api/v1/scan/stop | Stop an active scan |
| GET | /api/v1/search | Search indexed files |
| GET | /api/v1/files/{id} | Get file metadata by ID |
| GET | /api/v1/duplicates/groups | Get duplicate file groups |
| POST | /api/v1/duplicates/resolve | Resolve duplicates using rules |
| POST | /api/v1/rules | Create a custom deletion rule |

## Data Model

- FileRecord: id (UUID), path (String), name (String), size (Long), mimeType (String), checksum (String), metadata (JSON), indexedAt (Instant)
- DuplicateGroup: fingerprint (String), files (FileRecord[]), bestFile (UUID), resolution (String)
- DeletionRule: id (UUID), name (String), conditions (JSON), action (String), priority (Integer)
- ScanState: libraryId (UUID), status (String), filesProcessed (Integer), totalFiles (Integer), checkpoint (Integer), startTime (Instant)
