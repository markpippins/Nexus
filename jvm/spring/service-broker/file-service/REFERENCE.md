# File Service — Reference Guide

## Configuration

| Property | Default | Description |
|----------|---------|-------------|
| `server.port` | TBD | Service port (inherited from parent) |
| `file.storage.backend` | local | Storage backend: local or s3 |
| `file.storage.local.path` | ./data/files | Local storage directory |
| `file.max-size-mb` | 100 | Maximum file size in MB |
| `file.encryption.enabled` | true | Enable at-rest encryption |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FILE_STORAGE_BACKEND` | local | Storage backend type |
| `FILE_STORAGE_PATH` | ./data/files | Path for local file storage |
| `FILE_MAX_SIZE_MB` | 100 | Maximum allowed file size |
| `AWS_ACCESS_KEY_ID` | — | S3 access key (if using S3 backend) |
| `AWS_SECRET_ACCESS_KEY` | — | S3 secret key (if using S3 backend) |
| `AWS_S3_BUCKET` | — | S3 bucket name (if using S3 backend) |

## Commands

| Command | Description |
|---------|-------------|
| `./mvnw spring-boot:run` | Start the service locally |
| `./mvnw clean package` | Build the executable JAR |
| `./mvnw test` | Run unit and integration tests |
| `curl -X POST -F "file=@test.txt" http://localhost:{port}/api/files/upload` | Upload a test file |

## Troubleshooting

- **Upload fails with 413**: The file exceeds `file.max-size-mb` — increase the limit or split the file
- **File not found**: Verify the file ID is correct and that soft-deleted files are excluded from queries
- **S3 connection errors**: Check `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are set and the bucket exists
- **Disk full**: Move to S3 backend or increase the local storage path capacity
