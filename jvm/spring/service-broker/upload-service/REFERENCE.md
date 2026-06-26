# Upload Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `upload.chunk-size-bytes` | 5242880 | Chunk size (5MB default) |
| `upload.max-file-size-bytes` | 2147483648 | Maximum upload size (2GB) |
| `upload.session-timeout-hours` | 24 | Session expiry for incomplete uploads |
| `upload.thumbnail.enabled` | true | Enable thumbnail generation for images |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `UPLOAD_CHUNK_SIZE` | 5242880 | Upload chunk size in bytes |
| `UPLOAD_MAX_FILE_SIZE` | 2147483648 | Maximum file size in bytes |
| `UPLOAD_TEMP_DIR` | /tmp/uploads | Temporary directory for chunk storage |
| `SPRING_PROFILES_ACTIVE` | dev | Active Spring profile |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `curl -X POST -H "Content-Type: application/json" -d '{"fileName":"test.pdf","totalSize":1000000}' http://localhost:{port}/api/uploads/init` | Initialize a test upload session |

## Troubleshooting

- **Upload fails mid-transfer**: Use `GET /api/uploads/{sessionId}/status` to see which chunks are missing, then re-upload only the missing chunks
- **Chunk checksum mismatch**: The chunk data may be corrupted — verify the checksum algorithm matches between client and server
- **Session expired**: Incomplete upload sessions expire after `upload.session-timeout-hours` — re-initialize a new session
- **Thumbnail not generated**: Verify `upload.thumbnail.enabled` is true and that ImageMagick or similar is installed on the server
